"""
Voice Registry for Custom Trained Voices
Manages trained voice models and makes them available for TTS
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Optional, List, Dict, Any
from dataclasses import dataclass, asdict
import time

from app_paths import get_temp_dir


@dataclass
class CustomVoice:
    """A custom trained voice model"""
    id: str
    name: str
    description: str
    engine: str  # e.g., "styletts2", "xtts", etc.
    model_path: str
    config_path: Optional[str]
    sample_audio_path: Optional[str]
    created_at: float
    training_duration_seconds: float
    dataset_size_minutes: float
    language: str
    tags: List[str]

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "CustomVoice":
        return cls(**data)


class VoiceRegistry:
    """Registry for managing custom trained voices"""

    def __init__(self, voices_dir: Path):
        self.voices_dir = Path(voices_dir)
        self.registry_path = self.voices_dir / "custom_voices.json"

        # Create directory
        self.voices_dir.mkdir(parents=True, exist_ok=True)

        # Load registry
        self._voices: Dict[str, CustomVoice] = {}
        self._load_registry()

    def _load_registry(self):
        """Load registry from disk"""
        if self.registry_path.exists():
            try:
                with open(self.registry_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    for voice_data in data.get("voices", []):
                        voice = CustomVoice.from_dict(voice_data)
                        self._voices[voice.id] = voice
            except Exception as e:
                print(f"[VoiceRegistry] Failed to load registry: {e}")

    def _save_registry(self):
        """Save registry to disk"""
        data = {
            "voices": [voice.to_dict() for voice in self._voices.values()],
            "updated_at": time.time(),
        }
        with open(self.registry_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

    def register_voice(
        self,
        voice_id: str,
        name: str,
        engine: str,
        model_path: str,
        config_path: Optional[str] = None,
        sample_audio_path: Optional[str] = None,
        description: str = "",
        training_duration_seconds: float = 0.0,
        dataset_size_minutes: float = 0.0,
        language: str = "en",
        tags: Optional[List[str]] = None,
    ) -> CustomVoice:
        """Register a new trained voice"""
        # Copy model files to voices directory
        voice_dir = self.voices_dir / voice_id
        voice_dir.mkdir(parents=True, exist_ok=True)

        # Copy model
        model_src = Path(model_path)
        model_dst = voice_dir / model_src.name
        if model_src.exists() and model_src != model_dst:
            shutil.copy2(model_src, model_dst)
        model_path = str(model_dst)

        # Copy config if exists
        if config_path:
            config_src = Path(config_path)
            config_dst = voice_dir / config_src.name
            if config_src.exists() and config_src != config_dst:
                shutil.copy2(config_src, config_dst)
            config_path = str(config_dst)

        # Copy sample audio if exists
        if sample_audio_path:
            sample_src = Path(sample_audio_path)
            sample_dst = voice_dir / f"sample{sample_src.suffix}"
            if sample_src.exists() and sample_src != sample_dst:
                shutil.copy2(sample_src, sample_dst)
            sample_audio_path = str(sample_dst)

        voice = CustomVoice(
            id=voice_id,
            name=name,
            description=description,
            engine=engine,
            model_path=model_path,
            config_path=config_path,
            sample_audio_path=sample_audio_path,
            created_at=time.time(),
            training_duration_seconds=training_duration_seconds,
            dataset_size_minutes=dataset_size_minutes,
            language=language,
            tags=tags or [],
        )

        self._voices[voice_id] = voice
        self._save_registry()

        return voice

    def get_voice(self, voice_id: str) -> Optional[CustomVoice]:
        """Get a voice by ID"""
        return self._voices.get(voice_id)

    def list_voices(self, engine: Optional[str] = None) -> List[CustomVoice]:
        """List all registered voices, optionally filtered by engine"""
        voices = list(self._voices.values())
        if engine:
            voices = [v for v in voices if v.engine == engine]
        return voices

    def delete_voice(self, voice_id: str) -> bool:
        """Delete a registered voice"""
        voice = self._voices.get(voice_id)
        if not voice:
            return False

        # Delete voice directory
        voice_dir = self.voices_dir / voice_id
        if voice_dir.exists():
            shutil.rmtree(voice_dir)

        del self._voices[voice_id]
        self._save_registry()
        return True

    def update_voice(
        self,
        voice_id: str,
        name: Optional[str] = None,
        description: Optional[str] = None,
        tags: Optional[List[str]] = None,
    ) -> Optional[CustomVoice]:
        """Update voice metadata"""
        voice = self._voices.get(voice_id)
        if not voice:
            return None

        if name is not None:
            voice.name = name
        if description is not None:
            voice.description = description
        if tags is not None:
            voice.tags = tags

        self._save_registry()
        return voice

    def get_sample_audio_url(self, voice_id: str) -> Optional[str]:
        """Get URL for voice sample audio"""
        voice = self._voices.get(voice_id)
        if voice and voice.sample_audio_path:
            return f"/api/voices/custom/{voice_id}/sample"
        return None
