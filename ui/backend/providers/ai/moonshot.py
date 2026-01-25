"""Moonshot AI Provider - OpenAI-compatible Kimi models."""

from typing import Optional, Dict, Any, Tuple

from .base import AIProvider, AIProviderInfo, build_prompt
from ..base import ProviderType, ModelVariant
from core.api_provider import BaseAPIProvider, APIProviderConfig


class MoonshotProvider(BaseAPIProvider, AIProvider):
    """Moonshot (Kimi) models via OpenAI-compatible API."""

    CONFIG = APIProviderConfig(
        provider_id="moonshot",
        provider_name="Moonshot",
        api_key_name="moonshot",
        base_url="https://api.moonshot.ai"
    )

    def __init__(self):
        BaseAPIProvider.__init__(self)

    def _create_client(self):
        """Create client with configurable base URL."""
        from settings_service import settings_service
        from core.http_client import APIClient, APIClientConfig

        base_url = settings_service.get(
            "providers.ai_edit.moonshot.base_url",
            self._config.base_url
        )

        client_config = APIClientConfig(
            base_url=base_url,
            provider_name=self._config.provider_name,
            timeout=self._config.timeout,
            max_retries=self._config.max_retries
        )
        return APIClient(client_config, self._get_auth_header(self._api_key))

    @classmethod
    def get_info(cls) -> AIProviderInfo:
        return AIProviderInfo(
            id="moonshot",
            name="Moonshot (Kimi)",
            description="OpenAI-compatible Kimi LLMs for fast text editing.",
            type=ProviderType.API,
            requires_api_key="moonshot",
            models=[
                ModelVariant(id="kimi-k2-0905", name="Kimi K2 0905", description="Default model"),
            ],
            default_model="kimi-k2-0905",
            supports_streaming=True,
            context_window=200000,
            docs_url="https://platform.moonshot.ai/docs",
            pricing_url="https://platform.moonshot.ai/pricing",
            console_url="https://platform.moonshot.ai/console",
        )

    def edit(
        self,
        text: str,
        command: str,
        model: Optional[str] = None,
        **kwargs
    ) -> Tuple[str, Dict[str, Any]]:
        from settings_service import settings_service

        model_name = model or settings_service.get(
            "providers.ai_edit.moonshot.model",
            "kimi-k2-0905",
        )

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
        return content.strip(), {"provider": "moonshot", "model": model_name}
