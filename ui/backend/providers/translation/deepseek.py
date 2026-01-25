"""DeepSeek Translation Provider - LLM translation via OpenAI-compatible API."""

from typing import Optional, Dict, Any, Tuple

from .base import TranslationProvider, TranslationProviderInfo
from ..base import ProviderType, ModelVariant
from core.api_provider import BaseAPIProvider, APIProviderConfig


class DeepSeekTranslationProvider(BaseAPIProvider, TranslationProvider):
    """DeepSeek translation using OpenAI-compatible API."""

    CONFIG = APIProviderConfig(
        provider_id="deepseek",
        provider_name="DeepSeek Translate",
        api_key_name="deepseek",
        base_url="https://api.deepseek.com"
    )

    def __init__(self):
        BaseAPIProvider.__init__(self)

    def _create_client(self):
        """Create client with configurable base URL."""
        from settings_service import settings_service
        from core.http_client import APIClient, APIClientConfig

        base_url = settings_service.get(
            "providers.translation.deepseek.base_url",
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
    def get_info(cls) -> TranslationProviderInfo:
        return TranslationProviderInfo(
            id="deepseek",
            name="DeepSeek Translate",
            description="LLM-based translation using DeepSeek models.",
            type=ProviderType.API,
            requires_api_key="deepseek",
            supported_languages=["multilingual"],
            models=[
                ModelVariant(id="deepseek-chat", name="DeepSeek Chat", description="Default model"),
            ],
            default_model="deepseek-chat",
            supports_auto_detect=True,
            docs_url="https://platform.deepseek.com/docs",
            pricing_url="https://platform.deepseek.com/pricing",
            console_url="https://platform.deepseek.com/api_keys",
        )

    def translate(
        self,
        text: str,
        source_lang: str = "auto",
        target_lang: str = "en",
        model: Optional[str] = None,
        **kwargs
    ) -> Tuple[str, Dict[str, Any]]:
        from settings_service import settings_service

        model_name = model or settings_service.get(
            "providers.translation.deepseek.model",
            "deepseek-chat",
        )

        source_name = "the original language" if source_lang == "auto" else source_lang
        prompt = (
            f"Translate the following text from {source_name} to {target_lang}. "
            "Return only the translated text, nothing else.\n\n"
            f"Text:\n{text}"
        )

        payload = {
            "model": model_name,
            "messages": [
                {"role": "system", "content": "You are a professional translator. Return only the translation."},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.1,
        }

        response = self.client.post("/v1/chat/completions", json=payload)
        data = response.json()

        content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        return content.strip(), {"provider": "deepseek", "model": model_name}
