"""Zyphra TTS Provider - Zonos cloud API for high-quality multilingual TTS"""

from typing import Optional, List
import numpy as np
import io
import httpx

from ..base import (
    TTSProvider,
    TTSProviderInfo,
    VoiceCloningSupport,
    VoiceInfo,
    ModelVariant,
)


class ZyphraProvider(TTSProvider):
    """Zyphra (Zonos API) - Cloud version of Zonos TTS with emotion control"""

    API_BASE = "https://api.zyphra.com/v1"

    def __init__(self, device: Optional[str] = None):
        self._loaded = False
        self._api_key = None
        self.device = "api"

    @classmethod
    def get_info(cls) -> TTSProviderInfo:
        return TTSProviderInfo(
            id="zyphra",
            name="Zyphra (Zonos)",
            description="Cloud API for Zonos TTS. High-quality multilingual synthesis with emotion control.",
            voice_cloning=VoiceCloningSupport.ZERO_SHOT,
            supported_languages=[
                "en", "es", "fr", "de", "it", "pt", "zh", "ja", "ko",
            ],
            models=[
                ModelVariant(
                    id="zonos-v1",
                    name="Zonos v1",
                    size_gb=0,
                    vram_gb=0,
                    description="Standard Zonos model"
                ),
                ModelVariant(
                    id="zonos-v1-turbo",
                    name="Zonos v1 Turbo",
                    size_gb=0,
                    vram_gb=0,
                    description="Faster inference, slightly lower quality"
                ),
            ],
            default_model="zonos-v1",
            sample_rate=44100,
            requires_reference_text=False,
            vram_requirement_gb=0,
            supports_streaming=True,
            supports_emotion_tags=True,
            preset_voices=[
                VoiceInfo(id="aria", name="Aria", description="Warm female voice", gender="female"),
                VoiceInfo(id="david", name="David", description="Professional male voice", gender="male"),
                VoiceInfo(id="emma", name="Emma", description="Friendly female voice", gender="female"),
                VoiceInfo(id="james", name="James", description="Deep male voice", gender="male"),
            ],
            extra_params={
                "speaking_rate": {
                    "type": "float",
                    "default": 1.0,
                    "min": 0.5,
                    "max": 2.0,
                    "description": "Speaking rate"
                },
                "emotion": {
                    "type": "select",
                    "default": "neutral",
                    "options": ["neutral", "happy", "sad", "angry", "fearful", "surprised", "disgusted"],
                    "description": "Emotional tone"
                },
                "emotion_intensity": {
                    "type": "float",
                    "default": 0.5,
                    "min": 0.0,
                    "max": 1.0,
                    "description": "Emotion intensity"
                },
            },
        )

    def load(self, model: Optional[str] = None) -> None:
        """Initialize the Zyphra client"""
        from settings_service import settings_service

        self._api_key = settings_service.get_api_key("zyphra")
        if not self._api_key:
            raise ValueError("Zyphra API key not configured. Set it in Settings.")

        self._model = model or "zonos-v1"
        self._loaded = True

    def unload(self) -> None:
        """Clear the client"""
        self._api_key = None
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
        Generate audio using Zyphra TTS API.

        Args:
            text: Text to synthesize
            voice_id: Zyphra voice ID
            voice_audio_path: Path to reference audio for voice cloning
            language: Language code
            speed: Speaking rate
            **kwargs: Additional params (emotion, emotion_intensity, model)

        Returns:
            Tuple of (audio_array, sample_rate)
        """
        if not self._loaded:
            self.load(kwargs.get("model"))

        model = kwargs.get("model", self._model)
        emotion = kwargs.get("emotion", "neutral")
        emotion_intensity = kwargs.get("emotion_intensity", 0.5)
        speaking_rate = kwargs.get("speaking_rate", speed)

        # Default voice
        if not voice_id:
            voice_id = "aria"

        try:
            # Build request payload
            payload = {
                "model": model,
                "text": text,
                "voice": voice_id,
                "language": language,
                "speaking_rate": speaking_rate,
                "output_format": "wav",
            }

            # Add emotion control
            if emotion != "neutral":
                payload["emotion"] = {
                    "type": emotion,
                    "intensity": emotion_intensity,
                }

            # Handle voice cloning
            if voice_audio_path:
                with open(voice_audio_path, "rb") as f:
                    audio_data = f.read()

                # Use multipart form for voice cloning
                with httpx.Client() as client:
                    response = client.post(
                        f"{self.API_BASE}/tts/clone",
                        headers={
                            "Authorization": f"Bearer {self._api_key}",
                        },
                        data={
                            "text": text,
                            "model": model,
                            "language": language,
                            "speaking_rate": str(speaking_rate),
                        },
                        files={
                            "reference_audio": ("reference.wav", audio_data, "audio/wav"),
                        },
                        timeout=120.0,
                    )
                    response.raise_for_status()
                    audio_bytes = response.content
            else:
                with httpx.Client() as client:
                    response = client.post(
                        f"{self.API_BASE}/tts/generate",
                        headers={
                            "Authorization": f"Bearer {self._api_key}",
                            "Content-Type": "application/json",
                        },
                        json=payload,
                        timeout=120.0,
                    )
                    response.raise_for_status()

                    # Check if response is JSON with audio URL or direct audio
                    content_type = response.headers.get("content-type", "")
                    if "application/json" in content_type:
                        data = response.json()
                        audio_url = data.get("audio_url")
                        if audio_url:
                            audio_response = client.get(audio_url, timeout=60.0)
                            audio_bytes = audio_response.content
                        else:
                            # Base64 encoded audio
                            import base64
                            audio_bytes = base64.b64decode(data.get("audio", ""))
                    else:
                        audio_bytes = response.content

            # Decode audio
            audio_array, sample_rate = self._decode_audio(audio_bytes)

            return audio_array, sample_rate

        except Exception as e:
            raise RuntimeError(f"Zyphra TTS generation failed: {e}")

    def _decode_audio(self, audio_bytes: bytes) -> tuple[np.ndarray, int]:
        """Decode WAV bytes to numpy array"""
        import wave

        with io.BytesIO(audio_bytes) as wav_io:
            with wave.open(wav_io, 'rb') as wav_file:
                n_channels = wav_file.getnchannels()
                sample_width = wav_file.getsampwidth()
                sample_rate = wav_file.getframerate()
                n_frames = wav_file.getnframes()
                raw_data = wav_file.readframes(n_frames)

                if sample_width == 2:
                    audio_array = np.frombuffer(raw_data, dtype=np.int16).astype(np.float32) / 32768.0
                elif sample_width == 4:
                    audio_array = np.frombuffer(raw_data, dtype=np.int32).astype(np.float32) / 2147483648.0
                else:
                    audio_array = np.frombuffer(raw_data, dtype=np.uint8).astype(np.float32) / 128.0 - 1.0

                if n_channels == 2:
                    audio_array = audio_array.reshape(-1, 2).mean(axis=1)

                return audio_array, sample_rate
