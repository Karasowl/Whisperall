"""Base Translation Provider interface"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional, List, Dict, Any, Tuple

from ..base import ProviderInfo, ProviderType, ServiceType, ModelVariant


@dataclass
class TranslationProviderInfo(ProviderInfo):
    """Metadata about a Translation provider"""

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
        supports_auto_detect: bool = True,
        docs_url: Optional[str] = None,
        pricing_url: Optional[str] = None,
        console_url: Optional[str] = None,
    ):
        super().__init__(
            id=id,
            name=name,
            description=description,
            service=ServiceType.TRANSLATION,
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
        self.supports_auto_detect = supports_auto_detect

    def to_dict(self) -> Dict[str, Any]:
        data = super().to_dict()
        data.update({
            "supports_auto_detect": self.supports_auto_detect,
        })
        return data


class TranslationProvider(ABC):
    """Abstract base class for Translation providers"""

    @classmethod
    @abstractmethod
    def get_info(cls) -> TranslationProviderInfo:
        """Get provider metadata"""
        pass

    @abstractmethod
    def translate(
        self,
        text: str,
        source_lang: str = "auto",
        target_lang: str = "en",
        **kwargs
    ) -> Tuple[str, Dict[str, Any]]:
        """
        Translate text.

        Args:
            text: Text to translate
            source_lang: Source language code or "auto"
            target_lang: Target language code
            **kwargs: Provider-specific parameters

        Returns:
            Tuple of (translated_text, metadata_dict)
        """
        pass
