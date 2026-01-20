"""DeepL Translation Provider - High quality API translation"""

from typing import Optional, Dict, Any, Tuple

import requests

from .base import TranslationProvider, TranslationProviderInfo
from ..base import ProviderType


class DeepLProvider(TranslationProvider):
    """DeepL API for high-quality translation"""

    @classmethod
    def get_info(cls) -> TranslationProviderInfo:
        return TranslationProviderInfo(
            id="deepl",
            name="DeepL",
            description="High-quality translation with nuanced language understanding.",
            type=ProviderType.API,
            requires_api_key="deepl",
            supported_languages=["en", "es", "fr", "de", "pt", "it", "nl", "pl", "ja", "zh"],
            supports_auto_detect=True,
            docs_url="https://www.deepl.com/docs-api",
            pricing_url="https://www.deepl.com/pro#developer",
            console_url="https://www.deepl.com/account/summary",
        )

    def translate(
        self,
        text: str,
        source_lang: str = "auto",
        target_lang: str = "en",
        **kwargs
    ) -> Tuple[str, Dict[str, Any]]:
        from settings_service import settings_service

        key = settings_service.get_api_key("deepl")
        if not key:
            raise RuntimeError("DeepL API key is not configured")

        data = {
            "text": text,
            "target_lang": target_lang.upper(),
        }
        if source_lang != "auto":
            data["source_lang"] = source_lang.upper()

        resp = requests.post(
            "https://api-free.deepl.com/v2/translate",
            headers={"Authorization": f"DeepL-Auth-Key {key}"},
            data=data,
            timeout=60
        )

        if resp.status_code != 200:
            raise RuntimeError(f"DeepL error: HTTP {resp.status_code}")

        result = resp.json()
        translations = result.get("translations") or []
        translated_text = translations[0].get("text", "") if translations else ""

        return translated_text, {
            "provider": "deepl",
            "detected_source": translations[0].get("detected_source_language", source_lang) if translations else source_lang
        }
