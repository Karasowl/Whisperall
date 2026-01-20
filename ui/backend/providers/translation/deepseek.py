"""DeepSeek Translation Provider - LLM translation via OpenAI-compatible API."""

from typing import Optional, Dict, Any, Tuple

import requests

from .base import TranslationProvider, TranslationProviderInfo
from ..base import ProviderType, ModelVariant


class DeepSeekTranslationProvider(TranslationProvider):
    """DeepSeek translation using OpenAI-compatible API."""

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

        key = settings_service.get_api_key("deepseek")
        if not key:
            raise RuntimeError("DeepSeek API key is not configured")

        base_url = settings_service.get(
            "providers.translation.deepseek.base_url",
            "https://api.deepseek.com",
        )
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

        resp = requests.post(
            f"{base_url.rstrip('/')}/v1/chat/completions",
            headers={"Authorization": f"Bearer {key}"},
            json=payload,
            timeout=120,
        )
        if resp.status_code != 200:
            raise RuntimeError(f"DeepSeek translation error: HTTP {resp.status_code}")

        data = resp.json()
        content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        return content.strip(), {"provider": "deepseek", "model": model_name}
