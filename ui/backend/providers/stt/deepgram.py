"""Deepgram STT Provider - Advanced API-based transcription"""

from pathlib import Path
from typing import Optional, Dict, Any, Tuple

import requests

from .base import STTProvider, STTProviderInfo
from ..base import ProviderType, ModelVariant


class DeepgramProvider(STTProvider):
    """Deepgram's advanced speech recognition API"""

    @classmethod
    def get_info(cls) -> STTProviderInfo:
        return STTProviderInfo(
            id="deepgram",
            name="Deepgram",
            description="Enterprise-grade speech recognition with real-time and async options.",
            type=ProviderType.API,
            requires_api_key="deepgram",
            supported_languages=["multilingual"],
            models=[
                ModelVariant(id="nova-2", name="Nova 2", description="Best accuracy, recommended"),
                ModelVariant(id="nova", name="Nova", description="Fast and accurate"),
                ModelVariant(id="enhanced", name="Enhanced", description="High accuracy"),
                ModelVariant(id="base", name="Base", description="Fast transcription"),
            ],
            default_model="nova-2",
            supports_vad=True,
            supports_timestamps=True,
            supports_diarization=True,
            docs_url="https://developers.deepgram.com/docs",
            pricing_url="https://deepgram.com/pricing",
            console_url="https://console.deepgram.com/",
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

        key = settings_service.get_api_key("deepgram")
        if not key:
            raise RuntimeError("Deepgram API key is not configured")

        model_name = model or settings_service.get("providers.stt.deepgram.model", "nova-2")

        params = {
            "model": model_name,
            "smart_format": "true",
            "punctuate": "true"
        }
        if language != "auto":
            params["language"] = language

        with audio_path.open("rb") as audio_file:
            resp = requests.post(
                "https://api.deepgram.com/v1/listen",
                headers={"Authorization": f"Token {key}"},
                params=params,
                data=audio_file,
                timeout=120
            )

        if resp.status_code != 200:
            raise RuntimeError(f"Deepgram STT error: HTTP {resp.status_code}")

        result = resp.json()
        alternatives = result.get("results", {}).get("channels", [{}])[0].get("alternatives", [])
        transcript = alternatives[0].get("transcript", "") if alternatives else ""

        return transcript.strip(), {
            "provider": "deepgram",
            "model": model_name
        }
