import logging
import httpx

from ..config import settings

log = logging.getLogger(__name__)


async def transcribe(
    audio_bytes: bytes,
    language: str | None = None,
    prompt: str | None = None,
    model: str = "gpt-4o-mini-transcribe",
    content_type: str = "audio/webm",
) -> str:
    """Transcribe audio via OpenAI Whisper-compatible endpoint."""
    if not settings.openai_api_key:
        return "[openai-stub] transcribed text"

    ext = content_type.split("/")[-1].split(";")[0]  # webm, wav, mp3, etc.
    filename = f"audio.{ext}"

    async with httpx.AsyncClient(timeout=60) as client:
        files = {"file": (filename, audio_bytes, content_type)}
        data: dict = {"model": model}
        if language:
            data["language"] = language
        if prompt:
            data["prompt"] = prompt

        resp = await client.post(
            "https://api.openai.com/v1/audio/transcriptions",
            headers={"Authorization": f"Bearer {settings.openai_api_key}"},
            files=files,
            data=data,
        )
        resp.raise_for_status()
        return resp.json()["text"]


async def diarize(
    audio_bytes: bytes,
    language: str | None = None,
    content_type: str = "audio/webm",
) -> str:
    """Transcribe audio with speaker diarization via OpenAI."""
    if not settings.openai_api_key:
        return "[openai-stub] diarized text"

    # Strip codec params (e.g. "audio/webm;codecs=opus" → "audio/webm")
    clean_ct = content_type.split(";")[0].strip()
    ext = clean_ct.split("/")[-1]
    filename = f"audio.{ext}"

    log.info("diarize: %d bytes, ct=%s, file=%s", len(audio_bytes), clean_ct, filename)

    async with httpx.AsyncClient(timeout=120) as client:
        files = {"file": (filename, audio_bytes, clean_ct)}
        data: dict = {"model": "gpt-4o-transcribe"}
        if language:
            data["language"] = language

        resp = await client.post(
            "https://api.openai.com/v1/audio/transcriptions",
            headers={"Authorization": f"Bearer {settings.openai_api_key}"},
            files=files,
            data=data,
        )
        resp.raise_for_status()
        body = resp.json()
        log.info("diarize response: %s", str(body)[:500])
        return body.get("text", "")
