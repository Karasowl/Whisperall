"""Zhipu Translation Provider - LLM translation via OpenAI-compatible API."""

from typing import Optional, Dict, Any, Tuple

import requests

from .base import TranslationProvider, TranslationProviderInfo
from ..base import ProviderType, ModelVariant


class ZhipuTranslationProvider(TranslationProvider):
    """Zhipu (GLM) translation using OpenAI-compatible API."""

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

        key = settings_service.get_api_key("zhipu")
        if not key:
            raise RuntimeError("Zhipu (GLM) API key is not configured")

        base_url = settings_service.get(
            "providers.translation.zhipu.base_url",
            "https://open.bigmodel.cn/api/paas",
        )
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

        resp = requests.post(
            f"{base_url.rstrip('/')}/v1/chat/completions",
            headers={"Authorization": f"Bearer {key}"},
            json=payload,
            timeout=120,
        )
        if resp.status_code != 200:
            raise RuntimeError(f"Zhipu translation error: HTTP {resp.status_code}")

        data = resp.json()
        content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        return content.strip(), {"provider": "zhipu", "model": model_name}
