import httpx

from ..config import settings


async def transcribe_chunk(
    audio_bytes: bytes,
    language: str | None = None,
    model: str = "whisper-large-v3-turbo",
    filename: str = "audio.wav",
    content_type: str = "audio/wav",
) -> str:
    """Transcribe audio via Groq Whisper endpoint."""
    if not settings.groq_api_key:
        return "[groq-stub] transcribed chunk"

    async with httpx.AsyncClient(timeout=60) as client:
        files = {"file": (filename, audio_bytes, content_type)}
        data: dict = {"model": model}
        if language:
            data["language"] = language

        resp = await client.post(
            "https://api.groq.com/openai/v1/audio/transcriptions",
            headers={"Authorization": f"Bearer {settings.groq_api_key}"},
            files=files,
            data=data,
        )
        resp.raise_for_status()
        return resp.json()["text"]
