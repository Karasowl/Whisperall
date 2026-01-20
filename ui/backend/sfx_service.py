"""
Sound Effects Generation Service
Handles video-to-audio SFX generation using MMAudio and other providers
"""

from __future__ import annotations

import uuid
from pathlib import Path
from typing import Optional, Dict, Any, List
from dataclasses import dataclass
from enum import Enum
import numpy as np
import soundfile as sf
import threading
import time
import shutil

from app_paths import get_output_dir, get_temp_dir
from settings_service import settings_service


class SFXJobStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class SFXJob:
    """Represents a sound effects generation job"""
    id: str
    status: SFXJobStatus
    progress: float = 0.0
    video_path: str = ""
    prompt: str = ""
    provider: str = "mmaudio"
    model: str = ""
    output_audio_path: Optional[str] = None
    output_video_path: Optional[str] = None
    error: Optional[str] = None
    created_at: float = 0.0
    completed_at: Optional[float] = None


class SFXService:
    """Service for sound effects generation"""

    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
        self._jobs: Dict[str, SFXJob] = {}
        self._output_dir = get_output_dir() / "sfx"
        self._temp_dir = get_temp_dir() / "sfx"
        self._output_dir.mkdir(parents=True, exist_ok=True)
        self._temp_dir.mkdir(parents=True, exist_ok=True)

    def get_providers(self) -> List[Dict[str, Any]]:
        """Get list of available SFX providers"""
        try:
            from sfx_providers import get_all_provider_info
            from sfx_providers.registry import is_provider_ready

            providers = []
            for provider_id, info in get_all_provider_info().items():
                providers.append({
                    "id": info.id,
                    "name": info.name,
                    "description": info.description,
                    "vram_gb": info.vram_requirement_gb,
                    "models": info.models,
                    "default_model": info.default_model,
                    "max_video_duration_seconds": info.max_video_duration_seconds,
                    "supports_prompt": info.supports_prompt,
                    "ready": is_provider_ready(provider_id),
                })
            return providers
        except ImportError:
            return []

    def create_job(
        self,
        video_path: str,
        prompt: str = "",
        provider: str = "mmaudio",
        model: Optional[str] = None,
        merge_with_video: bool = True,
        mix_original: bool = False,
        original_volume: float = 0.3,
        **kwargs
    ) -> str:
        """Create a new SFX generation job"""
        job_id = str(uuid.uuid4())[:8]

        # Validate video exists
        video_path = Path(video_path)
        if not video_path.exists():
            raise FileNotFoundError(f"Video not found: {video_path}")

        job = SFXJob(
            id=job_id,
            status=SFXJobStatus.PENDING,
            video_path=str(video_path),
            prompt=prompt,
            provider=provider,
            model=model or "",
            created_at=time.time(),
        )
        self._jobs[job_id] = job

        # Start generation in background thread
        thread = threading.Thread(
            target=self._run_generation,
            args=(job_id, merge_with_video, mix_original, original_volume, kwargs),
            daemon=True
        )
        thread.start()

        return job_id

    def _run_generation(
        self,
        job_id: str,
        merge_with_video: bool,
        mix_original: bool,
        original_volume: float,
        extra_params: dict
    ):
        """Run SFX generation in background"""
        job = self._jobs.get(job_id)
        if not job:
            return

        try:
            job.status = SFXJobStatus.PROCESSING
            job.progress = 0.1

            from sfx_providers import get_provider

            # Get provider
            provider = get_provider(job.provider)

            # Load model if needed
            if not provider.is_loaded():
                job.progress = 0.2
                provider.load(job.model if job.model else None)

            job.progress = 0.3

            # Generate sound effects
            audio, sample_rate = provider.generate(
                video_path=job.video_path,
                prompt=job.prompt if job.prompt else None,
                model=job.model if job.model else None,
                **extra_params
            )

            job.progress = 0.8

            # Save audio
            audio_filename = f"sfx_{job_id}_{int(time.time())}.wav"
            audio_path = self._output_dir / audio_filename
            sf.write(str(audio_path), audio, sample_rate)
            job.output_audio_path = str(audio_path)

            # Optionally merge with video
            if merge_with_video:
                job.progress = 0.9
                video_filename = f"sfx_video_{job_id}_{int(time.time())}.mp4"
                video_output_path = self._output_dir / video_filename

                provider.merge_audio_with_video(
                    video_path=job.video_path,
                    audio=audio,
                    sample_rate=sample_rate,
                    output_path=str(video_output_path),
                    mix_original=mix_original,
                    original_volume=original_volume,
                )

                job.output_video_path = str(video_output_path)

            job.status = SFXJobStatus.COMPLETED
            job.progress = 1.0
            job.completed_at = time.time()

        except Exception as e:
            job.status = SFXJobStatus.FAILED
            job.error = str(e)
            print(f"[SFXService] Job {job_id} failed: {e}")

    def get_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Get job status"""
        job = self._jobs.get(job_id)
        if not job:
            return None

        return {
            "id": job.id,
            "status": job.status.value,
            "progress": job.progress,
            "video_path": job.video_path,
            "prompt": job.prompt,
            "provider": job.provider,
            "model": job.model,
            "output_audio_path": job.output_audio_path,
            "output_video_path": job.output_video_path,
            "error": job.error,
            "created_at": job.created_at,
            "completed_at": job.completed_at,
        }

    def cancel_job(self, job_id: str) -> bool:
        """Cancel a pending or processing job"""
        job = self._jobs.get(job_id)
        if not job:
            return False

        if job.status in [SFXJobStatus.PENDING, SFXJobStatus.PROCESSING]:
            job.status = SFXJobStatus.CANCELLED
            return True

        return False

    def list_jobs(self, limit: int = 20) -> List[Dict[str, Any]]:
        """List recent jobs"""
        jobs = sorted(
            self._jobs.values(),
            key=lambda j: j.created_at,
            reverse=True
        )[:limit]

        return [self.get_job(j.id) for j in jobs]

    def upload_video(self, file_content: bytes, filename: str) -> str:
        """Upload a video file for processing"""
        # Generate unique filename
        ext = Path(filename).suffix or ".mp4"
        unique_filename = f"upload_{uuid.uuid4().hex[:8]}{ext}"
        file_path = self._temp_dir / unique_filename

        with open(file_path, "wb") as f:
            f.write(file_content)

        return str(file_path)


# Global instance
_service: Optional[SFXService] = None


def get_sfx_service() -> SFXService:
    """Get SFX service instance"""
    global _service
    if _service is None:
        _service = SFXService()
    return _service
