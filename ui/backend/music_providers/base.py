"""Base Music Provider interface"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any
from enum import Enum
import numpy as np


@dataclass
class MusicProviderInfo:
    """Metadata about a music generation provider"""
    id: str
    name: str
    description: str
    max_duration_seconds: int
    supported_genres: List[str]
    requires_lyrics: bool
    vram_requirement_gb: float
    models: List[Dict[str, Any]]
    default_model: str
    provider_type: str = "local"  # "local" or "api"
    sample_rate: int = 44100
    supports_instrumental: bool = True
    supports_vocals: bool = True
    supports_fast_mode: bool = False  # Can disable guidance for faster generation
    extra_params: Dict[str, Any] = field(default_factory=dict)


class MusicProvider(ABC):
    """Abstract base class for music generation providers"""

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
    def get_info(cls) -> MusicProviderInfo:
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
        lyrics: str,
        style_prompt: str,
        duration_seconds: int = 180,
        reference_audio: Optional[str] = None,
        **kwargs
    ) -> tuple[np.ndarray, int]:
        """
        Generate music from lyrics and style prompt.

        Args:
            lyrics: Lyrics in LRC format with timestamps, or plain text
            style_prompt: Description of desired music style
            duration_seconds: Target duration in seconds
            reference_audio: Optional path to reference audio for style
            **kwargs: Provider-specific parameters

        Returns:
            Tuple of (audio_array, sample_rate)
        """
        pass

    def is_loaded(self) -> bool:
        """Check if model is loaded"""
        return self._loaded
