"""PlayHT TTS Provider - High-quality voice synthesis with instant cloning"""

from typing import Optional, List
import numpy as np
import io
import httpx
import time

from ..base import (
    TTSProvider,
    TTSProviderInfo,
    VoiceCloningSupport,
    VoiceInfo,
    ModelVariant,
)


class PlayHTProvider(TTSProvider):
    """PlayHT TTS - High quality synthesis with instant voice cloning"""

    API_BASE = "https://api.play.ht/api/v2"

    def __init__(self, device: Optional[str] = None):
        self._loaded = False
        self._api_key = None
        self._user_id = None
        self._voices_cache = None
        self.device = "api"

    @classmethod
    def get_info(cls) -> TTSProviderInfo:
        return TTSProviderInfo(
            id="playht",
            name="PlayHT",
            description="High-quality voice synthesis with instant voice cloning and emotion control.",
            voice_cloning=VoiceCloningSupport.ZERO_SHOT,
            supported_languages=[
                "en", "es", "fr", "de", "it", "pt", "pl", "zh", "ja", "ko",
                "ar", "hi", "ru", "nl", "sv", "tr", "cs", "da", "fi", "el",
                "he", "hu", "id", "ms", "no", "ro", "th", "uk", "vi",
            ],
            models=[
                ModelVariant(
                    id="PlayHT2.0-turbo",
                    name="PlayHT 2.0 Turbo",
                    size_gb=0,
                    vram_gb=0,
                    description="Fastest, optimized for real-time"
                ),
                ModelVariant(
                    id="PlayHT2.0",
                    name="PlayHT 2.0",
                    size_gb=0,
                    vram_gb=0,
                    description="Best quality, more expressive"
                ),
                ModelVariant(
                    id="Play3.0-mini",
                    name="Play 3.0 Mini",
                    size_gb=0,
                    vram_gb=0,
                    description="Latest model, balanced speed/quality"
                ),
            ],
            default_model="PlayHT2.0-turbo",
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
                    "description": "Speech speed"
                },
                "temperature": {
                    "type": "float",
                    "default": 1.0,
                    "min": 0.1,
                    "max": 2.0,
                    "description": "Voice variability"
                },
                "emotion": {
                    "type": "select",
                    "default": "neutral",
                    "options": ["neutral", "happy", "sad", "angry", "fearful", "surprised", "disgust"],
                    "description": "Emotional tone"
                },
                "voice_guidance": {
                    "type": "float",
                    "default": 3.0,
                    "min": 1.0,
                    "max": 6.0,
                    "description": "How closely to follow voice characteristics"
                },
            },
        )

    def load(self, model: Optional[str] = None) -> None:
        """Initialize the PlayHT client"""
        from settings_service import settings_service

        self._api_key = settings_service.get_api_key("playht")
        if not self._api_key:
            raise ValueError("PlayHT API key not configured. Set it in Settings.")

        # PlayHT requires both API key and User ID
        # User ID can be provided as "api_key:user_id" or separately
        if ":" in self._api_key:
            self._api_key, self._user_id = self._api_key.split(":", 1)
        else:
            # Try to get user ID from settings or use API key as fallback
            self._user_id = settings_service.get_api_key("playht_user_id") or self._api_key

        self._model = model or "PlayHT2.0-turbo"
        self._loaded = True

    def unload(self) -> None:
        """Clear the client"""
        self._api_key = None
        self._user_id = None
        self._voices_cache = None
        self._loaded = False

    def get_preset_voices(self, language: Optional[str] = None) -> List[VoiceInfo]:
        """Fetch available voices from PlayHT API"""
        if not self._loaded:
            self.load()

        if self._voices_cache is not None:
            return self._voices_cache

        try:
            with httpx.Client() as client:
                response = client.get(
                    f"{self.API_BASE}/voices",
                    headers={
                        "Authorization": f"Bearer {self._api_key}",
                        "X-User-ID": self._user_id,
                    },
                    timeout=30.0,
                )
                response.raise_for_status()
                data = response.json()

                voices = []
                for voice in data:
                    raw_sample = voice.get("sample")
                    sample_url = raw_sample if isinstance(raw_sample, str) and raw_sample.startswith("http") else None
                    description = voice.get("description") or voice.get("accent") or ""
                    if not description and isinstance(raw_sample, str) and not raw_sample.startswith("http"):
                        description = raw_sample
                    voices.append(VoiceInfo(
                        id=voice.get("id", ""),
                        name=voice.get("name", "Unknown"),
                        description=description,
                        language=voice.get("language", "en"),
                        gender=voice.get("gender"),
                        sample_url=sample_url,
                    ))

                self._voices_cache = voices[:50]  # Limit to 50 voices
                return self._voices_cache

        except Exception as e:
            print(f"[PlayHT] Failed to fetch voices: {e}")
            return [
                VoiceInfo(id="s3://voice-cloning-zero-shot/d9ff78ba-d016-47f6-b0ef-dd630f59414e/female-cs/manifest.json",
                         name="Jennifer", description="American Female"),
                VoiceInfo(id="s3://voice-cloning-zero-shot/820da3d2-3a3b-42e7-844d-e68db835a206/sarah/manifest.json",
                         name="Sarah", description="British Female"),
                VoiceInfo(id="s3://voice-cloning-zero-shot/65977f5e-a22a-4b36-861b-ecede19bdd65/oliver/manifest.json",
                         name="Oliver", description="British Male"),
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
        Generate audio using PlayHT TTS API.

        Args:
            text: Text to synthesize
            voice_id: PlayHT voice ID
            voice_audio_path: Path to reference audio for voice cloning
            language: Language code
            speed: Speech speed
            **kwargs: Additional params

        Returns:
            Tuple of (audio_array, sample_rate)
        """
        if not self._loaded:
            self.load(kwargs.get("model"))

        model = kwargs.get("model", self._model or "PlayHT2.0-turbo")
        temperature = kwargs.get("temperature", 1.0)
        emotion = kwargs.get("emotion", "neutral")
        voice_guidance = kwargs.get("voice_guidance", 3.0)

        # Default voice
        if not voice_id:
            voice_id = "s3://voice-cloning-zero-shot/d9ff78ba-d016-47f6-b0ef-dd630f59414e/female-cs/manifest.json"

        try:
            # Handle voice cloning if reference audio provided
            if voice_audio_path:
                cloned_voice_id = self._clone_voice(voice_audio_path)
                if cloned_voice_id:
                    voice_id = cloned_voice_id

            # Build request payload
            payload = {
                "text": text,
                "voice": voice_id,
                "voice_engine": model,
                "output_format": "wav",
                "speed": speed,
                "temperature": temperature,
                "voice_guidance": voice_guidance,
            }

            # Add emotion if supported by model
            if emotion != "neutral" and model.startswith("PlayHT2"):
                payload["emotion"] = emotion

            # Start generation job
            with httpx.Client() as client:
                response = client.post(
                    f"{self.API_BASE}/tts",
                    headers={
                        "Authorization": f"Bearer {self._api_key}",
                        "X-User-ID": self._user_id,
                        "Content-Type": "application/json",
                    },
                    json=payload,
                    timeout=30.0,
                )
                response.raise_for_status()
                job_data = response.json()

                # Get the audio URL (polling if needed)
                audio_url = job_data.get("url")
                if not audio_url:
                    job_id = job_data.get("id")
                    audio_url = self._poll_for_result(client, job_id)

                # Download audio
                audio_response = client.get(audio_url, timeout=60.0)
                audio_response.raise_for_status()
                audio_bytes = audio_response.content

            # Decode audio
            audio_array, sample_rate = self._decode_audio(audio_bytes)

            return audio_array, sample_rate

        except Exception as e:
            raise RuntimeError(f"PlayHT TTS generation failed: {e}")

    def _clone_voice(self, audio_path: str) -> Optional[str]:
        """Clone a voice from reference audio"""
        try:
            with open(audio_path, "rb") as f:
                audio_data = f.read()

            with httpx.Client() as client:
                response = client.post(
                    f"{self.API_BASE}/cloned-voices/instant",
                    headers={
                        "Authorization": f"Bearer {self._api_key}",
                        "X-User-ID": self._user_id,
                    },
                    files={"sample_file": ("reference.wav", audio_data, "audio/wav")},
                    data={"voice_name": f"cloned_{int(time.time())}"},
                    timeout=120.0,
                )
                response.raise_for_status()
                data = response.json()
                return data.get("id")

        except Exception as e:
            print(f"[PlayHT] Failed to clone voice: {e}")
            return None

    def _poll_for_result(self, client: httpx.Client, job_id: str, max_attempts: int = 30) -> str:
        """Poll for job completion and return audio URL"""
        for _ in range(max_attempts):
            response = client.get(
                f"{self.API_BASE}/tts/{job_id}",
                headers={
                    "Authorization": f"Bearer {self._api_key}",
                    "X-User-ID": self._user_id,
                },
                timeout=10.0,
            )
            response.raise_for_status()
            data = response.json()

            if data.get("status") == "complete":
                return data.get("url")
            elif data.get("status") == "failed":
                raise RuntimeError(f"PlayHT job failed: {data.get('error')}")

            time.sleep(1)

        raise RuntimeError("PlayHT job timed out")

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
