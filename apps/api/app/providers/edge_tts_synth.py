import base64
import logging

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


async def synthesize(text: str, voice: str | None = None, language: str | None = None) -> str:
    """Synthesize speech via Edge TTS (free, no API key). Returns URL or data URI."""
    if voice:
        voice_name = voice
    else:
        lang = (language or "en").split("-")[0].lower()
        voice_name = VOICES.get(lang, DEFAULT_VOICE)

    communicate = edge_tts.Communicate(text, voice_name)
    audio_data = b""
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio_data += chunk["data"]

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
