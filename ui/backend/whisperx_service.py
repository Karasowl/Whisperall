"""
WhisperX Service - Accurate transcription with word-level alignment and diarization.
Uses whisperx library for integrated transcription + alignment + speaker assignment.
"""

from __future__ import annotations
import uuid
import subprocess
import tempfile
from pathlib import Path
from typing import Callable, Optional, List, Dict, Any, Tuple
import os

# Lazy import whisperx to allow graceful fallback if not installed
_whisperx = None

def _get_whisperx():
    """Lazy load whisperx module."""
    global _whisperx
    if _whisperx is None:
        try:
            import whisperx
            _whisperx = whisperx
        except ImportError:
            raise ImportError(
                "Advanced transcription (WhisperX) is not available. "
                "Use the standard Fast engine, or visit the Models page for installation options."
            )
    return _whisperx


def is_whisperx_available() -> bool:
    """Check if whisperx is installed and available."""
    try:
        import whisperx
        return True
    except ImportError:
        return False


class WhisperXService:
    """Service for accurate transcription using WhisperX pipeline."""

    def __init__(self):
        self._model = None
        self._align_model = None
        self._align_metadata = None
        self._diarize_model = None
        self._current_model_size = None
        self._current_language = None
        self._current_device = None

    def _normalize_model_size(self, model_size: str) -> str:
        model_size = (model_size or "large-v3").strip()
        if model_size.startswith("faster-whisper-"):
            model_size = model_size.replace("faster-whisper-", "")
        if model_size.startswith("faster-distil-whisper-"):
            model_size = model_size.replace("faster-distil-whisper-", "distil-")
        if model_size in ("distil-whisper-large-v3", "faster-distil-whisper-large-v3"):
            # WhisperX does not support distil weights; use large-v3.
            return "large-v3"
        return model_size

    def _detect_device(self) -> str:
        """Detect best available device."""
        import torch
        if torch.cuda.is_available():
            return "cuda"
        return "cpu"

    def _compute_type(self, device: str) -> str:
        """Get optimal compute type for device."""
        return "float16" if device == "cuda" else "int8"

    def _load_model(self, model_size: str, device: str):
        """Load WhisperX transcription model (cached)."""
        if (self._model is not None and
            self._current_model_size == model_size and
            self._current_device == device):
            return self._model

        whisperx = _get_whisperx()
        print(f"[WhisperX] Loading model {model_size} on {device}...")

        self._model = whisperx.load_model(
            model_size,
            device,
            compute_type=self._compute_type(device)
        )
        self._current_model_size = model_size
        self._current_device = device
        return self._model

    def _load_align_model(self, language_code: str, device: str):
        """Load wav2vec2 alignment model for specific language (cached)."""
        if (self._align_model is not None and
            self._current_language == language_code):
            return self._align_model, self._align_metadata

        whisperx = _get_whisperx()
        print(f"[WhisperX] Loading alignment model for {language_code}...")

        self._align_model, self._align_metadata = whisperx.load_align_model(
            language_code=language_code,
            device=device
        )
        self._current_language = language_code
        return self._align_model, self._align_metadata

    def _load_diarize_model(self, device: str):
        """Load diarization pipeline (requires HF token, cached)."""
        if self._diarize_model is not None:
            return self._diarize_model

        # Try to get HF token from various sources
        from settings_service import settings_service
        hf_token = (
            os.environ.get("HF_TOKEN") or
            os.environ.get("HUGGING_FACE_HUB_TOKEN") or
            settings_service.get("api_keys.huggingface")
        )

        if not hf_token:
            print("[WhisperX] No HuggingFace token found, diarization disabled")
            return None

        whisperx = _get_whisperx()
        print("[WhisperX] Loading diarization pipeline...")

        self._diarize_model = whisperx.DiarizationPipeline(
            use_auth_token=hf_token,
            device=device
        )
        return self._diarize_model

    def transcribe(
        self,
        audio_path: Path,
        language: str = "auto",
        model_size: str = "large-v3",
        enable_diarization: bool = True,
        min_speakers: int = 1,
        max_speakers: int = 10,
        batch_size: int = 16,
        progress_callback: Optional[Callable[[float, str], None]] = None,
        segment_callback: Optional[Callable[[dict, list], bool]] = None,
        check_cancelled: Optional[Callable[[], None]] = None
    ) -> Tuple[List[Dict], Dict]:
        """
        Full WhisperX pipeline: transcribe -> align -> diarize.

        Args:
            audio_path: Path to audio file
            language: Language code or "auto" for detection
            model_size: Whisper model size (tiny, base, small, medium, large-v3)
            enable_diarization: Whether to identify speakers
            min_speakers: Minimum expected speakers
            max_speakers: Maximum expected speakers
            batch_size: Batch size for transcription (lower = less VRAM)
            progress_callback: Called with (progress_pct, step_description)
            segment_callback: Called with (new_segment, all_segments) - return False to stop
            check_cancelled: Called to check if job was cancelled, raises if so

        Returns:
            Tuple of (segments_list, metadata_dict)
        """
        whisperx = _get_whisperx()
        device = self._detect_device()
        model_size = self._normalize_model_size(model_size)

        # Step 1: Load audio
        if progress_callback:
            progress_callback(5, "Loading audio...")
        if check_cancelled:
            check_cancelled()

        audio = whisperx.load_audio(str(audio_path))
        audio_duration = len(audio) / 16000  # WhisperX uses 16kHz

        # Step 2: Load model and transcribe
        if progress_callback:
            progress_callback(10, f"Loading {model_size} model...")
        if check_cancelled:
            check_cancelled()

        model = self._load_model(model_size, device)

        if progress_callback:
            progress_callback(15, "Transcribing with batched inference...")
        if check_cancelled:
            check_cancelled()

        # Transcribe with batched inference
        result = model.transcribe(
            audio,
            batch_size=batch_size,
            language=None if language == "auto" else language
        )

        detected_language = result.get("language", "en")
        print(f"[WhisperX] Detected language: {detected_language}")

        if check_cancelled:
            check_cancelled()

        # Step 3: Align for word-level timestamps
        if progress_callback:
            progress_callback(50, f"Aligning words with wav2vec2...")

        try:
            align_model, align_metadata = self._load_align_model(
                detected_language, device
            )
            if check_cancelled:
                check_cancelled()

            result = whisperx.align(
                result["segments"],
                align_model,
                align_metadata,
                audio,
                device,
                return_char_alignments=False
            )
            print(f"[WhisperX] Alignment complete")
        except Exception as e:
            print(f"[WhisperX] Alignment failed: {e}, continuing without word alignment")

        if check_cancelled:
            check_cancelled()

        # Step 4: Diarization (optional)
        speakers_detected = 0
        diarization_performed = False
        diarization_error = None
        if enable_diarization:
            if progress_callback:
                progress_callback(70, "Running speaker diarization...")

            diarize_model = self._load_diarize_model(device)
            if diarize_model is not None:
                try:
                    if check_cancelled:
                        check_cancelled()

                    diarize_segments = diarize_model(
                        audio,
                        min_speakers=min_speakers,
                        max_speakers=max_speakers
                    )

                    if progress_callback:
                        progress_callback(85, "Assigning speakers to words...")

                    if check_cancelled:
                        check_cancelled()

                    # Assign speakers at word level
                    result = whisperx.assign_word_speakers(
                        diarize_segments,
                        result
                    )

                    # Count unique speakers
                    speakers = set()
                    for seg in result.get("segments", []):
                        if "speaker" in seg:
                            speakers.add(seg["speaker"])
                        for w in seg.get("words", []):
                            if "speaker" in w:
                                speakers.add(w["speaker"])
                    speakers_detected = len(speakers)
                    diarization_performed = True
                    print(f"[WhisperX] Detected {speakers_detected} speakers")

                except Exception as e:
                    diarization_error = str(e)
                    print(f"[WhisperX] Diarization failed: {e}")
            else:
                diarization_error = "Diarization model not available"

        # Step 5: Convert to standard segment format
        if progress_callback:
            progress_callback(95, "Formatting output...")

        segments = self._normalize_output(result, enable_diarization)

        # Call segment_callback for each segment (for live preview)
        if segment_callback:
            all_segments = []
            for seg in segments:
                all_segments.append(seg)
                should_continue = segment_callback(seg, all_segments)
                if should_continue is False:
                    break

        metadata = {
            "language": detected_language,
            "duration": audio_duration,
            "model": model_size,
            "device": device,
            "engine": "whisperx",
            "num_segments": len(segments),
            "speakers_detected": speakers_detected,
            "diarization_performed": diarization_performed,
            "diarization_error": diarization_error
        }

        if progress_callback:
            progress_callback(100, "Transcription complete")

        return segments, metadata

    def _normalize_output(
        self,
        whisperx_result: dict,
        include_speakers: bool
    ) -> List[Dict]:
        """
        Convert WhisperX output to standard segment format.

        Standard format matches faster-whisper output:
        {
            "id": str,
            "start_time": float,
            "end_time": float,
            "text": str,
            "speaker": str,
            "speaker_id": int,
            "confidence": float,
            "words": list[{word, start, end, probability, speaker?, speaker_id?}]
        }
        """
        segments = []
        speaker_map = {}  # Map speaker labels to numeric IDs

        for seg in whisperx_result.get("segments", []):
            # Determine segment speaker (from segment or majority vote from words)
            segment_speaker = seg.get("speaker", "SPEAKER_00")

            # Map speaker label to numeric ID
            if segment_speaker not in speaker_map:
                speaker_map[segment_speaker] = len(speaker_map)
            speaker_id = speaker_map[segment_speaker]

            # Process words with speaker info
            words = []
            if "words" in seg:
                for w in seg["words"]:
                    word_speaker = w.get("speaker", segment_speaker)
                    if word_speaker not in speaker_map:
                        speaker_map[word_speaker] = len(speaker_map)
                    word_speaker_id = speaker_map[word_speaker]

                    word_data = {
                        "word": w.get("word", ""),
                        "start": w.get("start", 0),
                        "end": w.get("end", 0),
                        "probability": w.get("score", 1.0),
                    }

                    # Add speaker info at word level if diarization enabled
                    if include_speakers:
                        word_data["speaker"] = f"Speaker {word_speaker_id + 1}"
                        word_data["speaker_id"] = word_speaker_id

                    words.append(word_data)

            # Calculate confidence from word scores
            confidence = 1.0
            if words:
                scores = [w["probability"] for w in words if w.get("probability")]
                if scores:
                    confidence = sum(scores) / len(scores)

            segment = {
                "id": str(uuid.uuid4())[:8],
                "start_time": seg.get("start", 0),
                "end_time": seg.get("end", 0),
                "text": seg.get("text", "").strip(),
                "speaker": f"Speaker {speaker_id + 1}" if include_speakers else "Speaker 1",
                "speaker_id": speaker_id if include_speakers else 0,
                "confidence": confidence,
                "words": words
            }
            segments.append(segment)

        return segments

    def transcribe_partial(
        self,
        audio_path: Path,
        start_time: float,
        language: str,
        model_size: str,
        **kwargs
    ) -> Tuple[List[Dict], Dict]:
        """
        Transcribe from a specific time offset (for resume functionality).

        WhisperX processes full audio, so we extract the remaining segment
        and adjust timestamps afterward.

        Args:
            audio_path: Path to original audio file
            start_time: Time offset to start from (seconds)
            language: Language code
            model_size: Whisper model size
            **kwargs: Additional args passed to transcribe()

        Returns:
            Tuple of (segments_list, metadata_dict) with adjusted timestamps
        """
        # Extract audio from start_time to end using ffmpeg
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp_path = Path(tmp.name)

        try:
            ffmpeg_cmd = [
                "ffmpeg", "-y",
                "-ss", str(start_time),
                "-i", str(audio_path),
                "-vn",
                "-acodec", "pcm_s16le",
                "-ar", "16000",
                "-ac", "1",
                str(tmp_path)
            ]

            print(f"[WhisperX] Extracting audio from {start_time}s...")
            subprocess.run(ffmpeg_cmd, capture_output=True, check=True)

            # Transcribe the extracted segment
            segments, metadata = self.transcribe(
                tmp_path,
                language=language,
                model_size=model_size,
                **kwargs
            )

            # Adjust timestamps to account for start offset
            for seg in segments:
                seg["start_time"] += start_time
                seg["end_time"] += start_time
                if seg.get("words"):
                    for w in seg["words"]:
                        if "start" in w:
                            w["start"] += start_time
                        if "end" in w:
                            w["end"] += start_time

            return segments, metadata

        finally:
            # Clean up temp file
            try:
                tmp_path.unlink()
            except:
                pass


# Singleton instance
_service: Optional[WhisperXService] = None


def get_whisperx_service() -> WhisperXService:
    """Get or create the WhisperX service singleton."""
    global _service
    if _service is None:
        _service = WhisperXService()
    return _service
