"""
Music Generation Service
Handles music generation using various providers (DiffRhythm, etc.)
"""

from __future__ import annotations

import asyncio
import uuid
from pathlib import Path
from typing import Optional, Dict, Any, List
from dataclasses import dataclass
from enum import Enum
import numpy as np
import soundfile as sf
import threading
import time

from app_paths import get_output_dir
from settings_service import settings_service


class MusicJobStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class MusicJob:
    """Represents a music generation job"""
    id: str
    status: MusicJobStatus
    progress: float = 0.0
    lyrics: str = ""
    style_prompt: str = ""
    duration_seconds: int = 180
    provider: str = "diffrhythm"
    model: str = ""
    output_path: Optional[str] = None
    error: Optional[str] = None
    created_at: float = 0.0
    completed_at: Optional[float] = None


class MusicService:
    """Service for music generation"""

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
        self._jobs: Dict[str, MusicJob] = {}
        self._output_dir = get_output_dir() / "music"
        self._output_dir.mkdir(parents=True, exist_ok=True)

    def get_providers(self) -> List[Dict[str, Any]]:
        """Get list of available music providers"""
        from music_providers import get_all_provider_info, is_provider_ready

        providers = []
        for provider_id, info in get_all_provider_info().items():
            providers.append({
                "id": info.id,
                "name": info.name,
                "description": info.description,
                "max_duration_seconds": info.max_duration_seconds,
                "supported_genres": info.supported_genres,
                "requires_lyrics": info.requires_lyrics,
                "vram_gb": info.vram_requirement_gb,
                "models": info.models,
                "default_model": info.default_model,
                "ready": is_provider_ready(provider_id),
            })
        return providers

    def create_job(
        self,
        lyrics: str,
        style_prompt: str,
        duration_seconds: int = 180,
        provider: str = "diffrhythm",
        model: Optional[str] = None,
        **kwargs
    ) -> str:
        """Create a new music generation job"""
        job_id = str(uuid.uuid4())[:8]
        job = MusicJob(
            id=job_id,
            status=MusicJobStatus.PENDING,
            lyrics=lyrics,
            style_prompt=style_prompt,
            duration_seconds=duration_seconds,
            provider=provider,
            model=model or "",
            created_at=time.time(),
        )
        self._jobs[job_id] = job

        # Start generation in background thread
        thread = threading.Thread(
            target=self._run_generation,
            args=(job_id, kwargs),
            daemon=True
        )
        thread.start()

        return job_id

    def _run_generation(self, job_id: str, extra_params: dict):
        """Run music generation in background"""
        job = self._jobs.get(job_id)
        if not job:
            return

        try:
            job.status = MusicJobStatus.PROCESSING
            job.progress = 0.1

            from music_providers import get_provider

            # Get provider
            provider = get_provider(job.provider)

            # Load model if needed
            if not provider.is_loaded():
                job.progress = 0.2
                provider.load(job.model if job.model else None)

            job.progress = 0.3

            # Generate music
            audio, sample_rate = provider.generate(
                lyrics=job.lyrics,
                style_prompt=job.style_prompt,
                duration_seconds=job.duration_seconds,
                model=job.model if job.model else None,
                **extra_params
            )

            job.progress = 0.9

            # Save output
            output_filename = f"music_{job_id}_{int(time.time())}.wav"
            output_path = self._output_dir / output_filename
            sf.write(str(output_path), audio, sample_rate)

            job.output_path = str(output_path)
            job.status = MusicJobStatus.COMPLETED
            job.progress = 1.0
            job.completed_at = time.time()

        except Exception as e:
            job.status = MusicJobStatus.FAILED
            job.error = str(e)
            print(f"[MusicService] Job {job_id} failed: {e}")

    def get_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Get job status"""
        job = self._jobs.get(job_id)
        if not job:
            return None

        return {
            "id": job.id,
            "status": job.status.value,
            "progress": job.progress,
            "lyrics": job.lyrics,
            "style_prompt": job.style_prompt,
            "duration_seconds": job.duration_seconds,
            "provider": job.provider,
            "model": job.model,
            "output_path": job.output_path,
            "error": job.error,
            "created_at": job.created_at,
            "completed_at": job.completed_at,
        }

    def cancel_job(self, job_id: str) -> bool:
        """Cancel a pending or processing job"""
        job = self._jobs.get(job_id)
        if not job:
            return False

        if job.status in [MusicJobStatus.PENDING, MusicJobStatus.PROCESSING]:
            job.status = MusicJobStatus.CANCELLED
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

    def cleanup_old_jobs(self, max_age_hours: int = 24):
        """Clean up old completed/failed jobs"""
        cutoff = time.time() - (max_age_hours * 3600)
        to_remove = []

        for job_id, job in self._jobs.items():
            if job.status in [MusicJobStatus.COMPLETED, MusicJobStatus.FAILED, MusicJobStatus.CANCELLED]:
                if job.created_at < cutoff:
                    to_remove.append(job_id)
                    # Also remove output file if exists
                    if job.output_path:
                        try:
                            Path(job.output_path).unlink(missing_ok=True)
                        except:
                            pass

        for job_id in to_remove:
            del self._jobs[job_id]


# Global instance
_service: Optional[MusicService] = None


def get_music_service() -> MusicService:
    """Get music service instance"""
    global _service
    if _service is None:
        _service = MusicService()
    return _service
