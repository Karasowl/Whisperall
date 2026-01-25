"""DeepL Translation Provider - High quality API translation"""

from typing import Optional, Dict, Any, Tuple

from .base import TranslationProvider, TranslationProviderInfo
from ..base import ProviderType
from core.api_provider import BaseAPIProvider, APIProviderConfig


class DeepLProvider(BaseAPIProvider, TranslationProvider):
    """DeepL API for high-quality translation"""

    CONFIG = APIProviderConfig(
        provider_id="deepl",
        provider_name="DeepL",
        api_key_name="deepl",
        base_url="https://api-free.deepl.com",
        timeout=60
    )

    def __init__(self):
        BaseAPIProvider.__init__(self)

    def _get_auth_header(self, api_key: str) -> Dict[str, str]:
        """DeepL uses DeepL-Auth-Key header."""
        return {"Authorization": f"DeepL-Auth-Key {api_key}"}

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
        data = {
            "text": text,
            "target_lang": target_lang.upper(),
        }
        if source_lang != "auto":
            data["source_lang"] = source_lang.upper()

        response = self.client.post("/v2/translate", data=data)
        result = response.json()

        translations = result.get("translations") or []
        translated_text = translations[0].get("text", "") if translations else ""

        return translated_text, {
            "provider": "deepl",
            "detected_source": translations[0].get("detected_source_language", source_lang) if translations else source_lang
        }
