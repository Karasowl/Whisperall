import base64

import httpx

from ..config import settings
from ..db import get_supabase_or_none


async def synthesize(
    text: str,
    voice: str | None = None,
    language_code: str = "en-US",
) -> str:
    """Synthesize speech via Google Cloud TTS WaveNet and upload to Supabase Storage."""
    if not settings.google_tts_api_key:
        return "https://storage.example.com/stub-audio.mp3"

    voice_name = voice or "en-US-WaveNet-D"
    body = {
        "input": {"text": text},
        "voice": {"languageCode": language_code, "name": voice_name},
        "audioConfig": {"audioEncoding": "MP3"},
    }

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            "https://texttospeech.googleapis.com/v1/text:synthesize",
            params={"key": settings.google_tts_api_key},
            json=body,
        )
        resp.raise_for_status()
        audio_b64 = resp.json()["audioContent"]

    audio_bytes = base64.b64decode(audio_b64)
    db = get_supabase_or_none()
    if db:
        import uuid
        path = f"tts/{uuid.uuid4()}.mp3"
        db.storage.from_("audio").upload(path, audio_bytes, {"content-type": "audio/mpeg"})
        url = db.storage.from_("audio").get_public_url(path)
        return url

    return "https://storage.example.com/tts-output.mp3"
