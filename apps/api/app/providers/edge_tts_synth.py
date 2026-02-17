import base64
import logging
import time

import edge_tts

from ..db import get_supabase_or_none

log = logging.getLogger(__name__)

VOICES: dict[str, str] = {
    "en": "en-US-AriaNeural",
    "es": "es-MX-DaliaNeural",
    "fr": "fr-FR-DeniseNeural",
    "de": "de-DE-KatjaNeural",
    "pt": "pt-BR-FranciscaNeural",
    "it": "it-IT-ElsaNeural",
    "ja": "ja-JP-NanamiNeural",
    "ko": "ko-KR-SunHiNeural",
    "zh": "zh-CN-XiaoxiaoNeural",
}

DEFAULT_VOICE = "en-US-AriaNeural"


async def _synthesize_bytes(text: str, voice_name: str) -> bytes:
    communicate = edge_tts.Communicate(text, voice_name)
    audio_data = b""
    async for chunk in communicate.stream():
        if chunk.get("type") == "audio":
            audio_data += chunk.get("data", b"")
    return audio_data


async def synthesize(text: str, voice: str | None = None, language: str | None = None) -> str:
    """Synthesize speech via Edge TTS (free, no API key). Returns URL or data URI."""
    lang = (language or "en").split("-")[0].lower()
    voice_name = voice or VOICES.get(lang, DEFAULT_VOICE)

    try:
        audio_data = await _synthesize_bytes(text, voice_name)
    except Exception as exc:
        # If user picked a non-Edge voice (e.g. a Google voice name), fall back gracefully.
        if voice:
            fallback_voice = VOICES.get(lang, DEFAULT_VOICE)
            log.warning("Edge TTS failed for voice=%s (%s). Falling back to %s", voice, exc, fallback_voice)
            audio_data = await _synthesize_bytes(text, fallback_voice)
        else:
            raise

    if not audio_data:
        raise RuntimeError("Edge TTS returned no audio data")

    db = get_supabase_or_none()
    if db:
        import uuid
        path = f"tts/{uuid.uuid4()}.mp3"
        db.storage.from_("audio").upload(path, audio_data, {"content-type": "audio/mpeg"})
        return db.storage.from_("audio").get_public_url(path)

    b64 = base64.b64encode(audio_data).decode()
    return f"data:audio/mpeg;base64,{b64}"


_VOICES_CACHE: tuple[float, list[dict]] | None = None
_VOICES_TTL_SEC = 6 * 60 * 60


def _base_lang(locale: str) -> str:
    base = (locale or "").split("-")[0].lower()
    # Some services report Mandarin as cmn-*.
    if base in ("cmn", "yue"):
        return "zh"
    return base


async def list_voices(languages: set[str] | None = None) -> list[dict]:
    """Return available Edge voices (filtered by base language, if provided)."""
    global _VOICES_CACHE
    now = time.time()
    if _VOICES_CACHE and (now - _VOICES_CACHE[0]) < _VOICES_TTL_SEC:
        voices = _VOICES_CACHE[1]
    else:
        raw = await edge_tts.list_voices()
        voices = []
        for v in raw:
            short = v.get("ShortName")
            locale = v.get("Locale")
            if not short or not locale:
                continue
            voices.append({
                "provider": "edge",
                "name": short,
                "locale": locale,
                "gender": v.get("Gender"),
                "label": v.get("FriendlyName") or short,
            })
        _VOICES_CACHE = (now, voices)

    if not languages:
        return voices

    return [v for v in voices if _base_lang(str(v.get("locale", ""))) in languages]
