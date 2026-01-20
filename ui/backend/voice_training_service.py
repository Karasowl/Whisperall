"""
Voice Training Service
Handles the full workflow of training custom TTS voices
"""

from __future__ import annotations

import uuid
import threading
import time
from pathlib import Path
from typing import Optional, Dict, Any, List
from dataclasses import dataclass
from enum import Enum

from app_paths import get_output_dir, get_temp_dir, get_voices_dir
from voice_training import DatasetManager, AudioPreprocessor, VoiceRegistry, CustomVoice


class TrainingStatus(str, Enum):
    IDLE = "idle"
    PREPARING = "preparing"
    TRAINING = "training"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class TrainingJob:
    """Represents a voice training job"""
    id: str
    status: TrainingStatus
    progress: float = 0.0
    voice_name: str = ""
    engine: str = "styletts2"
    current_epoch: int = 0
    total_epochs: int = 100
    current_loss: float = 0.0
    best_loss: float = float('inf')
    eta_seconds: Optional[float] = None
    error: Optional[str] = None
    output_voice_id: Optional[str] = None
    created_at: float = 0.0
    completed_at: Optional[float] = None


class VoiceTrainingService:
    """Service for training custom TTS voices"""

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

        self._datasets_dir = get_temp_dir() / "datasets"
        self._training_dir = get_temp_dir() / "training"
        self._datasets_dir.mkdir(parents=True, exist_ok=True)
        self._training_dir.mkdir(parents=True, exist_ok=True)

        self._voice_registry = VoiceRegistry(get_voices_dir() / "custom")
        self._active_datasets: Dict[str, DatasetManager] = {}
        self._current_job: Optional[TrainingJob] = None
        self._training_thread: Optional[threading.Thread] = None
        self._cancel_requested = False

    # =====================================================
    # DATASET MANAGEMENT
    # =====================================================

    def create_dataset(self, name: str) -> str:
        """Create a new dataset for training"""
        dataset_id = str(uuid.uuid4())[:8]
        dataset_dir = self._datasets_dir / dataset_id

        dataset = DatasetManager(dataset_dir)
        self._active_datasets[dataset_id] = dataset

        return dataset_id

    def get_dataset(self, dataset_id: str) -> Optional[DatasetManager]:
        """Get a dataset by ID"""
        if dataset_id in self._active_datasets:
            return self._active_datasets[dataset_id]

        # Try to load from disk
        dataset_dir = self._datasets_dir / dataset_id
        if dataset_dir.exists():
            dataset = DatasetManager(dataset_dir)
            self._active_datasets[dataset_id] = dataset
            return dataset

        return None

    def add_audio_to_dataset(
        self,
        dataset_id: str,
        audio_path: str,
        transcription: str = "",
        filename: Optional[str] = None
    ) -> Dict[str, Any]:
        """Add an audio file to a dataset"""
        dataset = self.get_dataset(dataset_id)
        if not dataset:
            raise ValueError(f"Dataset not found: {dataset_id}")

        entry = dataset.add_audio(audio_path, transcription, filename)
        return entry.to_dict()

    def update_transcription(
        self,
        dataset_id: str,
        entry_id: str,
        transcription: str
    ) -> Dict[str, Any]:
        """Update transcription for a dataset entry"""
        dataset = self.get_dataset(dataset_id)
        if not dataset:
            raise ValueError(f"Dataset not found: {dataset_id}")

        entry = dataset.update_transcription(entry_id, transcription)
        if not entry:
            raise ValueError(f"Entry not found: {entry_id}")

        return entry.to_dict()

    def remove_from_dataset(self, dataset_id: str, entry_id: str) -> bool:
        """Remove an entry from a dataset"""
        dataset = self.get_dataset(dataset_id)
        if not dataset:
            raise ValueError(f"Dataset not found: {dataset_id}")

        return dataset.remove_entry(entry_id)

    def get_dataset_entries(self, dataset_id: str) -> List[Dict[str, Any]]:
        """Get all entries in a dataset"""
        dataset = self.get_dataset(dataset_id)
        if not dataset:
            raise ValueError(f"Dataset not found: {dataset_id}")

        return [e.to_dict() for e in dataset.list_entries()]

    def get_dataset_stats(self, dataset_id: str) -> Dict[str, Any]:
        """Get dataset statistics"""
        dataset = self.get_dataset(dataset_id)
        if not dataset:
            raise ValueError(f"Dataset not found: {dataset_id}")

        return dataset.get_stats()

    def transcribe_dataset(
        self,
        dataset_id: str,
        entry_id: Optional[str] = None,
        model: str = "base",
        language: str = "auto"
    ) -> Dict[str, str]:
        """Transcribe audio files in a dataset using Whisper"""
        dataset = self.get_dataset(dataset_id)
        if not dataset:
            raise ValueError(f"Dataset not found: {dataset_id}")

        return dataset.transcribe_with_whisper(entry_id, model, language)

    # =====================================================
    # TRAINING
    # =====================================================

    def get_training_engines(self) -> List[Dict[str, Any]]:
        """Get list of available training engines"""
        engines = []

        # Check StyleTTS2
        try:
            import styletts2
            styletts2_available = True
        except ImportError:
            styletts2_available = False

        engines.append({
            "id": "styletts2",
            "name": "StyleTTS2",
            "description": "High-quality expressive TTS with style transfer",
            "available": styletts2_available,
            "vram_gb_training": 12.0,
            "vram_gb_inference": 2.0,
            "min_dataset_minutes": 15,
            "recommended_dataset_minutes": 60,
            "install_command": "pip install styletts2",
        })

        return engines

    def start_training(
        self,
        dataset_id: str,
        voice_name: str,
        engine: str = "styletts2",
        epochs: int = 100,
        batch_size: int = 4,
        learning_rate: float = 1e-4,
        language: str = "en",
        **kwargs
    ) -> str:
        """Start training a new voice"""
        if self._current_job and self._current_job.status == TrainingStatus.TRAINING:
            raise RuntimeError("A training job is already in progress")

        dataset = self.get_dataset(dataset_id)
        if not dataset:
            raise ValueError(f"Dataset not found: {dataset_id}")

        # Validate dataset
        stats = dataset.get_stats()
        if stats["valid_entries"] < 10:
            raise ValueError("Dataset must have at least 10 valid audio files")
        if stats["entries_with_transcription"] < stats["valid_entries"] * 0.8:
            raise ValueError("At least 80% of entries must have transcriptions")

        job_id = str(uuid.uuid4())[:8]

        self._current_job = TrainingJob(
            id=job_id,
            status=TrainingStatus.PREPARING,
            voice_name=voice_name,
            engine=engine,
            total_epochs=epochs,
            created_at=time.time(),
        )

        self._cancel_requested = False

        # Start training in background thread
        self._training_thread = threading.Thread(
            target=self._run_training,
            args=(dataset_id, voice_name, engine, epochs, batch_size, learning_rate, language, kwargs),
            daemon=True
        )
        self._training_thread.start()

        return job_id

    def _run_training(
        self,
        dataset_id: str,
        voice_name: str,
        engine: str,
        epochs: int,
        batch_size: int,
        learning_rate: float,
        language: str,
        extra_params: dict
    ):
        """Run training in background thread"""
        job = self._current_job
        if not job:
            return

        try:
            job.status = TrainingStatus.PREPARING
            job.progress = 0.05

            dataset = self.get_dataset(dataset_id)
            if not dataset:
                raise ValueError(f"Dataset not found: {dataset_id}")

            # Export dataset for training
            export_dir = self._training_dir / job.id
            export_info = dataset.export_for_training(export_dir)

            job.progress = 0.1
            job.status = TrainingStatus.TRAINING

            if engine == "styletts2":
                self._train_styletts2(
                    job,
                    export_dir,
                    voice_name,
                    epochs,
                    batch_size,
                    learning_rate,
                    extra_params
                )
            else:
                raise ValueError(f"Unknown training engine: {engine}")

            if self._cancel_requested:
                job.status = TrainingStatus.CANCELLED
                return

            # Register the trained voice
            job.progress = 0.95
            stats = dataset.get_stats()

            voice = self._voice_registry.register_voice(
                voice_id=job.id,
                name=voice_name,
                engine=engine,
                model_path=str(export_dir / "model" / "best_model.pth"),
                config_path=str(export_dir / "model" / "config.json"),
                training_duration_seconds=time.time() - job.created_at,
                dataset_size_minutes=stats["total_duration_minutes"],
                language=language,
            )

            job.output_voice_id = voice.id
            job.status = TrainingStatus.COMPLETED
            job.progress = 1.0
            job.completed_at = time.time()

            print(f"[VoiceTraining] Training completed: {voice_name}")

        except Exception as e:
            job.status = TrainingStatus.FAILED
            job.error = str(e)
            print(f"[VoiceTraining] Training failed: {e}")

    def _train_styletts2(
        self,
        job: TrainingJob,
        export_dir: Path,
        voice_name: str,
        epochs: int,
        batch_size: int,
        learning_rate: float,
        extra_params: dict
    ):
        """Train using StyleTTS2"""
        # This is a placeholder - actual StyleTTS2 training would require
        # significant setup including phonemizer, alignments, etc.

        print(f"[VoiceTraining] Starting StyleTTS2 training for: {voice_name}")
        print(f"[VoiceTraining] Epochs: {epochs}, Batch size: {batch_size}, LR: {learning_rate}")

        model_dir = export_dir / "model"
        model_dir.mkdir(exist_ok=True)

        # Simulate training progress
        for epoch in range(1, epochs + 1):
            if self._cancel_requested:
                return

            # Simulate epoch
            time.sleep(0.1)  # In real training, this would be the actual training loop

            job.current_epoch = epoch
            job.progress = 0.1 + 0.85 * (epoch / epochs)
            job.current_loss = max(0.1, 1.0 - epoch / epochs * 0.9)  # Simulated loss

            if job.current_loss < job.best_loss:
                job.best_loss = job.current_loss

            # Estimate ETA
            elapsed = time.time() - job.created_at
            if epoch > 0:
                time_per_epoch = elapsed / epoch
                remaining_epochs = epochs - epoch
                job.eta_seconds = time_per_epoch * remaining_epochs

        # Create dummy model files
        # In real implementation, these would be the trained weights
        (model_dir / "best_model.pth").touch()
        (model_dir / "config.json").write_text('{"engine": "styletts2", "voice": "' + voice_name + '"}')

    def get_training_status(self) -> Optional[Dict[str, Any]]:
        """Get current training job status"""
        if not self._current_job:
            return None

        job = self._current_job
        return {
            "id": job.id,
            "status": job.status.value,
            "progress": job.progress,
            "voice_name": job.voice_name,
            "engine": job.engine,
            "current_epoch": job.current_epoch,
            "total_epochs": job.total_epochs,
            "current_loss": job.current_loss,
            "best_loss": job.best_loss,
            "eta_seconds": job.eta_seconds,
            "error": job.error,
            "output_voice_id": job.output_voice_id,
            "created_at": job.created_at,
            "completed_at": job.completed_at,
        }

    def cancel_training(self) -> bool:
        """Cancel current training job"""
        if not self._current_job or self._current_job.status != TrainingStatus.TRAINING:
            return False

        self._cancel_requested = True
        return True

    # =====================================================
    # VOICE REGISTRY
    # =====================================================

    def get_custom_voices(self, engine: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get list of custom trained voices"""
        voices = self._voice_registry.list_voices(engine)
        return [v.to_dict() for v in voices]

    def get_custom_voice(self, voice_id: str) -> Optional[Dict[str, Any]]:
        """Get a specific custom voice"""
        voice = self._voice_registry.get_voice(voice_id)
        return voice.to_dict() if voice else None

    def delete_custom_voice(self, voice_id: str) -> bool:
        """Delete a custom trained voice"""
        return self._voice_registry.delete_voice(voice_id)

    def update_custom_voice(
        self,
        voice_id: str,
        name: Optional[str] = None,
        description: Optional[str] = None,
        tags: Optional[List[str]] = None
    ) -> Optional[Dict[str, Any]]:
        """Update custom voice metadata"""
        voice = self._voice_registry.update_voice(voice_id, name, description, tags)
        return voice.to_dict() if voice else None


# Global instance
_service: Optional[VoiceTrainingService] = None


def get_voice_training_service() -> VoiceTrainingService:
    """Get voice training service instance"""
    global _service
    if _service is None:
        _service = VoiceTrainingService()
    return _service
