"""Argos Translation Provider - Local offline translation"""

from typing import Optional, Dict, Any, Tuple

from .base import TranslationProvider, TranslationProviderInfo
from ..base import ProviderType


class ArgosProvider(TranslationProvider):
    """Local translation using Argos Translate"""

    @classmethod
    def get_info(cls) -> TranslationProviderInfo:
        return TranslationProviderInfo(
            id="argos",
            name="Argos (Local)",
            description="Offline translation. Free, private, no internet required.",
            type=ProviderType.LOCAL,
            requires_model_download="argos-en-es",  # Example pair
            supported_languages=["en", "es", "fr", "de", "pt", "it", "zh", "ja", "ko", "ru"],
            supports_auto_detect=False,
            docs_url="https://github.com/argosopentech/argos-translate",
        )

    def translate(
        self,
        text: str,
        source_lang: str = "auto",
        target_lang: str = "en",
        **kwargs
    ) -> Tuple[str, Dict[str, Any]]:
        try:
            import argostranslate.translate as argos_translate
        except ImportError as exc:
            raise RuntimeError(
                "Local translation engine is not available. "
                "Visit the Models page to install translation packages."
            ) from exc

        from settings_service import settings_service

        if source_lang == "auto":
            source_lang = settings_service.get("providers.translation.argos.source_lang", "en")

        installed_languages = argos_translate.get_installed_languages()
        from_lang = next((l for l in installed_languages if l.code == source_lang), None)
        to_lang = next((l for l in installed_languages if l.code == target_lang), None)

        if not from_lang or not to_lang:
            raise RuntimeError(
                f"Argos language pair {source_lang}->{target_lang} is not installed. "
                "Go to Models page to download language pairs."
            )

        translation = from_lang.get_translation(to_lang)
        return translation.translate(text), {
            "provider": "argos",
            "source_lang": source_lang,
            "target_lang": target_lang
        }
