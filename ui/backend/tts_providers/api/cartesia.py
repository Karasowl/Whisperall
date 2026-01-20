"""Cartesia TTS Provider - Ultra-low latency streaming TTS"""

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


class CartesiaProvider(TTSProvider):
    """Cartesia Sonic TTS - Ultra-low latency with voice cloning"""

    API_BASE = "https://api.cartesia.ai"

    def __init__(self, device: Optional[str] = None):
        self._loaded = False
        self._api_key = None
        self._voices_cache = None
        self.device = "api"

    @classmethod
    def get_info(cls) -> TTSProviderInfo:
        return TTSProviderInfo(
            id="cartesia",
            name="Cartesia",
            description="Ultra-low latency streaming TTS with instant voice cloning.",
            voice_cloning=VoiceCloningSupport.ZERO_SHOT,
            supported_languages=[
                "en", "es", "fr", "de", "it", "pt", "zh", "ja", "ko", "pl",
                "ru", "nl", "sv", "tr", "hi",
            ],
            models=[
                ModelVariant(
                    id="sonic-english",
                    name="Sonic English",
                    size_gb=0,
                    vram_gb=0,
                    description="Optimized for English, lowest latency"
                ),
                ModelVariant(
                    id="sonic-multilingual",
                    name="Sonic Multilingual",
                    size_gb=0,
                    vram_gb=0,
                    description="Supports 15+ languages"
                ),
            ],
            default_model="sonic-multilingual",
            sample_rate=44100,
            requires_reference_text=False,
            vram_requirement_gb=0,
            supports_streaming=True,
            supports_emotion_tags=True,
            preset_voices=[],  # Fetched from API
            extra_params={
                "speed": {
                    "type": "float",
                    "default": 1.0,
                    "min": 0.5,
                    "max": 2.0,
                    "description": "Speech speed multiplier"
                },
                "emotion": {
                    "type": "select",
                    "default": "neutral",
                    "options": ["neutral", "happy", "sad", "angry", "fearful", "surprised"],
                    "description": "Emotional tone"
                },
            },
        )

    def load(self, model: Optional[str] = None) -> None:
        """Initialize the Cartesia client"""
        from settings_service import settings_service

        self._api_key = settings_service.get_api_key("cartesia")
        if not self._api_key:
            raise ValueError("Cartesia API key not configured. Set it in Settings.")

        self._model = model or "sonic-multilingual"
        self._loaded = True

    def unload(self) -> None:
        """Clear the client"""
        self._api_key = None
        self._voices_cache = None
        self._loaded = False

    def get_preset_voices(self, language: Optional[str] = None) -> List[VoiceInfo]:
        """Fetch available voices from Cartesia API"""
        if not self._loaded:
            self.load()

        if self._voices_cache is not None:
            return self._voices_cache

        try:
            with httpx.Client() as client:
                response = client.get(
                    f"{self.API_BASE}/voices",
                    headers={
                        "X-API-Key": self._api_key,
                        "Cartesia-Version": "2024-06-10",
                    },
                    timeout=30.0,
                )
                response.raise_for_status()
                data = response.json()

                voices = []
                for voice in data:
                    voices.append(VoiceInfo(
                        id=voice.get("id", ""),
                        name=voice.get("name", "Unknown"),
                        description=voice.get("description", ""),
                        language=voice.get("language", "en"),
                    ))

                self._voices_cache = voices
                return voices

        except Exception as e:
            print(f"[Cartesia] Failed to fetch voices: {e}")
            return [
                VoiceInfo(id="a0e99841-438c-4a64-b679-ae501e7d6091", name="Barbershop Man", description="Warm male voice"),
                VoiceInfo(id="156fb8d2-335b-4950-9cb3-a2d33f2e1847", name="British Lady", description="British female voice"),
                VoiceInfo(id="79a125e8-cd45-4c13-8a67-188112f4dd22", name="California Girl", description="Young female voice"),
            ]

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
        Generate audio using Cartesia TTS API.

        Args:
            text: Text to synthesize
            voice_id: Cartesia voice ID
            voice_audio_path: Path to reference audio for voice cloning
            language: Language code
            speed: Speech speed
            **kwargs: Additional params (emotion, model)

        Returns:
            Tuple of (audio_array, sample_rate)
        """
        if not self._loaded:
            self.load(kwargs.get("model"))

        model_id = kwargs.get("model", self._model or "sonic-multilingual")
        emotion = kwargs.get("emotion", "neutral")

        # Default voice if not specified
        if not voice_id:
            voice_id = "a0e99841-438c-4a64-b679-ae501e7d6091"  # Barbershop Man

        try:
            # Build voice specification
            voice_spec = {"mode": "id", "id": voice_id}

            # If reference audio provided, use embedding mode
            if voice_audio_path:
                embedding = self._create_voice_embedding(voice_audio_path)
                if embedding:
                    voice_spec = {"mode": "embedding", "embedding": embedding}

            # Build request
            payload = {
                "model_id": model_id,
                "transcript": text,
                "voice": voice_spec,
                "output_format": {
                    "container": "wav",
                    "encoding": "pcm_f32le",
                    "sample_rate": 44100,
                },
                "language": language,
            }

            # Add emotion control if supported
            if emotion != "neutral":
                payload["__experimental_controls"] = {
                    "emotion": [emotion, "high"]
                }

            # Add speed control
            if speed != 1.0:
                payload["__experimental_controls"] = payload.get("__experimental_controls", {})
                payload["__experimental_controls"]["speed"] = speed

            with httpx.Client() as client:
                response = client.post(
                    f"{self.API_BASE}/tts/bytes",
                    headers={
                        "X-API-Key": self._api_key,
                        "Cartesia-Version": "2024-06-10",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                    timeout=120.0,
                )
                response.raise_for_status()
                audio_bytes = response.content

            # Decode audio
            audio_array, sample_rate = self._decode_audio(audio_bytes)

            return audio_array, sample_rate

        except Exception as e:
            raise RuntimeError(f"Cartesia TTS generation failed: {e}")

    def _create_voice_embedding(self, audio_path: str) -> Optional[list]:
        """Create voice embedding from reference audio"""
        try:
            with open(audio_path, "rb") as f:
                audio_data = f.read()

            with httpx.Client() as client:
                response = client.post(
                    f"{self.API_BASE}/voices/clone/clip",
                    headers={
                        "X-API-Key": self._api_key,
                        "Cartesia-Version": "2024-06-10",
                    },
                    files={"clip": ("reference.wav", audio_data, "audio/wav")},
                    timeout=60.0,
                )
                response.raise_for_status()
                data = response.json()
                return data.get("embedding")

        except Exception as e:
            print(f"[Cartesia] Failed to create voice embedding: {e}")
            return None

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

                # Handle float32 PCM
                if sample_width == 4:
                    audio_array = np.frombuffer(raw_data, dtype=np.float32)
                elif sample_width == 2:
                    audio_array = np.frombuffer(raw_data, dtype=np.int16).astype(np.float32) / 32768.0
                else:
                    audio_array = np.frombuffer(raw_data, dtype=np.uint8).astype(np.float32) / 128.0 - 1.0

                if n_channels == 2:
                    audio_array = audio_array.reshape(-1, 2).mean(axis=1)

                return audio_array, sample_rate
