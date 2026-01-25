"""Base STT Provider interface"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any, Tuple
from pathlib import Path

from ..base import ProviderInfo, ProviderType, ServiceType, ModelVariant


@dataclass
class STTProviderInfo(ProviderInfo):
    """Metadata about an STT provider"""

    def __init__(
        self,
        id: str,
        name: str,
        description: str,
        type: ProviderType,
        requires_api_key: Optional[str] = None,
        requires_model_download: Optional[str] = None,
        supported_languages: List[str] = None,
        models: List[ModelVariant] = None,
        default_model: Optional[str] = None,
        supports_vad: bool = True,
        supports_timestamps: bool = True,
        supports_diarization: bool = False,
        docs_url: Optional[str] = None,
        pricing_url: Optional[str] = None,
        console_url: Optional[str] = None,
    ):
        super().__init__(
            id=id,
            name=name,
            description=description,
            service=ServiceType.STT,
            type=type,
            requires_api_key=requires_api_key,
            requires_model_download=requires_model_download,
            supported_languages=supported_languages or ["multilingual"],
            models=models or [],
            default_model=default_model,
            docs_url=docs_url,
            pricing_url=pricing_url,
            console_url=console_url,
        )
        self.supports_vad = supports_vad
        self.supports_timestamps = supports_timestamps
        self.supports_diarization = supports_diarization

    def to_dict(self) -> Dict[str, Any]:
        data = super().to_dict()
        data.update({
            "supports_vad": self.supports_vad,
            "supports_timestamps": self.supports_timestamps,
            "supports_diarization": self.supports_diarization,
        })
        return data


class STTProvider(ABC):
    """Abstract base class for STT providers"""

    def __init__(self, device: Optional[str] = None):
        self.device = device or self._detect_device()
        self._loaded = False

    def _detect_device(self) -> str:
        """Detect best available device"""
        try:
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
                return "cpu"
        except ImportError:
            return "cpu"

    @classmethod
    @abstractmethod
    def get_info(cls) -> STTProviderInfo:
        """Get provider metadata"""
        pass

    @abstractmethod
    def transcribe(
        self,
        audio_path: Path,
        language: str = "auto",
        prompt: Optional[str] = None,
        **kwargs
    ) -> Tuple[str, Dict[str, Any]]:
        """
        Transcribe audio to text.

        Args:
            audio_path: Path to audio file
            language: Language code or "auto" for detection
            prompt: Optional prompt to guide transcription
            **kwargs: Provider-specific parameters

        Returns:
            Tuple of (transcribed_text, metadata_dict)
        """
        pass

    def is_loaded(self) -> bool:
        """Check if model is loaded"""
        return self._loaded
