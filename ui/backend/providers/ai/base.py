"""Base AI Edit Provider interface"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any, Tuple

from ..base import ProviderInfo, ProviderType, ServiceType, ModelVariant


@dataclass
class AIProviderInfo(ProviderInfo):
    """Metadata about an AI Edit provider"""

    def __init__(
        self,
        id: str,
        name: str,
        description: str,
        type: ProviderType,
        requires_api_key: Optional[str] = None,
        requires_model_download: Optional[str] = None,
        models: List[ModelVariant] = None,
        default_model: Optional[str] = None,
        supports_streaming: bool = False,
        context_window: int = 4096,
        docs_url: Optional[str] = None,
        pricing_url: Optional[str] = None,
        console_url: Optional[str] = None,
    ):
        super().__init__(
            id=id,
            name=name,
            description=description,
            service=ServiceType.AI_EDIT,
            type=type,
            requires_api_key=requires_api_key,
            requires_model_download=requires_model_download,
            supported_languages=["multilingual"],
            models=models or [],
            default_model=default_model,
            docs_url=docs_url,
            pricing_url=pricing_url,
            console_url=console_url,
        )
        self.supports_streaming = supports_streaming
        self.context_window = context_window

    def to_dict(self) -> Dict[str, Any]:
        data = super().to_dict()
        data.update({
            "supports_streaming": self.supports_streaming,
            "context_window": self.context_window,
        })
        return data


class AIProvider(ABC):
    """Abstract base class for AI Edit providers"""

    @classmethod
    @abstractmethod
    def get_info(cls) -> AIProviderInfo:
        """Get provider metadata"""
        pass

    @abstractmethod
    def edit(
        self,
        text: str,
        command: str,
        model: Optional[str] = None,
        **kwargs
    ) -> Tuple[str, Dict[str, Any]]:
        """
        Edit text using AI.

        Args:
            text: Text to edit
            command: Edit instruction
            model: Optional model override
            **kwargs: Provider-specific parameters

        Returns:
            Tuple of (edited_text, metadata_dict)
        """
        pass


def build_prompt(text: str, command: str) -> str:
    """Build standard edit prompt"""
    return (
        "You are a writing assistant. Apply the instruction to the text and return only the edited text.\n\n"
        f"Instruction: {command}\n\n"
        f"Text:\n{text}"
    )
