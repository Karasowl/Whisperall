"""
Translation service supporting local Argos and API providers.
"""

from __future__ import annotations

from typing import Optional, Tuple

import requests

from settings_service import settings_service


class TranslationService:
    def _translate_argos(self, text: str, source_lang: str, target_lang: str) -> Tuple[str, dict]:
        try:
            import argostranslate.translate as argos_translate
            import argostranslate.package
        except Exception as exc:
            raise RuntimeError("argostranslate is not installed") from exc

        if source_lang == "auto":
            source_lang = settings_service.get("providers.translation.argos.source_lang", "en")

        installed_languages = argos_translate.get_installed_languages()
        from_lang = next((l for l in installed_languages if l.code == source_lang), None)
        to_lang = next((l for l in installed_languages if l.code == target_lang), None)
        if not from_lang or not to_lang:
            raise RuntimeError("Argos language pair is not installed")

        translation = from_lang.get_translation(to_lang)
        return translation.translate(text), {"provider": "argos"}

    def _translate_deepl(self, text: str, source_lang: str, target_lang: str) -> Tuple[str, dict]:
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
        return translations[0].get("text", ""), {"provider": "deepl"}

    def _translate_google(self, text: str, source_lang: str, target_lang: str) -> Tuple[str, dict]:
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
        return translations[0].get("translatedText", ""), {"provider": "google"}

    def translate(self, text: str, source_lang: str = "auto", target_lang: str = "en", provider: Optional[str] = None):
        provider = provider or settings_service.get_selected_provider("translation")

        if provider == "argos":
            return self._translate_argos(text, source_lang, target_lang)
        if provider == "deepl":
            return self._translate_deepl(text, source_lang, target_lang)
        if provider == "google":
            return self._translate_google(text, source_lang, target_lang)

        raise RuntimeError(f"Translation provider not supported: {provider}")


_service: Optional[TranslationService] = None


def get_translation_service() -> TranslationService:
    global _service
    if _service is None:
        _service = TranslationService()
    return _service
