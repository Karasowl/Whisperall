"""Voice Isolator Service - ElevenLabs Audio Isolation API integration

Uses the audio isolation feature included in ElevenLabs Starter plan (30 min/month).
Removes background noise, music, and ambient sounds to isolate clean vocals.
"""

import requests
import io
import tempfile
import uuid
from pathlib import Path
from dataclasses import dataclass
from typing import Optional, Dict, Any
from threading import Thread

import numpy as np
import soundfile as sf

# Diagnostics
from diagnostics import log_function, error_context, log_info, log_error, set_job_id
from diagnostics.error_codes import ErrorCode


@dataclass
class IsolationJob:
    """Represents a voice isolation job"""
    id: str
    status: str  # pending, processing, completed, failed
    input_path: str
    provider: str = "elevenlabs"
    output_path: Optional[str] = None
    error: Optional[str] = None
    progress: float = 0.0


class VoiceIsolatorService:
    """Service for voice isolation using ElevenLabs Audio Isolation API"""

    API_URL = "https://api.elevenlabs.io/v1/audio-isolation"

    def __init__(self):
        self._jobs: Dict[str, IsolationJob] = {}

    def create_job(self, input_path: str, provider: str = "elevenlabs") -> str:
        """
        Create a voice isolation job.

        Args:
            input_path: Path to input audio file with background noise
            provider: Provider to use (elevenlabs, demucs)

        Returns:
            Job ID string
        """
        job_id = str(uuid.uuid4())[:8]

        job = IsolationJob(
            id=job_id,
            status="pending",
            input_path=input_path,
            provider=provider,
        )
        self._jobs[job_id] = job

        # Start processing in background
        thread = Thread(
            target=self._process_job,
            args=(job_id,),
            daemon=True
        )
        thread.start()

        return job_id

    def _process_job(self, job_id: str):
        """Process isolation job in background"""
        job = self._jobs.get(job_id)
        if not job:
            return

        set_job_id(job_id)
        job.status = "processing"
        job.progress = 0.1

        try:
            with error_context(provider=job.provider, job_id=job_id):
                log_info("voice_isolator", "_process_job", f"Starting isolation with {job.provider}", job_id=job_id)

                if job.provider == "elevenlabs":
                    self._process_elevenlabs(job)
                elif job.provider == "demucs":
                    self._process_demucs(job)
                else:
                    raise RuntimeError(f"Unknown provider: {job.provider}")

        except Exception as e:
            job.status = "failed"
            job.error = str(e)
            log_error("voice_isolator", "_process_job", f"Job {job_id} failed: {e}",
                      error_code=ErrorCode.VI_SEPARATION_FAILED, exception=e, job_id=job_id)

    def _process_elevenlabs(self, job: IsolationJob):
        """Process isolation using ElevenLabs API"""
        from settings_service import settings_service

        key = settings_service.get_api_key("elevenlabs")
        if not key:
            raise RuntimeError("ElevenLabs API key not configured")

        input_path = Path(job.input_path)
        if not input_path.exists():
            raise FileNotFoundError(f"Input file not found: {input_path}")

        job.progress = 0.2

        # Prepare form data
        with open(input_path, "rb") as f:
            files = {
                "audio": (input_path.name, f, "audio/mpeg")
            }

            job.progress = 0.3

            # Make API request
            resp = requests.post(
                self.API_URL,
                headers={"xi-api-key": key},
                files=files,
                timeout=300  # 5 min timeout for large files
            )

        job.progress = 0.8

        if resp.status_code != 200:
            error_msg = self._parse_error(resp)
            raise RuntimeError(f"API error: {error_msg}")

        # Save output
        output_dir = Path(tempfile.gettempdir()) / "whisperall" / "voice_isolator"
        output_dir.mkdir(parents=True, exist_ok=True)

        # Determine extension from content type
        content_type = resp.headers.get("content-type", "audio/mpeg")
        ext = "mp3" if "mpeg" in content_type else "wav"
        output_path = output_dir / f"isolated_{job.id}.{ext}"

        with open(output_path, "wb") as f:
            f.write(resp.content)

        job.output_path = str(output_path)
        job.status = "completed"
        job.progress = 1.0

        log_info("voice_isolator", "_process_elevenlabs", f"Job completed: {output_path}", job_id=job.id)

        # Save to history
        try:
            from history_service import get_history_service
            import librosa
            duration = librosa.get_duration(filename=str(output_path))
            history_svc = get_history_service()
            history_svc.save_voice_isolator_entry(
                input_audio_path=str(input_path),
                output_audio_path=str(output_path),
                provider="elevenlabs",
                duration_seconds=duration,
            )
        except Exception as he:
            log_error("voice_isolator", "_process_elevenlabs", f"Failed to save to history: {he}", job_id=job.id)

    def _process_demucs(self, job: IsolationJob):
        """Process isolation using Demucs (local model)"""
        try:
            import demucs.separate
            import torch
        except ImportError:
            raise RuntimeError("Demucs not installed. Run: pip install demucs")

        input_path = Path(job.input_path)
        if not input_path.exists():
            raise FileNotFoundError(f"Input file not found: {input_path}")

        job.progress = 0.2

        # Set up output directory
        output_dir = Path(tempfile.gettempdir()) / "whisperall" / "voice_isolator" / "demucs"
        output_dir.mkdir(parents=True, exist_ok=True)

        job.progress = 0.3

        # Use demucs to separate vocals
        # Demucs outputs: bass, drums, other, vocals
        device = "cuda" if torch.cuda.is_available() else "cpu"

        try:
            # Run demucs separation
            demucs.separate.main([
                "-n", "htdemucs",  # Model name
                "-o", str(output_dir),
                "--two-stems", "vocals",  # Only separate vocals
                "-d", device,
                str(input_path)
            ])
        except SystemExit:
            pass  # Demucs calls sys.exit on completion

        job.progress = 0.9

        # Find the vocals output
        stem_name = input_path.stem
        vocals_path = output_dir / "htdemucs" / stem_name / "vocals.wav"

        if not vocals_path.exists():
            raise RuntimeError("Demucs failed to generate vocals output")

        # Copy to final output path
        final_output = output_dir.parent / f"isolated_{job.id}.wav"
        import shutil
        shutil.copy(vocals_path, final_output)

        job.output_path = str(final_output)
        job.status = "completed"
        job.progress = 1.0

        log_info("voice_isolator", "_process_demucs", f"Job completed: {final_output}", job_id=job.id)

        # Save to history
        try:
            from history_service import get_history_service
            import librosa
            duration = librosa.get_duration(filename=str(final_output))
            history_svc = get_history_service()
            history_svc.save_voice_isolator_entry(
                input_audio_path=str(input_path),
                output_audio_path=str(final_output),
                provider="demucs",
                duration_seconds=duration,
            )
        except Exception as he:
            log_error("voice_isolator", "_process_demucs", f"Failed to save to history: {he}", job_id=job.id)

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

    def get_job(self, job_id: str) -> Optional[IsolationJob]:
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

    def isolate_sync(self, input_path: str) -> tuple[np.ndarray, int]:
        """
        Synchronous voice isolation - returns audio directly.

        Args:
            input_path: Path to input audio file

        Returns:
            Tuple of (isolated_audio_array, sample_rate)
        """
        from settings_service import settings_service

        key = settings_service.get_api_key("elevenlabs")
        if not key:
            raise RuntimeError("ElevenLabs API key not configured")

        input_path = Path(input_path)
        if not input_path.exists():
            raise FileNotFoundError(f"Input file not found: {input_path}")

        with open(input_path, "rb") as f:
            files = {"audio": (input_path.name, f, "audio/mpeg")}

            resp = requests.post(
                self.API_URL,
                headers={"xi-api-key": key},
                files=files,
                timeout=300
            )

        if resp.status_code != 200:
            error_msg = self._parse_error(resp)
            raise RuntimeError(f"ElevenLabs Voice Isolator error: {error_msg}")

        # Decode audio response
        audio_bytes = io.BytesIO(resp.content)
        try:
            audio, sr = sf.read(audio_bytes)
        except Exception:
            # Fallback: try as raw PCM
            audio = np.frombuffer(resp.content, dtype=np.int16).astype(np.float32)
            audio = audio / 32768.0
            sr = 44100

        if audio.dtype != np.float32:
            audio = audio.astype(np.float32)

        return audio, sr

    def isolate_and_save(self, input_path: str, output_path: str) -> str:
        """
        Isolate voice and save to file.

        Args:
            input_path: Path to input audio file
            output_path: Path to save isolated audio

        Returns:
            Path to saved file
        """
        audio, sr = self.isolate_sync(input_path)

        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        sf.write(str(output_path), audio, sr)
        return str(output_path)


# Singleton instance
_service: Optional[VoiceIsolatorService] = None


def get_voice_isolator_service() -> VoiceIsolatorService:
    """Get the voice isolator service singleton"""
    global _service
    if _service is None:
        _service = VoiceIsolatorService()
    return _service
