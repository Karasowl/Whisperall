"""DeepInfra TTS Provider - Cloud TTS with Kokoro, Chatterbox, Orpheus, Zonos models"""

from typing import Optional, List
import numpy as np
import io

from ..base import (
    TTSProvider,
    TTSProviderInfo,
    VoiceCloningSupport,
    VoiceInfo,
    ModelVariant,
)
from core.api_provider import BaseAPIProvider, APIProviderConfig
from core.http_client import AuthenticationError, RateLimitError, HTTPError


class DeepInfraTTSProvider(TTSProvider):
    """
    DeepInfra TTS Provider - Access to open-source TTS models via API.

    Supports Kokoro, Chatterbox, Orpheus, and Zonos models without local GPU.
    Uses the unified BaseAPIProvider for consistent error handling.
    """

    # Model endpoint mapping
    MODELS = {
        "kokoro": "hexgrad/Kokoro-82M",
        "chatterbox": "ResembleAI/chatterbox",
        "chatterbox-multilingual": "ResembleAI/chatterbox-multilingual",
        "chatterbox-turbo": "ResembleAI/chatterbox-turbo",
        "orpheus": "canopylabs/orpheus-3b-0.1-ft",
        "orpheus-turbo": "canopylabs/orpheus-turbo",
        "zonos": "Zyphra/Zonos-v0.1",
    }

    def __init__(self, device: Optional[str] = None):
        self._loaded = False
        self._client = None
        self._api_key = None
        self._model = None
        self.device = "api"

    @classmethod
    def get_info(cls) -> TTSProviderInfo:
        return TTSProviderInfo(
            id="deepinfra-tts",
            name="DeepInfra TTS",
            description="Open-source TTS models via API: Kokoro, Chatterbox, Orpheus, Zonos. No GPU required.",
            voice_cloning=VoiceCloningSupport.ZERO_SHOT,
            supported_languages=[
                "en", "es", "fr", "de", "it", "pt", "zh", "ja", "ko", "ar",
                "da", "el", "fi", "he", "hi", "ms", "nl", "no", "pl", "ru",
                "sv", "sw", "tr",
            ],
            models=[
                ModelVariant(
                    id="kokoro",
                    name="Kokoro 82M",
                    size_gb=0,
                    vram_gb=0,
                    description="Ultra-efficient 82M params, fast, Apache 2.0"
                ),
                ModelVariant(
                    id="chatterbox-multilingual",
                    name="Chatterbox Multilingual",
                    size_gb=0,
                    vram_gb=0,
                    description="23 languages, emotion control, MIT license"
                ),
                ModelVariant(
                    id="chatterbox-turbo",
                    name="Chatterbox Turbo",
                    size_gb=0,
                    vram_gb=0,
                    description="350M params, low latency, paralinguistic tags"
                ),
                ModelVariant(
                    id="orpheus",
                    name="Orpheus 3B",
                    size_gb=0,
                    vram_gb=0,
                    description="Llama-based, expressive, streaming"
                ),
                ModelVariant(
                    id="zonos",
                    name="Zonos v0.1",
                    size_gb=0,
                    vram_gb=0,
                    description="44kHz, emotion control, voice cloning"
                ),
            ],
            default_model="kokoro",
            sample_rate=24000,
            requires_reference_text=False,
            vram_requirement_gb=0,
            supports_streaming=False,
            supports_emotion_tags=True,
            preset_voices=[
                # Kokoro voices
                VoiceInfo(id="af_heart", name="Heart (Female)", language="en", gender="female"),
                VoiceInfo(id="af_bella", name="Bella (Female)", language="en", gender="female"),
                VoiceInfo(id="af_nicole", name="Nicole (Female)", language="en", gender="female"),
                VoiceInfo(id="af_sarah", name="Sarah (Female)", language="en", gender="female"),
                VoiceInfo(id="af_sky", name="Sky (Female)", language="en", gender="female"),
                VoiceInfo(id="am_adam", name="Adam (Male)", language="en", gender="male"),
                VoiceInfo(id="am_michael", name="Michael (Male)", language="en", gender="male"),
                VoiceInfo(id="bf_emma", name="Emma (British Female)", language="en", gender="female"),
                VoiceInfo(id="bm_george", name="George (British Male)", language="en", gender="male"),
            ],
            extra_params={
                "speed": {
                    "type": "float",
                    "default": 1.0,
                    "min": 0.5,
                    "max": 2.0,
                    "description": "Playback speed"
                },
            },
        )

    def _get_api_key(self) -> str:
        """Get DeepInfra API key from settings."""
        from settings_service import settings_service

        key = settings_service.get_api_key("deepinfra")
        if not key:
            raise AuthenticationError(
                "DeepInfra",
                "DeepInfra API key not configured. Set 'deepinfra' in Settings > API Keys."
            )
        return key

    def load(self, model: Optional[str] = None) -> None:
        """Initialize the DeepInfra client."""
        self._api_key = self._get_api_key()
        self._model = model or "kokoro"
        self._loaded = True

    def unload(self) -> None:
        """Clear client state."""
        self._api_key = None
        self._model = None
        self._loaded = False

    def generate(
        self,
        text: str,
        voice_id: Optional[str] = None,
        voice_audio_path: Optional[str] = None,
        voice_audio_text: Optional[str] = None,
        language: str = "en",
        speed: float = 1.0,
        **kwargs
    ) -> tuple[np.ndarray, int]:
        """
        Generate audio using DeepInfra TTS API.

        Args:
            text: Text to synthesize
            voice_id: Voice ID for preset voice
            voice_audio_path: Path to reference audio for voice cloning
            language: Language code
            speed: Playback speed
            **kwargs: Additional params (model)

        Returns:
            Tuple of (audio_array, sample_rate)
        """
        import httpx

        if not self._loaded:
            self.load(kwargs.get("model"))

        model_key = kwargs.get("model", self._model or "kokoro")
        model_id = self.MODELS.get(model_key, self.MODELS["kokoro"])

        # Build request URL
        base_url = f"https://api.deepinfra.com/v1/inference/{model_id}"

        # Build payload based on model type
        payload = {
            "text": text,
        }

        # Add voice if specified
        if voice_id:
            payload["voice"] = voice_id

        # Handle voice cloning with reference audio
        if voice_audio_path:
            payload = self._build_clone_payload(text, voice_audio_path, voice_audio_text)

        # Add speed if supported
        if speed != 1.0:
            payload["speed"] = speed

        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }

        try:
            with httpx.Client(timeout=120.0) as client:
                response = client.post(base_url, json=payload, headers=headers)

                if response.status_code == 401:
                    raise AuthenticationError("DeepInfra", "Invalid API key")
                elif response.status_code == 429:
                    raise RateLimitError("DeepInfra", "Rate limit exceeded. Please wait.")
                elif response.status_code >= 500:
                    raise HTTPError("DeepInfra", response.status_code, "Server error")
                elif response.status_code != 200:
                    error_msg = self._extract_error(response)
                    raise HTTPError("DeepInfra", response.status_code, error_msg)

                # Parse response - DeepInfra returns audio in different formats
                content_type = response.headers.get("content-type", "")

                if "audio" in content_type:
                    # Direct audio response
                    audio_bytes = response.content
                else:
                    # JSON response with audio data
                    data = response.json()
                    if "audio" in data:
                        import base64
                        audio_bytes = base64.b64decode(data["audio"])
                    elif "output" in data:
                        import base64
                        audio_bytes = base64.b64decode(data["output"])
                    else:
                        raise RuntimeError(f"Unexpected response format: {list(data.keys())}")

                audio_array, sample_rate = self._decode_audio(audio_bytes)
                return audio_array, sample_rate

        except httpx.TimeoutException:
            raise RuntimeError("DeepInfra TTS request timed out")
        except (AuthenticationError, RateLimitError, HTTPError):
            raise
        except Exception as e:
            raise RuntimeError(f"DeepInfra TTS generation failed: {e}")

    def _build_clone_payload(
        self,
        text: str,
        audio_path: str,
        audio_text: Optional[str] = None
    ) -> dict:
        """Build payload for voice cloning request."""
        import base64

        with open(audio_path, "rb") as f:
            audio_data = base64.b64encode(f.read()).decode("utf-8")

        payload = {
            "text": text,
            "reference_audio": audio_data,
        }

        if audio_text:
            payload["reference_text"] = audio_text

        return payload

    def _extract_error(self, response) -> str:
        """Extract error message from response."""
        try:
            data = response.json()
            if "error" in data:
                if isinstance(data["error"], dict):
                    return data["error"].get("message", str(data["error"]))
                return str(data["error"])
            if "detail" in data:
                return str(data["detail"])
            return response.text[:200]
        except Exception:
            return response.text[:200] if response.text else f"HTTP {response.status_code}"

    def _decode_audio(self, audio_bytes: bytes) -> tuple[np.ndarray, int]:
        """Decode audio bytes to numpy array."""
        import soundfile as sf

        with io.BytesIO(audio_bytes) as audio_io:
            audio_array, sample_rate = sf.read(audio_io)

            # Convert to float32 if needed
            if audio_array.dtype != np.float32:
                audio_array = audio_array.astype(np.float32)

            # Convert stereo to mono if needed
            if len(audio_array.shape) > 1:
                audio_array = audio_array.mean(axis=1)

            return audio_array, sample_rate
