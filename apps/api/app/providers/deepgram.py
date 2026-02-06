import httpx

from ..config import settings


async def transcribe_chunk(
    audio_bytes: bytes,
    language: str | None = None,
) -> str:
    """Transcribe a short audio chunk via Deepgram."""
    if not settings.deepgram_api_key:
        return "[deepgram-stub] transcribed chunk"

    params: dict = {"model": "nova-2", "smart_format": "true", "punctuate": "true"}
    if language:
        params["language"] = language

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            "https://api.deepgram.com/v1/listen",
            headers={
                "Authorization": f"Token {settings.deepgram_api_key}",
                "Content-Type": "audio/wav",
            },
            params=params,
            content=audio_bytes,
        )
        resp.raise_for_status()
        result = resp.json()
        return result["results"]["channels"][0]["alternatives"][0]["transcript"]
