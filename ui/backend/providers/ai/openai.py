"""OpenAI AI Provider - GPT models for text editing"""

from typing import Optional, Dict, Any, Tuple

from .base import AIProvider, AIProviderInfo, build_prompt
from ..base import ProviderType, ModelVariant
from core.api_provider import BaseAPIProvider, APIProviderConfig


class OpenAIProvider(BaseAPIProvider, AIProvider):
    """OpenAI GPT models for AI editing"""

    CONFIG = APIProviderConfig(
        provider_id="openai",
        provider_name="OpenAI",
        api_key_name="openai",
        base_url="https://api.openai.com"
    )

    def __init__(self):
        BaseAPIProvider.__init__(self)

    @classmethod
    def get_info(cls) -> AIProviderInfo:
        return AIProviderInfo(
            id="openai",
            name="OpenAI",
            description="GPT-4o and GPT-4o-mini for high-quality text editing.",
            type=ProviderType.API,
            requires_api_key="openai",
            models=[
                ModelVariant(id="gpt-4o-mini", name="GPT-4o Mini", description="Fast, cost-effective"),
                ModelVariant(id="gpt-4o", name="GPT-4o", description="Best quality"),
                ModelVariant(id="gpt-4-turbo", name="GPT-4 Turbo", description="High quality, larger context"),
            ],
            default_model="gpt-4o-mini",
            supports_streaming=True,
            context_window=128000,
            docs_url="https://platform.openai.com/docs",
            pricing_url="https://openai.com/pricing",
            console_url="https://platform.openai.com/api-keys",
        )

    def edit(
        self,
        text: str,
        command: str,
        model: Optional[str] = None,
        **kwargs
    ) -> Tuple[str, Dict[str, Any]]:
        from settings_service import settings_service

        model_name = model or settings_service.get("providers.ai_edit.openai.model", "gpt-4o-mini")

        payload = {
            "model": model_name,
            "messages": [
                {"role": "system", "content": "You edit text. Return only the edited text."},
                {"role": "user", "content": build_prompt(text, command)},
            ],
            "temperature": 0.2,
        }

        response = self.client.post("/v1/chat/completions", json=payload)
        data = response.json()

        content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        return content.strip(), {
            "provider": "openai",
            "model": model_name
        }
