"""DeepSeek AI Provider - OpenAI-compatible API"""

from typing import Optional, Dict, Any, Tuple

from .base import AIProvider, AIProviderInfo, build_prompt
from ..base import ProviderType, ModelVariant
from core.api_provider import BaseAPIProvider, APIProviderConfig


class DeepSeekProvider(BaseAPIProvider, AIProvider):
    """DeepSeek models via OpenAI-compatible API"""

    CONFIG = APIProviderConfig(
        provider_id="deepseek",
        provider_name="DeepSeek",
        api_key_name="deepseek",
        base_url="https://api.deepseek.com"
    )

    def __init__(self):
        BaseAPIProvider.__init__(self)

    def _create_client(self):
        """Create client with configurable base URL."""
        from settings_service import settings_service
        from core.http_client import APIClient, APIClientConfig

        # Allow custom base URL from settings
        base_url = settings_service.get(
            "providers.ai_edit.deepseek.base_url",
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
            id="deepseek",
            name="DeepSeek",
            description="DeepSeek models. Cost-effective with good quality.",
            type=ProviderType.API,
            requires_api_key="deepseek",
            models=[
                ModelVariant(id="deepseek-chat", name="DeepSeek Chat", description="General purpose"),
                ModelVariant(id="deepseek-coder", name="DeepSeek Coder", description="Code-focused"),
            ],
            default_model="deepseek-chat",
            supports_streaming=True,
            context_window=32000,
            docs_url="https://platform.deepseek.com/docs",
            pricing_url="https://platform.deepseek.com/pricing",
            console_url="https://platform.deepseek.com/api_keys",
        )

    def edit(
        self,
        text: str,
        command: str,
        model: Optional[str] = None,
        **kwargs
    ) -> Tuple[str, Dict[str, Any]]:
        from settings_service import settings_service

        model_name = model or settings_service.get("providers.ai_edit.deepseek.model", "deepseek-chat")

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
            "provider": "deepseek",
            "model": model_name
        }
