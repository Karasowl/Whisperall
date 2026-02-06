"""OpenAI Whisper STT Provider - API-based transcription"""

from pathlib import Path
from typing import Optional, Dict, Any, Tuple

from .base import STTProvider, STTProviderInfo
from ..base import ProviderType, ModelVariant
from core.api_provider import BaseAPIProvider, APIProviderConfig


class OpenAIWhisperProvider(BaseAPIProvider, STTProvider):
    """OpenAI Speech-to-Text API for transcription"""

    CONFIG = APIProviderConfig(
        provider_id="openai",
        provider_name="OpenAI Speech-to-Text",
        api_key_name="openai",
        base_url="https://api.openai.com"
    )

    def __init__(self):
        BaseAPIProvider.__init__(self)

    @classmethod
    def get_info(cls) -> STTProviderInfo:
        return STTProviderInfo(
            id="openai",
            name="OpenAI Speech-to-Text",
            description="Cloud transcription with high accuracy and low latency (recommended: gpt-4o-mini-transcribe).",
            type=ProviderType.API,
            requires_api_key="openai",
            supported_languages=["multilingual"],
            models=[
                ModelVariant(id="gpt-4o-mini-transcribe", name="GPT-4o mini Transcribe", description="Fast + low cost (recommended)"),
                ModelVariant(id="gpt-4o-transcribe", name="GPT-4o Transcribe", description="Higher quality, higher cost"),
                ModelVariant(id="whisper-1", name="Whisper-1", description="Legacy hosted Whisper model (compatibility fallback)"),
            ],
            default_model="gpt-4o-mini-transcribe",
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
        model: Optional[str] = None,
        **kwargs
    ) -> Tuple[str, Dict[str, Any]]:
        from settings_service import settings_service

        model_name = model or settings_service.get("providers.stt.openai.model", "gpt-4o-mini-transcribe")

        data = {"model": model_name}
        if language != "auto":
            data["language"] = language
        if prompt:
            data["prompt"] = prompt

        with audio_path.open("rb") as audio_file:
            response = self.client.post(
                "/v1/audio/transcriptions",
                files={"file": audio_file},
                data=data
            )

        result = response.json()
        return result.get("text", "").strip(), {"provider": "openai", "model": model_name}
