"""Zhipu Translation Provider - LLM translation via OpenAI-compatible API."""

from typing import Optional, Dict, Any, Tuple

from .base import TranslationProvider, TranslationProviderInfo
from ..base import ProviderType, ModelVariant
from core.api_provider import BaseAPIProvider, APIProviderConfig


class ZhipuTranslationProvider(BaseAPIProvider, TranslationProvider):
    """Zhipu (GLM) translation using OpenAI-compatible API."""

    CONFIG = APIProviderConfig(
        provider_id="zhipu",
        provider_name="Zhipu Translate",
        api_key_name="zhipu",
        base_url="https://open.bigmodel.cn/api/paas"
    )

    def __init__(self):
        BaseAPIProvider.__init__(self)

    def _create_client(self):
        """Create client with configurable base URL."""
        from settings_service import settings_service
        from core.http_client import APIClient, APIClientConfig

        base_url = settings_service.get(
            "providers.translation.zhipu.base_url",
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
            id="zhipu",
            name="GLM Translate",
            description="LLM-based translation using GLM models.",
            type=ProviderType.API,
            requires_api_key="zhipu",
            supported_languages=["multilingual"],
            models=[
                ModelVariant(id="glm-4-plus", name="GLM-4 Plus", description="Default model"),
            ],
            default_model="glm-4-plus",
            supports_auto_detect=True,
            docs_url="https://open.bigmodel.cn/dev/api",
            pricing_url="https://open.bigmodel.cn/pricing",
            console_url="https://open.bigmodel.cn/usercenter/apikeys",
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
            "providers.translation.zhipu.model",
            "glm-4-plus",
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
        return content.strip(), {"provider": "zhipu", "model": model_name}
