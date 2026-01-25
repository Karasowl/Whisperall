"""
Stem Separation Service
Audio source separation using Demucs for extracting vocals, drums, bass, and other stems
"""

from __future__ import annotations

import uuid
from pathlib import Path
from typing import Optional, Dict, Any, List
from dataclasses import dataclass
from enum import Enum
import numpy as np
import threading
import time

from app_paths import get_output_dir, get_temp_dir


class StemSeparationStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class StemType(str, Enum):
    VOCALS = "vocals"
    DRUMS = "drums"
    BASS = "bass"
    OTHER = "other"
    # For 6-stem models
    GUITAR = "guitar"
    PIANO = "piano"


@dataclass
class StemSeparationJob:
    """Represents a stem separation job"""
    id: str
    status: StemSeparationStatus
    progress: float = 0.0
    audio_path: str = ""
    model: str = "htdemucs"
    stems_requested: List[str] = None
    output_stems: Dict[str, str] = None  # stem_name -> file_path
    error: Optional[str] = None
    created_at: float = 0.0
    completed_at: Optional[float] = None

    def __post_init__(self):
        if self.stems_requested is None:
            self.stems_requested = ["vocals", "drums", "bass", "other"]
        if self.output_stems is None:
            self.output_stems = {}


# Available Demucs models
DEMUCS_MODELS = {
    "htdemucs": {
        "name": "HT-Demucs",
        "description": "Default 4-stem model (vocals, drums, bass, other)",
        "stems": ["vocals", "drums", "bass", "other"],
        "vram_gb": 4.0,
    },
    "htdemucs_ft": {
        "name": "HT-Demucs Fine-tuned",
        "description": "Fine-tuned for better vocal separation",
        "stems": ["vocals", "drums", "bass", "other"],
        "vram_gb": 4.0,
    },
    "htdemucs_6s": {
        "name": "HT-Demucs 6-stem",
        "description": "6 stems including guitar and piano",
        "stems": ["vocals", "drums", "bass", "guitar", "piano", "other"],
        "vram_gb": 6.0,
    },
    "mdx_extra": {
        "name": "MDX Extra",
        "description": "High quality vocal extraction",
        "stems": ["vocals", "drums", "bass", "other"],
        "vram_gb": 3.0,
    },
}


