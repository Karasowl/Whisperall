"""ElevenLabs Scribe STT Provider - High-quality API-based transcription"""

from pathlib import Path
from typing import Optional, Dict, Any, Tuple

from .base import STTProvider, STTProviderInfo
from ..base import ProviderType, ModelVariant
from core.api_provider import BaseAPIProvider, APIProviderConfig


class ElevenLabsSTTProvider(BaseAPIProvider, STTProvider):
    """ElevenLabs Scribe API for transcription (10h free in Starter plan)"""

    CONFIG = APIProviderConfig(
        provider_id="elevenlabs",
        provider_name="ElevenLabs Scribe",
        api_key_name="elevenlabs",
        base_url="https://api.elevenlabs.io",
        timeout=180  # Longer timeout for larger files
    )

    def __init__(self):
        BaseAPIProvider.__init__(self)

    def _get_auth_header(self, api_key: str) -> Dict[str, str]:
        """ElevenLabs uses xi-api-key header."""
        return {"xi-api-key": api_key}

    @classmethod
    def get_info(cls) -> STTProviderInfo:
        return STTProviderInfo(
            id="elevenlabs",
            name="ElevenLabs Scribe",
            description="High-accuracy STT with Scribe v2. 10h/month free in Starter plan.",
            type=ProviderType.API,
            requires_api_key="elevenlabs",
            supported_languages=[
                "en", "es", "fr", "de", "it", "pt", "pl", "zh", "ja", "ko",
                "ar", "hi", "ru", "nl", "sv", "da", "fi", "no", "tr", "cs",
                "el", "he", "id", "ms", "th", "vi", "uk", "ro", "hu", "bg",
                # Scribe supports 90+ languages
            ],
            models=[
                ModelVariant(
                    id="scribe_v2",
                    name="Scribe V2",
                    description="Latest model, best accuracy, 90+ languages"
                ),
                ModelVariant(
                    id="scribe_v1",
                    name="Scribe V1",
                    description="Original model, stable"
                ),
            ],
            default_model="scribe_v2",
            supports_vad=True,
            supports_timestamps=True,
            supports_diarization=True,
            docs_url="https://elevenlabs.io/docs/api-reference/speech-to-text",
            pricing_url="https://elevenlabs.io/pricing",
            console_url="https://elevenlabs.io/app/settings/api-keys",
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

        model_name = model or settings_service.get("providers.stt.elevenlabs.model", "scribe_v2")

        # Prepare multipart form data
        data = {"model_id": model_name}

        # Add language if specified (ISO-639-1 code)
        if language != "auto":
            data["language_code"] = language

        # Optional: enable diarization if requested
        if kwargs.get("diarize"):
            data["diarize"] = "true"
            if kwargs.get("num_speakers"):
                data["num_speakers"] = str(kwargs["num_speakers"])

        # Optional: timestamp granularity
        if kwargs.get("timestamps"):
            data["timestamps_granularity"] = kwargs.get("timestamps_granularity", "word")

        with audio_path.open("rb") as audio_file:
            response = self.client.post(
                "/v1/speech-to-text",
                files={"file": audio_file},
                data=data
            )

        result = response.json()
        text = result.get("text", "").strip()
        detected_language = result.get("language_code", language)

        meta = {
            "provider": "elevenlabs",
            "model": model_name,
            "language": detected_language,
            "language_probability": result.get("language_probability"),
        }

        # Include word-level timestamps if available
        if result.get("words"):
            meta["words"] = result["words"]

        return text, meta
