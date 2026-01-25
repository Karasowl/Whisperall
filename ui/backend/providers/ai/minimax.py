"""MiniMax AI Provider - OpenAI-compatible API."""

from typing import Optional, Dict, Any, Tuple

from .base import AIProvider, AIProviderInfo, build_prompt
from ..base import ProviderType, ModelVariant
from core.api_provider import BaseAPIProvider, APIProviderConfig


class MiniMaxProvider(BaseAPIProvider, AIProvider):
    """MiniMax models via OpenAI-compatible API."""

    CONFIG = APIProviderConfig(
        provider_id="minimax",
        provider_name="MiniMax",
        api_key_name="minimax",
        base_url="https://api.minimax.chat"
    )

    def __init__(self):
        BaseAPIProvider.__init__(self)

    def _create_client(self):
        """Create client with configurable base URL."""
        from settings_service import settings_service
        from core.http_client import APIClient, APIClientConfig

        base_url = settings_service.get(
            "providers.ai_edit.minimax.base_url",
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
            id="minimax",
            name="MiniMax",
            description="MiniMax LLMs for fast, reliable text edits.",
            type=ProviderType.API,
            requires_api_key="minimax",
            models=[
                ModelVariant(id="MiniMax-M2", name="MiniMax M2", description="Default model"),
            ],
            default_model="MiniMax-M2",
            supports_streaming=True,
            context_window=64000,
            docs_url="https://platform.minimax.io/docs",
            pricing_url="https://platform.minimax.io/docs/pricing/overview",
            console_url="https://platform.minimax.io/user-center/basic-information",
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
            "providers.ai_edit.minimax.model",
            "MiniMax-M2",
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
        return content.strip(), {"provider": "minimax", "model": model_name}
