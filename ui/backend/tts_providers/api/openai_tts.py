"""OpenAI TTS Provider - Cloud-based text-to-speech using OpenAI's API"""

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


class OpenAITTSProvider(TTSProvider):
    """OpenAI TTS Provider - High-quality cloud TTS with preset voices"""

    def __init__(self, device: Optional[str] = None):
        # API provider doesn't need device, but keep interface consistent
        self._loaded = False
        self._client = None
        self.device = "api"

    @classmethod
    def get_info(cls) -> TTSProviderInfo:
        return TTSProviderInfo(
            id="openai-tts",
            name="OpenAI TTS",
            description="High-quality cloud TTS with 6 distinct voices. Fast and reliable.",
            voice_cloning=VoiceCloningSupport.NONE,
            supported_languages=[
                "en", "es", "fr", "de", "it", "pt", "pl", "zh", "ja", "ko",
                "ar", "hi", "ru", "nl", "sv", "da", "fi", "no", "tr", "cs",
                "el", "he", "id", "ms", "th", "vi", "uk", "ro", "hu", "bg",
            ],
            models=[
                ModelVariant(
                    id="tts-1",
                    name="TTS-1",
                    size_gb=0,
                    vram_gb=0,
                    description="Fast, optimized for real-time use"
                ),
                ModelVariant(
                    id="tts-1-hd",
                    name="TTS-1 HD",
                    size_gb=0,
                    vram_gb=0,
                    description="Higher quality, slightly slower"
                ),
            ],
            default_model="tts-1",
            sample_rate=24000,
            requires_reference_text=False,
            vram_requirement_gb=0,  # API - no local VRAM
            supports_streaming=True,
            supports_emotion_tags=False,
            preset_voices=[
                VoiceInfo(id="alloy", name="Alloy", description="Neutral, balanced voice", gender="neutral"),
                VoiceInfo(id="echo", name="Echo", description="Warm male voice", gender="male"),
                VoiceInfo(id="fable", name="Fable", description="British-accented storyteller", gender="male"),
                VoiceInfo(id="onyx", name="Onyx", description="Deep, authoritative male", gender="male"),
                VoiceInfo(id="nova", name="Nova", description="Friendly female voice", gender="female"),
                VoiceInfo(id="shimmer", name="Shimmer", description="Soft, expressive female", gender="female"),
            ],
            extra_params={
                "speed": {
                    "type": "float",
                    "default": 1.0,
                    "min": 0.25,
                    "max": 4.0,
                    "description": "Playback speed (0.25x to 4x)"
                },
            },
        )

    def load(self, model: Optional[str] = None) -> None:
        """Initialize the OpenAI client"""
        try:
            from openai import OpenAI
            from settings_service import settings_service

            api_key = settings_service.get_api_key("openai")
            if not api_key:
                raise ValueError("OpenAI API key not configured. Set it in Settings.")

            self._client = OpenAI(api_key=api_key)
            self._model = model or "tts-1"
            self._loaded = True
        except ImportError:
            raise ImportError("openai package not installed. Run: pip install openai")

    def unload(self) -> None:
        """Clear the client"""
        self._client = None
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
        Generate audio using OpenAI TTS API.

        Args:
            text: Text to synthesize
            voice_id: Voice ID (alloy, echo, fable, onyx, nova, shimmer)
            language: Language code (informational, OpenAI auto-detects)
            speed: Playback speed (0.25 to 4.0)
            **kwargs: Additional params (model)

        Returns:
            Tuple of (audio_array, sample_rate)
        """
        if not self._loaded:
            self.load(kwargs.get("model"))

        voice = voice_id or "alloy"
        model = kwargs.get("model", self._model or "tts-1")

        # Clamp speed to valid range
        speed = max(0.25, min(4.0, speed))

        try:
            response = self._client.audio.speech.create(
                model=model,
                voice=voice,
                input=text,
                speed=speed,
                response_format="wav",
            )

            # Convert response bytes to numpy array
            audio_bytes = response.content
            audio_array, sample_rate = self._decode_wav(audio_bytes)

            return audio_array, sample_rate

        except Exception as e:
            raise RuntimeError(f"OpenAI TTS generation failed: {e}")

    def _decode_wav(self, wav_bytes: bytes) -> tuple[np.ndarray, int]:
        """Decode WAV bytes to numpy array"""
        import wave
        import struct

        with io.BytesIO(wav_bytes) as wav_io:
            with wave.open(wav_io, 'rb') as wav_file:
                n_channels = wav_file.getnchannels()
                sample_width = wav_file.getsampwidth()
                sample_rate = wav_file.getframerate()
                n_frames = wav_file.getnframes()

                raw_data = wav_file.readframes(n_frames)

                # Convert to numpy based on sample width
                if sample_width == 2:
                    dtype = np.int16
                elif sample_width == 4:
                    dtype = np.int32
                else:
                    dtype = np.uint8

                audio_array = np.frombuffer(raw_data, dtype=dtype)

                # Convert to float32 normalized
                if dtype == np.int16:
                    audio_array = audio_array.astype(np.float32) / 32768.0
                elif dtype == np.int32:
                    audio_array = audio_array.astype(np.float32) / 2147483648.0
                else:
                    audio_array = audio_array.astype(np.float32) / 128.0 - 1.0

                # If stereo, convert to mono
                if n_channels == 2:
                    audio_array = audio_array.reshape(-1, 2).mean(axis=1)

                return audio_array, sample_rate
