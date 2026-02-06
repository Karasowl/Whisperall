import httpx

from ..config import settings


async def transcribe(
    audio_bytes: bytes,
    language: str | None = None,
    prompt: str | None = None,
    model: str = "gpt-4o-mini-transcribe",
) -> str:
    """Transcribe audio via OpenAI Whisper-compatible endpoint."""
    if not settings.openai_api_key:
        return "[openai-stub] transcribed text"

    async with httpx.AsyncClient(timeout=60) as client:
        files = {"file": ("audio.wav", audio_bytes, "audio/wav")}
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
) -> list[dict]:
    """Diarize audio via OpenAI gpt-4o-transcribe-diarize."""
    if not settings.openai_api_key:
        return [{"speaker": "A", "start": 0.0, "end": 1.0, "text": "[openai-stub] diarized"}]

    async with httpx.AsyncClient(timeout=120) as client:
        files = {"file": ("audio.wav", audio_bytes, "audio/wav")}
        data: dict = {"model": "gpt-4o-transcribe-diarize"}
        if language:
            data["language"] = language

        resp = await client.post(
            "https://api.openai.com/v1/audio/transcriptions",
            headers={"Authorization": f"Bearer {settings.openai_api_key}"},
            files=files,
            data=data,
        )
        resp.raise_for_status()
        return resp.json().get("segments", [])
