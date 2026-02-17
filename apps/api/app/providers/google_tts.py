import base64
import logging
import time

import httpx

from ..config import settings
from ..db import get_supabase_or_none
from . import edge_tts_synth

log = logging.getLogger(__name__)

# WaveNet voices (high quality) — one per language by default.
# Note: Users can override via `voice` to any supported Google voice name.
VOICES: dict[str, tuple[str, str]] = {
    # lang -> (language_code, voice_name)
    "en": ("en-US", "en-US-Wavenet-D"),
    "es": ("es-US", "es-US-Wavenet-A"),
    "fr": ("fr-FR", "fr-FR-Wavenet-A"),
    "de": ("de-DE", "de-DE-Wavenet-A"),
    "pt": ("pt-BR", "pt-BR-Wavenet-A"),
    "it": ("it-IT", "it-IT-Wavenet-A"),
    "ja": ("ja-JP", "ja-JP-Wavenet-A"),
    "ko": ("ko-KR", "ko-KR-Wavenet-A"),
    "zh": ("cmn-CN", "cmn-CN-Wavenet-A"),
}

DEFAULT_LANG = "en"


def _normalize_google_voice_name(voice: str) -> str:
    # Be forgiving about casing users might copy/paste (WaveNet vs Wavenet).
    v = (voice or "").strip()
    v = v.replace("WaveNet", "Wavenet")
    return v


def _infer_language_code_from_voice(voice: str) -> str | None:
    parts = (voice or "").split("-")
    if len(parts) < 2:
        return None
    if not parts[0] or not parts[1]:
        return None
    return f"{parts[0]}-{parts[1]}"


def _resolve_voice(language: str | None, voice: str | None) -> tuple[str, str]:
    """Return (language_code, voice_name) given user overrides."""
    if voice:
        voice_name = _normalize_google_voice_name(voice)
        language_code = _infer_language_code_from_voice(voice_name)
        # If the voice doesn't follow the typical locale prefix, keep the
        # requested voice but fall back to the language-based locale.
        if language_code:
            return language_code, voice_name
        base_lang = (language or DEFAULT_LANG).split("-")[0].lower()
        return VOICES.get(base_lang, VOICES[DEFAULT_LANG])[0], voice_name

    base_lang = (language or DEFAULT_LANG).split("-")[0].lower()
    return VOICES.get(base_lang, VOICES[DEFAULT_LANG])


async def synthesize(
    text: str,
    voice: str | None = None,
    language: str | None = None,
) -> str:
    """Google TTS (primary) with Edge TTS fallback."""
    if voice and voice.strip().lower() == "auto":
        voice = None
    if language and language.strip().lower() == "auto":
        language = None

    # If the requested voice is clearly an Edge voice, avoid a failed Google request.
    if voice and voice.strip().lower().endswith("neural"):
        return await edge_tts_synth.synthesize(text, voice, language)

    # No Google key → free Edge TTS fallback
    if not settings.google_tts_api_key:
        log.info("No Google TTS key, falling back to Edge TTS")
        return await edge_tts_synth.synthesize(text, voice, language)

    language_code, voice_name = _resolve_voice(language, voice)

    body = {
        "input": {"text": text},
        "voice": {"languageCode": language_code, "name": voice_name},
        "audioConfig": {"audioEncoding": "MP3"},
    }

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                "https://texttospeech.googleapis.com/v1/text:synthesize",
                params={"key": settings.google_tts_api_key},
                json=body,
            )
            resp.raise_for_status()
            audio_b64 = resp.json()["audioContent"]
    except Exception as exc:
        log.warning("Google TTS failed (%s), falling back to Edge TTS", exc)
        return await edge_tts_synth.synthesize(text, voice, language)

    audio_bytes = base64.b64decode(audio_b64)
    db = get_supabase_or_none()
    if db:
        import uuid
        path = f"tts/{uuid.uuid4()}.mp3"
        db.storage.from_("audio").upload(path, audio_bytes, {"content-type": "audio/mpeg"})
        return db.storage.from_("audio").get_public_url(path)

    # Dev without storage: return base64 data URL
    return f"data:audio/mpeg;base64,{audio_b64}"


_VOICES_CACHE: tuple[float, list[dict]] | None = None
_VOICES_TTL_SEC = 6 * 60 * 60


def _base_lang(locale: str) -> str:
    base = (locale or "").split("-")[0].lower()
    # Google uses "cmn-CN" for Mandarin.
    if base in ("cmn", "yue"):
        return "zh"
    return base


async def list_voices(languages: set[str] | None = None) -> list[dict]:
    """Return available Google voices (WaveNet/Neural2), filtered by base language."""
    global _VOICES_CACHE
    if not settings.google_tts_api_key:
        return []

    now = time.time()
    if _VOICES_CACHE and (now - _VOICES_CACHE[0]) < _VOICES_TTL_SEC:
        voices = _VOICES_CACHE[1]
    else:
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                resp = await client.get(
                    "https://texttospeech.googleapis.com/v1/voices",
                    params={"key": settings.google_tts_api_key},
                )
                resp.raise_for_status()
                data = resp.json() or {}
        except Exception as exc:
            log.warning("Google voices list failed (%s)", exc)
            return []

        voices = []
        for v in data.get("voices", []) or []:
            name = v.get("name")
            if not name:
                continue
            # Keep the high-quality families; Standard voices are lower quality.
            if "Wavenet" not in name and "Neural2" not in name:
                continue

            lang_codes = v.get("languageCodes") or []
            locale = lang_codes[0] if lang_codes else (_infer_language_code_from_voice(name) or "")
            gender = v.get("ssmlGender")
            label = f"{locale} · {name}"
            if gender:
                label = f"{label} · {gender}"

            voices.append({
                "provider": "google",
                "name": name,
                "locale": locale,
                "gender": gender,
                "label": label,
            })

        _VOICES_CACHE = (now, voices)

    if not languages:
        return voices

    langs = set(languages)
    return [v for v in voices if _base_lang(str(v.get("locale", ""))) in langs]
