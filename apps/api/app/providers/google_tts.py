import base64
import logging

import httpx

from ..config import settings
from ..db import get_supabase_or_none
from . import edge_tts_synth

log = logging.getLogger(__name__)

# Standard voices ($4/1M chars) — one per language
VOICES: dict[str, tuple[str, str]] = {
    # lang -> (language_code, voice_name)
    "en": ("en-US", "en-US-Standard-D"),
    "es": ("es-US", "es-US-Standard-A"),
    "fr": ("fr-FR", "fr-FR-Standard-A"),
    "de": ("de-DE", "de-DE-Standard-A"),
    "pt": ("pt-BR", "pt-BR-Standard-A"),
    "it": ("it-IT", "it-IT-Standard-A"),
    "ja": ("ja-JP", "ja-JP-Standard-A"),
    "ko": ("ko-KR", "ko-KR-Standard-A"),
    "zh": ("cmn-CN", "cmn-CN-Standard-A"),
}

DEFAULT_LANG = "en"


def _resolve_voice(language: str | None) -> tuple[str, str]:
    """Return (language_code, voice_name) for the given language."""
    lang = (language or DEFAULT_LANG).split("-")[0].lower()
    return VOICES.get(lang, VOICES[DEFAULT_LANG])


async def synthesize(
    text: str,
    voice: str | None = None,
    language: str | None = None,
) -> str:
    """Google TTS Standard (primary) with Edge TTS fallback."""
    # No Google key → free Edge TTS fallback
    if not settings.google_tts_api_key:
        log.info("No Google TTS key, falling back to Edge TTS")
        return await edge_tts_synth.synthesize(text, voice, language)

    language_code, voice_name = _resolve_voice(language)
    if voice:
        voice_name = voice

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
