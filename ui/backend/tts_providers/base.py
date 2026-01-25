"""Base TTS Provider interface"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any
from enum import Enum
import numpy as np


class VoiceCloningSupport(Enum):
    """Voice cloning capability level"""
    NONE = "none"           # No voice cloning (preset voices only)
    ZERO_SHOT = "zero_shot" # Clone from reference audio
    FINE_TUNE = "fine_tune" # Requires training


@dataclass
class VoiceInfo:
    """Information about a voice (preset or cloned)"""
    id: str
    name: str
    language: Optional[str] = None
    gender: Optional[str] = None
    description: Optional[str] = None
    is_preset: bool = True  # False if user-uploaded clone
    sample_url: Optional[str] = None


@dataclass
class ModelVariant:
    """Information about a model variant/size"""
    id: str
    name: str
    size_gb: float  # Download size in GB
    vram_gb: float  # VRAM requirement in GB
    description: Optional[str] = None


@dataclass
class TTSProviderInfo:
    """Metadata about a TTS provider"""
    id: str
    name: str
    description: str
    voice_cloning: VoiceCloningSupport
    supported_languages: List[str]
    models: List[Any]  # List of ModelVariant dicts or strings (for backwards compat)
    default_model: str
    provider_type: str = "local"  # "local" or "api"
    sample_rate: int = 24000
    requires_reference_text: bool = False  # For voice cloning
    min_reference_duration: float = 5.0    # Seconds
    max_reference_duration: float = 30.0
    vram_requirement_gb: float = 4.0       # Approximate VRAM needed
    supports_streaming: bool = False
    supports_emotion_tags: bool = False
    supports_fast_mode: bool = False  # CFG can be disabled for faster generation
    preset_voices: List[VoiceInfo] = field(default_factory=list)
    extra_params: Dict[str, Any] = field(default_factory=dict)


class TTSProvider(ABC):
    """Abstract base class for TTS providers"""

    def __init__(self, device: Optional[str] = None):
        self.device = device or self._detect_device()
        self._loaded = False

    def _detect_device(self) -> str:
        """Detect best available device"""
        import torch
        from settings_service import settings_service

        device_pref = settings_service.get("performance.device", "auto")

        if device_pref == "cuda":
            return "cuda" if torch.cuda.is_available() else "cpu"
        elif device_pref == "cpu":
            return "cpu"
        else:  # auto
            if torch.cuda.is_available():
                return "cuda"
            elif hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
                return "mps"
            return "cpu"

    @classmethod
    @abstractmethod
    def get_info(cls) -> TTSProviderInfo:
        """Get provider metadata"""
        pass

    @abstractmethod
    def load(self, model: Optional[str] = None) -> None:
        """Load the model into memory"""
        pass

    @abstractmethod
    def unload(self) -> None:
        """Unload model to free memory"""
        pass

    @abstractmethod
    def generate(
        self,
        text: str,
        voice_id: Optional[str] = None,
        voice_audio_path: Optional[str] = None,
        voice_audio_text: Optional[str] = None,
        language: str = "en",
        speed: float = 1.0,
        **kwargs
    ) -> tuple[np.ndarray, int]:
        """
        Generate audio from text.

        Args:
            text: Text to synthesize
            voice_id: ID of preset voice (for providers without cloning)
            voice_audio_path: Path to reference audio (for voice cloning)
            voice_audio_text: Transcription of reference audio (if required)
            language: Language code
            speed: Playback speed multiplier
            **kwargs: Provider-specific parameters

        Returns:
            Tuple of (audio_array, sample_rate)
        """
        pass

    def is_loaded(self) -> bool:
        """Check if model is loaded"""
        return self._loaded

    def get_preset_voices(self, language: Optional[str] = None) -> List[VoiceInfo]:
        """Get list of preset voices (for providers without cloning)."""
        _ = language
        return self.get_info().preset_voices

    def supports_language(self, language: str) -> bool:
        """Check if language is supported"""
        return language in self.get_info().supported_languages
