"""Deepgram STT Provider - Advanced API-based transcription"""

from pathlib import Path
from typing import Optional, Dict, Any, Tuple

from .base import STTProvider, STTProviderInfo
from ..base import ProviderType, ModelVariant
from core.api_provider import BaseAPIProvider, APIProviderConfig


class DeepgramProvider(BaseAPIProvider, STTProvider):
    """Deepgram's advanced speech recognition API"""

    CONFIG = APIProviderConfig(
        provider_id="deepgram",
        provider_name="Deepgram",
        api_key_name="deepgram",
        base_url="https://api.deepgram.com"
    )

    def __init__(self):
        BaseAPIProvider.__init__(self)

    def _get_auth_header(self, api_key: str) -> Dict[str, str]:
        """Deepgram uses Token auth instead of Bearer."""
        return {"Authorization": f"Token {api_key}"}

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

        model_name = model or settings_service.get("providers.stt.deepgram.model", "nova-2")

        params = {
            "model": model_name,
            "smart_format": "true",
            "punctuate": "true"
        }
        if language != "auto":
            params["language"] = language

        # Deepgram uses raw binary upload, not multipart
        with audio_path.open("rb") as audio_file:
            response = self.client.post(
                "/v1/listen",
                data=audio_file.read(),
                params=params,
                headers={"Content-Type": "audio/wav"}
            )

        result = response.json()
        alternatives = result.get("results", {}).get("channels", [{}])[0].get("alternatives", [])
        transcript = alternatives[0].get("transcript", "") if alternatives else ""

        return transcript.strip(), {
            "provider": "deepgram",
            "model": model_name
        }
