"""
Transcription Service - Long-form transcription with faster-whisper.
Supports files up to 5 hours with segment-level timestamps and progress callbacks.
"""

from __future__ import annotations

import uuid
from pathlib import Path
from typing import Callable, Optional

from settings_service import settings_service

# Diagnostics
from diagnostics import log_function, error_context, log_info
from diagnostics.error_codes import ErrorCode


class TranscriptionService:
    """Service for long-form audio/video transcription with progress tracking."""

    def __init__(self):
        self._models = {}

    def _normalize_model_size(self, model_size: str) -> str:
        model_size = (model_size or "base").strip()
        if model_size.startswith("faster-whisper-"):
            model_size = model_size.replace("faster-whisper-", "")
        if model_size.startswith("faster-distil-whisper-"):
            model_size = model_size.replace("faster-distil-whisper-", "distil-")
        if model_size in ("distil-whisper-large-v3", "faster-distil-whisper-large-v3"):
            return "distil-large-v3"
        return model_size

    def _detect_device(self, requested: Optional[str] = None) -> str:
        """Detect best available device (CUDA preferred)."""
        if requested and requested != "auto":
            return requested
        try:
            import torch
            if torch.cuda.is_available():
                return "cuda"
        except Exception:
            pass
        return "cpu"

    def _compute_type(self, device: str) -> str:
        """Get optimal compute type for device."""
        return "float16" if device == "cuda" else "int8"

    @log_function(module="transcription", error_code=ErrorCode.STT_MODEL_LOAD_FAILED)
    def _load_model(self, model_size: str, device: str):
        """Lazy load faster-whisper model with caching."""
        model_size = self._normalize_model_size(model_size)
        cache_key = f"{model_size}_{device}"
        if cache_key in self._models:
            return self._models[cache_key]

        with error_context(model=model_size, device=device):
            try:
                from faster_whisper import WhisperModel
            except ImportError as exc:
                raise RuntimeError(
                    "Speech recognition engine not available. Visit the Models page to install required components."
                ) from exc

            log_info("transcription", "_load_model", f"Loading model {model_size} on {device}")
            model = WhisperModel(
                model_size,
                device=device,
                compute_type=self._compute_type(device)
            )
            self._models[cache_key] = model
            return model

    @log_function(module="transcription", error_code=ErrorCode.STT_TRANSCRIPTION_FAILED)
    def transcribe(
        self,
        audio_path: Path,
        language: str = "auto",
        model_size: str = "base",
        prompt: Optional[str] = None,
        progress_callback: Optional[Callable[[float, str], None]] = None,
        segment_callback: Optional[Callable[[dict, list], bool]] = None
    ) -> tuple[list[dict], dict]:
        """
        Transcribe audio file with segment-level timestamps.

        Args:
            audio_path: Path to audio file
            language: Language code or "auto" for detection
            model_size: Whisper model size (tiny, base, small, medium, large-v3)
            prompt: Optional initial prompt for context
            progress_callback: Optional callback(progress_percent, status_message)
            segment_callback: Optional callback(new_segment, all_segments) -> continue
                              Called for each segment. Return False to cancel.

        Returns:
            Tuple of (segments_list, metadata_dict)
            Each segment: {id, start_time, end_time, text, words, confidence}
        """
        model_size = self._normalize_model_size(model_size)
        device = self._detect_device(
            settings_service.get("providers.stt.faster_whisper.device", "auto")
        )

        # Set error context for the entire transcription
        with error_context(model=model_size, device=device, language=language):
            if progress_callback:
                progress_callback(5, f"Loading {model_size} model...")

            print(f"[Transcription] Loading model {model_size} on {device}...")
            import sys
            sys.stdout.flush()
            model = self._load_model(model_size, device)
            print(f"[Transcription] Model loaded, calling model.transcribe()...")
            sys.stdout.flush()

            if progress_callback:
                progress_callback(10, "Starting transcription...")

            lang = None if language == "auto" else language

            # Transcribe with word-level timestamps
            print(f"[Transcription] Calling model.transcribe() with language={lang}...")
            sys.stdout.flush()
            segments_iter, info = model.transcribe(
                str(audio_path),
                language=lang,
                vad_filter=True,
                vad_parameters={"min_silence_duration_ms": 500},
                initial_prompt=prompt or None,
                word_timestamps=True,
                condition_on_previous_text=True
            )

            total_duration = info.duration
            segments = []
            processed_duration = 0.0
            print(f"[Transcription] Total duration: {total_duration:.1f}s, starting segment iteration...")
            sys.stdout.flush()

            segment_count = 0
            for seg in segments_iter:
                segment_count += 1
                if segment_count <= 3 or segment_count % 50 == 0:
                    print(f"[Transcription] Segment {segment_count}: {seg.start:.1f}s - {seg.end:.1f}s")
                    sys.stdout.flush()
                # Build segment with word-level data
                words = []
                if seg.words:
                    for w in seg.words:
                        words.append({
                            "word": w.word,
                            "start": w.start,
                            "end": w.end,
                            "probability": w.probability
                        })

                # Calculate average confidence from word probabilities
                confidence = 1.0
                if words:
                    probs = [w["probability"] for w in words if w["probability"] is not None]
                    if probs:
                        confidence = sum(probs) / len(probs)

                segment = {
                    "id": str(uuid.uuid4())[:8],
                    "start_time": seg.start,
                    "end_time": seg.end,
                    "text": seg.text.strip(),
                    "words": words,
                    "confidence": confidence
                }
                segments.append(segment)

                # Call segment callback for live preview / cancellation check
                if segment_callback:
                    should_continue = segment_callback(segment, segments)
                    if not should_continue:
                        print(f"[Transcription] Cancelled at segment {segment_count}")
                        break

                # Update progress with granular float (like Windows file copy)
                processed_duration = seg.end
                if progress_callback and total_duration > 0:
                    # Progress from 10% to 80% during transcription (70% range)
                    pct = 10.0 + (processed_duration / total_duration) * 70.0
                    elapsed_min = int(processed_duration / 60)
                    total_min = int(total_duration / 60)
                    progress_callback(
                        min(pct, 80.0),
                        f"Transcribing... {elapsed_min}:{int(processed_duration % 60):02d} / {total_min}:{int(total_duration % 60):02d}"
                    )

            metadata = {
                "language": info.language,
                "language_probability": info.language_probability,
                "duration": info.duration,
                "model": model_size,
                "device": device,
                "num_segments": len(segments)
            }

            if progress_callback:
                progress_callback(100, "Transcription complete")

            return segments, metadata

    def estimate_time(self, duration_seconds: float, model_size: str) -> float:
        """
        Estimate transcription time based on RTX 4060 benchmarks.

        Returns estimated seconds to process.
        """
        model_size = self._normalize_model_size(model_size)
        # Speed multipliers (how much faster than realtime)
        # Based on RTX 4060 with CUDA float16
        speed_multipliers = {
            "tiny": 60,
            "base": 40,
            "small": 25,
            "medium": 12,
            "large-v3": 6,
            "large": 6
        }

        multiplier = speed_multipliers.get(model_size, 20)

        # Add overhead for loading, diarization, etc
        base_time = duration_seconds / multiplier
        overhead = 30  # 30 seconds base overhead

        return base_time + overhead


# Singleton instance
_service: Optional[TranscriptionService] = None


def get_transcription_service() -> TranscriptionService:
    """Get singleton transcription service instance."""
    global _service
    if _service is None:
        _service = TranscriptionService()
    return _service
