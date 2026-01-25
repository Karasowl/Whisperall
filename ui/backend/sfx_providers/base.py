"""Base SFX Provider interface"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any
import numpy as np


@dataclass
class SFXProviderInfo:
    """Metadata about a sound effects generation provider"""
    id: str
    name: str
    description: str
    vram_requirement_gb: float
    models: List[Dict[str, Any]]
    default_model: str
    provider_type: str = "local"  # "local" or "api"
    sample_rate: int = 44100
    max_video_duration_seconds: int = 300  # 5 minutes default
    supports_prompt: bool = True
    supports_fast_mode: bool = False  # Can disable guidance for faster generation
    extra_params: Dict[str, Any] = field(default_factory=dict)


class SFXProvider(ABC):
    """Abstract base class for sound effects generation providers"""

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
    def get_info(cls) -> SFXProviderInfo:
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
        video_path: str,
        prompt: Optional[str] = None,
        **kwargs
    ) -> tuple[np.ndarray, int]:
        """
        Generate sound effects from video.

        Args:
            video_path: Path to input video file
            prompt: Optional text prompt to guide SFX generation
            **kwargs: Provider-specific parameters

        Returns:
            Tuple of (audio_array, sample_rate)
        """
        pass

    def is_loaded(self) -> bool:
        """Check if model is loaded"""
        return self._loaded
