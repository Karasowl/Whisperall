"""Nari Labs TTS Provider - Dia cloud API for dialogue generation"""

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


class NariLabsProvider(TTSProvider):
    """Nari Labs (Dia API) - Cloud version of Dia TTS for dialogue and emotion"""

    API_BASE = "https://api.nari.ai/v1"

    def __init__(self, device: Optional[str] = None):
        self._loaded = False
        self._api_key = None
        self.device = "api"

    @classmethod
    def get_info(cls) -> TTSProviderInfo:
        return TTSProviderInfo(
            id="narilabs",
            name="Nari Labs (Dia)",
            description="Cloud API for Dia TTS. Excellent for dialogue, multiple speakers, and emotions.",
            voice_cloning=VoiceCloningSupport.ZERO_SHOT,
            supported_languages=[
                "en",  # Dia primarily supports English
            ],
            models=[
                ModelVariant(
                    id="dia-1.6b",
                    name="Dia 1.6B",
                    size_gb=0,
                    vram_gb=0,
                    description="Full Dia model"
                ),
                ModelVariant(
                    id="dia-turbo",
                    name="Dia Turbo",
                    size_gb=0,
                    vram_gb=0,
                    description="Faster inference"
                ),
            ],
            default_model="dia-1.6b",
            sample_rate=44100,
            requires_reference_text=False,
            vram_requirement_gb=0,
            supports_streaming=True,
            supports_emotion_tags=True,
            preset_voices=[
                VoiceInfo(id="S1", name="Speaker 1", description="Default speaker 1"),
                VoiceInfo(id="S2", name="Speaker 2", description="Default speaker 2"),
                VoiceInfo(id="narrator", name="Narrator", description="Neutral narrator voice"),
            ],
            extra_params={
                "speed": {
                    "type": "float",
                    "default": 1.0,
                    "min": 0.5,
                    "max": 2.0,
                    "description": "Speech speed"
                },
                "cfg_scale": {
                    "type": "float",
                    "default": 3.0,
                    "min": 1.0,
                    "max": 5.0,
                    "description": "Classifier-free guidance scale"
                },
                "temperature": {
                    "type": "float",
                    "default": 1.0,
                    "min": 0.1,
                    "max": 2.0,
                    "description": "Sampling temperature"
                },
            },
        )

    def load(self, model: Optional[str] = None) -> None:
        """Initialize the Nari Labs client"""
        from settings_service import settings_service

        self._api_key = settings_service.get_api_key("narilabs")
        if not self._api_key:
            raise ValueError("Nari Labs API key not configured. Set it in Settings.")

        self._model = model or "dia-1.6b"
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
        Generate audio using Nari Labs Dia API.

        Dia supports dialogue format with speaker tags:
        [S1] Hello, how are you?
        [S2] I'm doing great, thanks!

        Args:
            text: Text to synthesize (can include [S1], [S2] tags)
            voice_id: Speaker ID (S1, S2, narrator)
            voice_audio_path: Path to reference audio for voice cloning
            language: Language code
            speed: Speech speed
            **kwargs: Additional params (cfg_scale, temperature, model)

        Returns:
            Tuple of (audio_array, sample_rate)
        """
        if not self._loaded:
            self.load(kwargs.get("model"))

        model = kwargs.get("model", self._model)
        cfg_scale = kwargs.get("cfg_scale", 3.0)
        temperature = kwargs.get("temperature", 1.0)

        # If voice_id specified and text doesn't have speaker tags, add them
        if voice_id and not any(tag in text for tag in ["[S1]", "[S2]", "[narrator]"]):
            text = f"[{voice_id}] {text}"

        try:
            # Build request payload
            payload = {
                "model": model,
                "text": text,
                "cfg_scale": cfg_scale,
                "temperature": temperature,
                "speed": speed,
                "output_format": "wav",
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
                            "cfg_scale": str(cfg_scale),
                            "temperature": str(temperature),
                            "speed": str(speed),
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

                    # Check response type
                    content_type = response.headers.get("content-type", "")
                    if "application/json" in content_type:
                        data = response.json()
                        audio_url = data.get("audio_url")
                        if audio_url:
                            audio_response = client.get(audio_url, timeout=60.0)
                            audio_bytes = audio_response.content
                        else:
                            import base64
                            audio_bytes = base64.b64decode(data.get("audio", ""))
                    else:
                        audio_bytes = response.content

            # Decode audio
            audio_array, sample_rate = self._decode_audio(audio_bytes)

            return audio_array, sample_rate

        except Exception as e:
            raise RuntimeError(f"Nari Labs TTS generation failed: {e}")

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
