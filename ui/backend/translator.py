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

    def _translate_llm(self, provider_id: str, base_url: str, key: str, model: str, text: str, source_lang: str, target_lang: str) -> Tuple[str, dict]:
        """Generic LLM-based translation using OpenAI-compatible API."""
        lang_names = {
            "en": "English", "es": "Spanish", "fr": "French", "de": "German",
            "it": "Italian", "pt": "Portuguese", "zh": "Chinese", "ja": "Japanese",
            "ko": "Korean", "ru": "Russian", "ar": "Arabic", "auto": "the original language"
        }
        source_name = lang_names.get(source_lang, source_lang)
        target_name = lang_names.get(target_lang, target_lang)

        prompt = f"Translate the following text from {source_name} to {target_name}. Return only the translated text, nothing else.\n\nText:\n{text}"

        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": "You are a professional translator. Translate accurately and naturally. Return only the translation."},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.1,
        }
        resp = requests.post(
            f"{base_url.rstrip('/')}/v1/chat/completions",
            headers={"Authorization": f"Bearer {key}"},
            json=payload,
            timeout=120
        )
        if resp.status_code != 200:
            raise RuntimeError(f"{provider_id} translation error: HTTP {resp.status_code}")

        data = resp.json()
        content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        return content.strip(), {"provider": provider_id, "model": model}

    def _translate_deepseek(self, text: str, source_lang: str, target_lang: str) -> Tuple[str, dict]:
        key = settings_service.get_api_key("deepseek")
        if not key:
            raise RuntimeError("DeepSeek API key is not configured")

        model = settings_service.get("providers.translation.deepseek.model", "deepseek-chat")
        base_url = settings_service.get("providers.translation.deepseek.base_url", "https://api.deepseek.com")
        return self._translate_llm("deepseek", base_url, key, model, text, source_lang, target_lang)

    def _translate_zhipu(self, text: str, source_lang: str, target_lang: str) -> Tuple[str, dict]:
        key = settings_service.get_api_key("zhipu")
        if not key:
            raise RuntimeError("Zhipu (GLM-4.7) API key is not configured")

        model = settings_service.get("providers.translation.zhipu.model", "glm-4-plus")
        base_url = settings_service.get("providers.translation.zhipu.base_url", "https://open.bigmodel.cn/api/paas")
        return self._translate_llm("zhipu", base_url, key, model, text, source_lang, target_lang)

    def translate(self, text: str, source_lang: str = "auto", target_lang: str = "en", provider: Optional[str] = None):
        provider = provider or settings_service.get_selected_provider("translation")

        if provider == "argos":
            return self._translate_argos(text, source_lang, target_lang)
        if provider == "deepl":
            return self._translate_deepl(text, source_lang, target_lang)
        if provider == "google":
            return self._translate_google(text, source_lang, target_lang)
        if provider == "deepseek":
            return self._translate_deepseek(text, source_lang, target_lang)
        if provider == "zhipu":
            return self._translate_zhipu(text, source_lang, target_lang)

        raise RuntimeError(f"Translation provider not supported: {provider}")


_service: Optional[TranslationService] = None


def get_translation_service() -> TranslationService:
    global _service
    if _service is None:
        _service = TranslationService()
    return _service
