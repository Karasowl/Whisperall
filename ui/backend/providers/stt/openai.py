"""OpenAI Whisper STT Provider - API-based transcription"""

from pathlib import Path
from typing import Optional, Dict, Any, Tuple

import requests

from .base import STTProvider, STTProviderInfo
from ..base import ProviderType, ModelVariant


class OpenAIWhisperProvider(STTProvider):
    """OpenAI Whisper API for transcription"""

    @classmethod
    def get_info(cls) -> STTProviderInfo:
        return STTProviderInfo(
            id="openai",
            name="OpenAI Whisper",
            description="Cloud-based transcription with excellent accuracy.",
            type=ProviderType.API,
            requires_api_key="openai",
            supported_languages=["multilingual"],
            models=[
                ModelVariant(id="whisper-1", name="Whisper-1", description="OpenAI's hosted Whisper model"),
            ],
            default_model="whisper-1",
            supports_vad=False,
            supports_timestamps=False,
            supports_diarization=False,
            docs_url="https://platform.openai.com/docs/guides/speech-to-text",
            pricing_url="https://openai.com/pricing",
            console_url="https://platform.openai.com/api-keys",
        )

    def transcribe(
        self,
        audio_path: Path,
        language: str = "auto",
        prompt: Optional[str] = None,
        **kwargs
    ) -> Tuple[str, Dict[str, Any]]:
        from settings_service import settings_service

        key = settings_service.get_api_key("openai")
        if not key:
            raise RuntimeError("OpenAI API key is not configured")

        data = {"model": "whisper-1"}
        if language != "auto":
            data["language"] = language
        if prompt:
            data["prompt"] = prompt

        with audio_path.open("rb") as audio_file:
            resp = requests.post(
                "https://api.openai.com/v1/audio/transcriptions",
                headers={"Authorization": f"Bearer {key}"},
                files={"file": audio_file},
                data=data,
                timeout=120
            )

        if resp.status_code != 200:
            raise RuntimeError(f"OpenAI STT error: HTTP {resp.status_code}")

        result = resp.json()
        return result.get("text", "").strip(), {"provider": "openai"}
