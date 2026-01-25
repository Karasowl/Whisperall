"""DeepInfra Whisper STT Provider - API-based transcription with multiple Whisper models"""

from pathlib import Path
from typing import Optional, Dict, Any, Tuple

from .base import STTProvider, STTProviderInfo
from ..base import ProviderType, ModelVariant
from core.api_provider import BaseAPIProvider, APIProviderConfig


class DeepInfraWhisperProvider(BaseAPIProvider, STTProvider):
    """
    DeepInfra Whisper API for transcription.

    Provides access to multiple Whisper model sizes via API.
    Uses unified BaseAPIProvider for consistent error handling.
    """

    CONFIG = APIProviderConfig(
        provider_id="deepinfra",
        provider_name="DeepInfra Whisper",
        api_key_name="deepinfra",
        base_url="https://api.deepinfra.com"
    )

    # Available Whisper models on DeepInfra
    MODELS = {
        "whisper-base": "openai/whisper-base",
        "whisper-small": "openai/whisper-small",
        "whisper-medium": "openai/whisper-medium",
        "whisper-large-v3": "openai/whisper-large-v3",
        "whisper-large-v3-turbo": "openai/whisper-large-v3-turbo",
    }

    def __init__(self):
        BaseAPIProvider.__init__(self)

    @classmethod
    def get_info(cls) -> STTProviderInfo:
        return STTProviderInfo(
            id="deepinfra",
            name="DeepInfra Whisper",
            description="Whisper models via DeepInfra API. Multiple model sizes available.",
            type=ProviderType.API,
            requires_api_key="deepinfra",
            supported_languages=["multilingual"],
            models=[
                ModelVariant(
                    id="whisper-large-v3-turbo",
                    name="Whisper Large V3 Turbo",
                    description="Balance of speed and accuracy (recommended)"
                ),
                ModelVariant(
                    id="whisper-large-v3",
                    name="Whisper Large V3",
                    description="Best accuracy, slower"
                ),
                ModelVariant(
                    id="whisper-medium",
                    name="Whisper Medium",
                    description="Good balance for shorter audio"
                ),
                ModelVariant(
                    id="whisper-small",
                    name="Whisper Small",
                    description="Fast, lower accuracy"
                ),
                ModelVariant(
                    id="whisper-base",
                    name="Whisper Base",
                    description="Fastest, basic accuracy"
                ),
            ],
            default_model="whisper-large-v3-turbo",
            supports_vad=False,
            supports_timestamps=True,
            supports_diarization=False,
            docs_url="https://deepinfra.com/docs/tutorials/whisper",
            pricing_url="https://deepinfra.com/pricing",
            console_url="https://deepinfra.com/dash/api_keys",
        )

    def transcribe(
        self,
        audio_path: Path,
        language: str = "auto",
        prompt: Optional[str] = None,
        model: Optional[str] = None,
        **kwargs
    ) -> Tuple[str, Dict[str, Any]]:
        """
        Transcribe audio using DeepInfra Whisper API.

        Args:
            audio_path: Path to audio file
            language: Language code or "auto" for detection
            prompt: Optional prompt to guide transcription
            model: Model ID (whisper-large-v3-turbo, whisper-large-v3, etc.)
            **kwargs: Additional parameters

        Returns:
            Tuple of (transcribed_text, metadata_dict)
        """
        from settings_service import settings_service

        model_key = model or settings_service.get(
            "providers.stt.deepinfra.model",
            "whisper-large-v3-turbo"
        )
        model_id = self.MODELS.get(model_key, self.MODELS["whisper-large-v3-turbo"])

        # Build endpoint URL
        endpoint = f"/v1/inference/{model_id}"

        # Build form data
        data = {}
        if language != "auto":
            data["language"] = language
        if prompt:
            data["initial_prompt"] = prompt

        # Add timestamp request if supported
        response_format = kwargs.get("response_format", "json")
        if response_format:
            data["response_format"] = response_format

        # Send request with audio file
        with audio_path.open("rb") as audio_file:
            response = self.client.post(
                endpoint,
                files={"audio": audio_file},
                data=data if data else None
            )

        result = response.json()

        # Extract text from response
        text = result.get("text", "").strip()

        # Build metadata
        metadata = {
            "provider": "deepinfra",
            "model": model_key,
        }

        # Include detected language if available
        if "language" in result:
            metadata["detected_language"] = result["language"]

        # Include duration if available
        if "duration" in result:
            metadata["duration"] = result["duration"]

        # Include segments/timestamps if available
        if "segments" in result:
            metadata["segments"] = result["segments"]

        return text, metadata
