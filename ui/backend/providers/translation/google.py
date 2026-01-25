"""Google Translation Provider - Cloud translation API"""

from typing import Optional, Dict, Any, Tuple

from .base import TranslationProvider, TranslationProviderInfo
from ..base import ProviderType
from core.api_provider import BaseAPIProvider, APIProviderConfig


class GoogleProvider(BaseAPIProvider, TranslationProvider):
    """Google Cloud Translation API"""

    CONFIG = APIProviderConfig(
        provider_id="google",
        provider_name="Google Translate",
        api_key_name="google",
        base_url="https://translation.googleapis.com",
        timeout=60
    )

    def __init__(self):
        BaseAPIProvider.__init__(self)

    def _get_auth_header(self, api_key: str) -> Dict[str, str]:
        """Google uses key in request body, not header."""
        return {}

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
        # Google uses API key in request body
        params = {
            "key": self._api_key,
            "q": text,
            "target": target_lang,
        }
        if source_lang != "auto":
            params["source"] = source_lang

        response = self.client.post("/language/translate/v2", data=params)
        result = response.json()

        translations = result.get("data", {}).get("translations") or []
        translated_text = translations[0].get("translatedText", "") if translations else ""

        return translated_text, {
            "provider": "google",
            "detected_source": translations[0].get("detectedSourceLanguage", source_lang) if translations else source_lang
        }
