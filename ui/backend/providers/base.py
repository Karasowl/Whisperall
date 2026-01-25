"""Base classes for unified provider system"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any, Literal
from enum import Enum


class ProviderType(str, Enum):
    """Type of provider"""
    LOCAL = "local"    # Runs locally with downloaded model
    API = "api"        # Uses cloud API with API key


class ServiceType(str, Enum):
    """Service category"""
    TTS = "tts"
    STT = "stt"
    AI_EDIT = "ai_edit"
    TRANSLATION = "translation"


@dataclass
class ModelVariant:
    """Information about a model variant/size"""
    id: str
    name: str
    size_gb: float = 0.0      # Download size in GB
    vram_gb: float = 0.0      # VRAM requirement in GB
    description: Optional[str] = None


@dataclass
class ProviderInfo:
    """Metadata about a provider"""
    id: str
    name: str
    description: str
    service: ServiceType
    type: ProviderType

    # Requirements
    requires_api_key: Optional[str] = None      # API key ID if needed (e.g., "openai")
    requires_model_download: Optional[str] = None  # Model ID if local model needed

    # Capabilities
    supported_languages: List[str] = field(default_factory=list)
    models: List[ModelVariant] = field(default_factory=list)
    default_model: Optional[str] = None

    # Status (computed dynamically)
    is_available: bool = False    # Has required API key or model installed
    is_installed: bool = False    # For local: model downloaded. For API: key configured

    # Extra metadata
    docs_url: Optional[str] = None
    pricing_url: Optional[str] = None
    console_url: Optional[str] = None
    extra_params: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "service": self.service.value,
            "type": self.type.value,
            "requires_api_key": self.requires_api_key,
            "requires_model_download": self.requires_model_download,
            "supported_languages": self.supported_languages,
            "models": [
                {
                    "id": m.id,
                    "name": m.name,
                    "size_gb": m.size_gb,
                    "vram_gb": m.vram_gb,
                    "description": m.description,
                } for m in self.models
            ] if self.models else [],
            "default_model": self.default_model,
            "is_available": self.is_available,
            "is_installed": self.is_installed,
            "docs_url": self.docs_url,
            "pricing_url": self.pricing_url,
            "console_url": self.console_url,
            "extra_params": self.extra_params,
        }


class BaseProvider(ABC):
    """Abstract base class for all service providers"""

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
                elif hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
                    return "mps"
                return "cpu"
        except ImportError:
            return "cpu"

    @classmethod
    @abstractmethod
    def get_info(cls) -> ProviderInfo:
        """Get provider metadata"""
        pass

    def is_loaded(self) -> bool:
        """Check if provider is loaded/ready"""
        return self._loaded
