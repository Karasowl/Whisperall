"""Voice Changer Service - ElevenLabs Speech-to-Speech API integration

Uses the voice changer feature included in ElevenLabs Starter plan (30 min/month).
Transform any voice recording into a different voice while preserving emotion and content.
"""

import requests
import io
import tempfile
import uuid
from pathlib import Path
from dataclasses import dataclass
from typing import Optional, Dict, Any, List
from threading import Thread

import numpy as np
import soundfile as sf

# Diagnostics
from diagnostics import log_function, error_context, log_info, log_error, set_job_id
from diagnostics.error_codes import ErrorCode


@dataclass
class VoiceChangerJob:
    """Represents a voice changing job"""
    id: str
    status: str  # pending, processing, completed, failed
    input_path: str
    voice_id: str
    output_path: Optional[str] = None
    error: Optional[str] = None
    progress: float = 0.0


class VoiceChangerService:
    """Service for voice transformation using ElevenLabs Speech-to-Speech API"""

    API_URL = "https://api.elevenlabs.io/v1/speech-to-speech"

    def __init__(self):
        self._jobs: Dict[str, VoiceChangerJob] = {}

    def get_available_voices(self) -> List[Dict[str, Any]]:
        """Get list of available voices from ElevenLabs"""
        from settings_service import settings_service

        key = settings_service.get_api_key("elevenlabs")
        if not key:
            return []

        try:
            resp = requests.get(
                "https://api.elevenlabs.io/v1/voices",
                headers={"xi-api-key": key},
                timeout=30
            )
            if resp.status_code == 200:
                data = resp.json()
                voices = []
                for voice in data.get("voices", []):
                    # Only include voices that support speech-to-speech
                    voices.append({
                        "voice_id": voice["voice_id"],
                        "name": voice["name"],
                        "category": voice.get("category", "unknown"),
                        "preview_url": voice.get("preview_url"),
                        "labels": voice.get("labels", {}),
                    })
                return voices
        except Exception as e:
            print(f"[VoiceChanger] Failed to fetch voices: {e}")

        return []

    def create_job(
        self,
        input_path: str,
        voice_id: str,
        model_id: str = "eleven_english_sts_v2",
        stability: float = 0.5,
        similarity_boost: float = 0.75,
        style: float = 0.0,
        remove_background_noise: bool = False,
        output_format: str = "mp3_44100_128",
    ) -> str:
        """
        Create a voice changer job.

        Args:
            input_path: Path to input audio file
            voice_id: Target voice ID from ElevenLabs
            model_id: Model to use (eleven_english_sts_v2 or eleven_multilingual_sts_v2)
            stability: Voice stability (0-1)
            similarity_boost: Similarity to original voice (0-1)
            style: Style exaggeration (0-1)
            remove_background_noise: Apply noise removal before conversion
            output_format: Output audio format

        Returns:
            Job ID string
        """
        job_id = str(uuid.uuid4())[:8]

        job = VoiceChangerJob(
            id=job_id,
            status="pending",
            input_path=input_path,
            voice_id=voice_id,
        )
        self._jobs[job_id] = job

        # Start processing in background
        thread = Thread(
            target=self._process_job,
            args=(job_id, model_id, stability, similarity_boost, style,
                  remove_background_noise, output_format),
            daemon=True
        )
        thread.start()

        return job_id

    def _process_job(
        self,
        job_id: str,
        model_id: str,
        stability: float,
        similarity_boost: float,
        style: float,
        remove_background_noise: bool,
        output_format: str,
    ):
        """Process voice changer job in background"""
        from settings_service import settings_service

        job = self._jobs.get(job_id)
        if not job:
            return

        set_job_id(job_id)
        job.status = "processing"
        job.progress = 0.1

        try:
            with error_context(
                provider="elevenlabs",
                model=model_id,
                job_id=job_id,
                voice_id=job.voice_id,
            ):
                key = settings_service.get_api_key("elevenlabs")
                if not key:
                    raise RuntimeError("ElevenLabs API key not configured")

                input_path = Path(job.input_path)
                if not input_path.exists():
                    raise FileNotFoundError(f"Input file not found: {input_path}")

                job.progress = 0.2
                log_info("voice_changer", "_process_job", "Starting voice conversion", job_id=job_id)

                # Prepare voice settings
                voice_settings = {
                    "stability": stability,
                    "similarity_boost": similarity_boost,
                    "style": style,
                    "use_speaker_boost": True,
                }

                # Prepare form data
                files = {
                    "audio": (input_path.name, open(input_path, "rb"), "audio/mpeg")
                }
                data = {
                    "model_id": model_id,
                    "voice_settings": str(voice_settings).replace("'", '"'),
                }

                if remove_background_noise:
                    data["remove_background_noise"] = "true"

                job.progress = 0.3

                # Make API request
                resp = requests.post(
                    f"{self.API_URL}/{job.voice_id}?output_format={output_format}",
                    headers={"xi-api-key": key},
                    files=files,
                    data=data,
                    timeout=300  # 5 min timeout for large files
                )

                files["audio"][1].close()

                job.progress = 0.8

                if resp.status_code != 200:
                    error_msg = self._parse_error(resp)
                    raise RuntimeError(f"API error: {error_msg}")

                # Save output
                output_dir = Path(tempfile.gettempdir()) / "whisperall" / "voice_changer"
                output_dir.mkdir(parents=True, exist_ok=True)

                ext = "mp3" if "mp3" in output_format else "wav"
                output_path = output_dir / f"vc_{job_id}.{ext}"

                with open(output_path, "wb") as f:
                    f.write(resp.content)

                job.output_path = str(output_path)
                job.status = "completed"
                job.progress = 1.0

                log_info("voice_changer", "_process_job", f"Job completed: {output_path}", job_id=job_id)

                # Save to history
                try:
                    from history_service import get_history_service
                    import librosa
                    duration = librosa.get_duration(filename=str(output_path))
                    history_svc = get_history_service()
                    history_svc.save_voice_changer_entry(
                        input_audio_path=str(input_path),
                        output_audio_path=str(output_path),
                        provider="elevenlabs",
                        model=model_id,
                        target_voice_id=job.voice_id,
                        duration_seconds=duration,
                    )
                except Exception as he:
                    log_error("voice_changer", "_process_job", f"Failed to save to history: {he}", job_id=job_id)

        except Exception as e:
            job.status = "failed"
            job.error = str(e)
            log_error("voice_changer", "_process_job", f"Job {job_id} failed: {e}",
                      error_code=ErrorCode.VC_CONVERSION_FAILED, exception=e, job_id=job_id)

    def _parse_error(self, resp) -> str:
        """Parse error response from API"""
        try:
            data = resp.json()
            detail = data.get("detail", {})
            if isinstance(detail, dict):
                return detail.get("message", str(detail))
            return str(detail)
        except Exception:
            return f"HTTP {resp.status_code}: {resp.text[:200]}"

    def get_job(self, job_id: str) -> Optional[VoiceChangerJob]:
        """Get job status"""
        return self._jobs.get(job_id)

    def get_job_status(self, job_id: str) -> Dict[str, Any]:
        """Get job status as dictionary"""
        job = self._jobs.get(job_id)
        if not job:
            return {"error": "Job not found"}

        return {
            "id": job.id,
            "status": job.status,
            "progress": job.progress,
            "output_path": job.output_path,
            "error": job.error,
        }

    def convert_sync(
        self,
        input_path: str,
        voice_id: str,
        model_id: str = "eleven_english_sts_v2",
        stability: float = 0.5,
        similarity_boost: float = 0.75,
        style: float = 0.0,
        remove_background_noise: bool = False,
    ) -> tuple[np.ndarray, int]:
        """
        Synchronous voice conversion - returns audio directly.

        For small files where you want immediate results.
        """
        from settings_service import settings_service

        key = settings_service.get_api_key("elevenlabs")
        if not key:
            raise RuntimeError("ElevenLabs API key not configured")

        input_path = Path(input_path)
        if not input_path.exists():
            raise FileNotFoundError(f"Input file not found: {input_path}")

        voice_settings = {
            "stability": stability,
            "similarity_boost": similarity_boost,
            "style": style,
            "use_speaker_boost": True,
        }

        files = {
            "audio": (input_path.name, open(input_path, "rb"), "audio/mpeg")
        }
        data = {
            "model_id": model_id,
            "voice_settings": str(voice_settings).replace("'", '"'),
        }

        if remove_background_noise:
            data["remove_background_noise"] = "true"

        try:
            resp = requests.post(
                f"{self.API_URL}/{voice_id}?output_format=pcm_44100",
                headers={"xi-api-key": key},
                files=files,
                data=data,
                timeout=300
            )
        finally:
            files["audio"][1].close()

        if resp.status_code != 200:
            error_msg = self._parse_error(resp)
            raise RuntimeError(f"ElevenLabs Voice Changer error: {error_msg}")

        # Convert PCM bytes to numpy array
        audio = np.frombuffer(resp.content, dtype=np.int16).astype(np.float32)
        audio = audio / 32768.0  # Normalize to [-1, 1]

        return audio, 44100


# Singleton instance
_service: Optional[VoiceChangerService] = None


def get_voice_changer_service() -> VoiceChangerService:
    """Get the voice changer service singleton"""
    global _service
    if _service is None:
        _service = VoiceChangerService()
    return _service
