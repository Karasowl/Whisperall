"""Groq Whisper STT Provider - Fast API-based transcription"""

from pathlib import Path
from typing import Optional, Dict, Any, Tuple

import requests

from .base import STTProvider, STTProviderInfo
from ..base import ProviderType, ModelVariant


class GroqWhisperProvider(STTProvider):
    """Groq's fast Whisper API for transcription"""

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
            supports_timestamps=False,
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

        key = settings_service.get_api_key("groq")
        if not key:
            raise RuntimeError("Groq API key is not configured")

        model_name = model or settings_service.get("providers.stt.groq.model", "whisper-large-v3")

        data = {"model": model_name}
        if language != "auto":
            data["language"] = language
        if prompt:
            data["prompt"] = prompt

        with audio_path.open("rb") as audio_file:
            resp = requests.post(
                "https://api.groq.com/openai/v1/audio/transcriptions",
                headers={"Authorization": f"Bearer {key}"},
                files={"file": audio_file},
                data=data,
                timeout=120
            )

        if resp.status_code != 200:
            raise RuntimeError(f"Groq STT error: HTTP {resp.status_code}")

        result = resp.json()
        return result.get("text", "").strip(), {
            "provider": "groq",
            "model": model_name
        }
