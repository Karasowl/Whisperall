"""Google Translation Provider - Cloud translation API"""

from typing import Optional, Dict, Any, Tuple

import requests

from .base import TranslationProvider, TranslationProviderInfo
from ..base import ProviderType


class GoogleProvider(TranslationProvider):
    """Google Cloud Translation API"""

    @classmethod
    def get_info(cls) -> TranslationProviderInfo:
        return TranslationProviderInfo(
            id="google",
            name="Google Translate",
            description="Google's neural machine translation. Wide language support.",
            type=ProviderType.API,
            requires_api_key="google",
            supported_languages=["multilingual"],  # Supports 100+ languages
            supports_auto_detect=True,
            docs_url="https://cloud.google.com/translate/docs",
            pricing_url="https://cloud.google.com/translate/pricing",
            console_url="https://console.cloud.google.com/apis/credentials",
        )

    def translate(
        self,
        text: str,
        source_lang: str = "auto",
        target_lang: str = "en",
        **kwargs
    ) -> Tuple[str, Dict[str, Any]]:
        from settings_service import settings_service

        key = settings_service.get_api_key("google")
        if not key:
            raise RuntimeError("Google Translate API key is not configured")

        params = {
            "key": key,
            "q": text,
            "target": target_lang,
        }
        if source_lang != "auto":
            params["source"] = source_lang

        resp = requests.post(
            "https://translation.googleapis.com/language/translate/v2",
            data=params,
            timeout=60
        )

        if resp.status_code != 200:
            raise RuntimeError(f"Google Translate error: HTTP {resp.status_code}")

        result = resp.json()
        translations = result.get("data", {}).get("translations") or []
        translated_text = translations[0].get("translatedText", "") if translations else ""

        return translated_text, {
            "provider": "google",
            "detected_source": translations[0].get("detectedSourceLanguage", source_lang) if translations else source_lang
        }
