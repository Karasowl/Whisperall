"""Groq Whisper STT Provider - Fast API-based transcription"""

from pathlib import Path
from typing import Optional, Dict, Any, Tuple

from .base import STTProvider, STTProviderInfo
from ..base import ProviderType, ModelVariant
from core.api_provider import BaseAPIProvider, APIProviderConfig


class GroqWhisperProvider(BaseAPIProvider, STTProvider):
    """Groq's fast Whisper API for transcription"""

    CONFIG = APIProviderConfig(
        provider_id="groq",
        provider_name="Groq Whisper",
        api_key_name="groq",
        base_url="https://api.groq.com"
    )

    def __init__(self):
        BaseAPIProvider.__init__(self)

    @classmethod
    def get_info(cls) -> STTProviderInfo:
        return STTProviderInfo(
            id="groq",
            name="Groq Whisper",
            description="Ultra-fast cloud transcription with Groq's LPU acceleration.",
            type=ProviderType.API,
            requires_api_key="groq",
            supported_languages=["multilingual"],
            models=[
                ModelVariant(id="whisper-large-v3", name="Whisper Large V3", description="Best accuracy"),
                ModelVariant(id="whisper-large-v3-turbo", name="Whisper Large V3 Turbo", description="Lower latency, cheaper"),
            ],
            default_model="whisper-large-v3",
            supports_vad=False,
            supports_timestamps=True,
            supports_diarization=False,
            docs_url="https://console.groq.com/docs/speech-text",
            pricing_url="https://groq.com/pricing/",
            console_url="https://console.groq.com/keys",
        )

    def transcribe(
        self,
        audio_path: Path,
        language: str = "auto",
        prompt: Optional[str] = None,
        model: Optional[str] = None,
        **kwargs
    ) -> Tuple[str, Dict[str, Any]]:
        from settings_service import settings_service

        model_name = model or settings_service.get("providers.stt.groq.model", "whisper-large-v3")

        data = {"model": model_name}
        if language != "auto":
            data["language"] = language
        if prompt:
            data["prompt"] = prompt

        with audio_path.open("rb") as audio_file:
            response = self.client.post(
                "/openai/v1/audio/transcriptions",
                files={"file": audio_file},
                data=data
            )

        result = response.json()
        return result.get("text", "").strip(), {
            "provider": "groq",
            "model": model_name
        }