class StemSeparationService:
    """Service for audio stem separation using Demucs"""

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
        self._jobs: Dict[str, StemSeparationJob] = {}
        self._output_dir = get_output_dir() / "stems"
        self._temp_dir = get_temp_dir() / "stems"
        self._output_dir.mkdir(parents=True, exist_ok=True)
        self._temp_dir.mkdir(parents=True, exist_ok=True)
        self._model = None
        self._current_model_name = None

    def is_available(self) -> bool:
        """Check if Demucs is installed"""
        try:
            import demucs
            return True
        except ImportError:
            return False

    def get_models(self) -> List[Dict[str, Any]]:
        """Get list of available Demucs models"""
        models = []
        for model_id, info in DEMUCS_MODELS.items():
            models.append({
                "id": model_id,
                "name": info["name"],
                "description": info["description"],
                "stems": info["stems"],
                "vram_gb": info["vram_gb"],
            })
        return models

    def create_job(
        self,
        audio_path: str,
        model: str = "htdemucs",
        stems: Optional[List[str]] = None,
        **kwargs
    ) -> str:
        """Create a new stem separation job"""
        job_id = str(uuid.uuid4())[:8]

        # Validate audio exists
        audio_path = Path(audio_path)
        if not audio_path.exists():
            raise FileNotFoundError(f"Audio not found: {audio_path}")

        # Validate model
        if model not in DEMUCS_MODELS:
            model = "htdemucs"

        # Default to all available stems for the model
        available_stems = DEMUCS_MODELS[model]["stems"]
        if stems:
            stems = [s for s in stems if s in available_stems]
        else:
            stems = available_stems

        job = StemSeparationJob(
            id=job_id,
            status=StemSeparationStatus.PENDING,
            audio_path=str(audio_path),
            model=model,
            stems_requested=stems,
            created_at=time.time(),
        )
        self._jobs[job_id] = job

        # Start separation in background thread
        thread = threading.Thread(
            target=self._run_separation,
            args=(job_id, kwargs),
            daemon=True
        )
        thread.start()

        return job_id

    def _run_separation(self, job_id: str, extra_params: dict):
        """Run stem separation in background"""
        job = self._jobs.get(job_id)
        if not job:
            return

        try:
            job.status = StemSeparationStatus.PROCESSING
            job.progress = 0.1

            import torch
            from demucs.pretrained import get_model
            from demucs.apply import apply_model
            import torchaudio

            # Load model if needed
            if self._model is None or self._current_model_name != job.model:
                job.progress = 0.2
                print(f"[StemSeparation] Loading model: {job.model}")
                self._model = get_model(job.model)
                self._current_model_name = job.model

                device = "cuda" if torch.cuda.is_available() else "cpu"
                self._model.to(device)

            job.progress = 0.3

            # Load audio
            print(f"[StemSeparation] Loading audio: {job.audio_path}")
            waveform, sample_rate = torchaudio.load(job.audio_path)

            # Resample if needed (Demucs expects 44100Hz)
            if sample_rate != 44100:
                resampler = torchaudio.transforms.Resample(sample_rate, 44100)
                waveform = resampler(waveform)
                sample_rate = 44100

            # Ensure stereo
            if waveform.shape[0] == 1:
                waveform = waveform.repeat(2, 1)
            elif waveform.shape[0] > 2:
                waveform = waveform[:2]

            job.progress = 0.4

            # Apply model
            device = next(self._model.parameters()).device
            waveform = waveform.unsqueeze(0).to(device)

            print("[StemSeparation] Running separation...")
            with torch.no_grad():
                sources = apply_model(self._model, waveform, progress=False)

            job.progress = 0.8

            # Save stems
            sources = sources.squeeze(0).cpu()
            stem_names = self._model.sources

            output_stems = {}
            audio_name = Path(job.audio_path).stem

            for i, stem_name in enumerate(stem_names):
                if stem_name in job.stems_requested:
                    stem_audio = sources[i]
                    output_filename = f"{audio_name}_{stem_name}_{job_id}.wav"
                    output_path = self._output_dir / output_filename

                    torchaudio.save(str(output_path), stem_audio, sample_rate)
                    output_stems[stem_name] = str(output_path)
                    print(f"[StemSeparation] Saved {stem_name} to {output_path}")

            job.output_stems = output_stems
            job.status = StemSeparationStatus.COMPLETED
            job.progress = 1.0
            job.completed_at = time.time()
            print(f"[StemSeparation] Job {job_id} completed successfully")

            # Save to history
            try:
                from history_service import get_history_service
                import librosa
                duration = librosa.get_duration(filename=job.audio_path)
                history_svc = get_history_service()
                history_svc.save_stems_entry(
                    input_audio_path=job.audio_path,
                    output_stems=output_stems,
                    provider="demucs",
                    model=job.model,
                    duration_seconds=duration,
                )
            except Exception as he:
                print(f"[StemSeparation] Failed to save to history: {he}")

        except Exception as e:
            job.status = StemSeparationStatus.FAILED
            job.error = str(e)
            print(f"[StemSeparation] Job {job_id} failed: {e}")

    def get_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Get job status"""
        job = self._jobs.get(job_id)
        if not job:
            return None

        return {
            "id": job.id,
            "status": job.status.value,
            "progress": job.progress,
            "audio_path": job.audio_path,
            "model": job.model,
            "stems_requested": job.stems_requested,
            "output_stems": job.output_stems,
            "error": job.error,
            "created_at": job.created_at,
            "completed_at": job.completed_at,
        }

    def cancel_job(self, job_id: str) -> bool:
        """Cancel a pending or processing job"""
        job = self._jobs.get(job_id)
        if not job:
            return False

        if job.status in [StemSeparationStatus.PENDING, StemSeparationStatus.PROCESSING]:
            job.status = StemSeparationStatus.CANCELLED
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

    def unload_model(self):
        """Unload model to free memory"""
        if self._model is not None:
            del self._model
            self._model = None
            self._current_model_name = None
            import torch
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            print("[StemSeparation] Model unloaded")


# Global instance
_service: Optional[StemSeparationService] = None


def get_stem_separation_service() -> StemSeparationService:
    """Get stem separation service instance"""
    global _service
    if _service is None:
        _service = StemSeparationService()
    return _service
