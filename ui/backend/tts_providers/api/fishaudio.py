"""Fish Audio TTS Provider - High-quality voice synthesis with cloning"""

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


class FishAudioProvider(TTSProvider):
    """Fish Audio TTS Provider - Zero-shot voice cloning and high-quality synthesis"""

    API_BASE = "https://api.fish.audio"

    def __init__(self, device: Optional[str] = None):
        self._loaded = False
        self._api_key = None
        self.device = "api"

    @classmethod
    def get_info(cls) -> TTSProviderInfo:
        return TTSProviderInfo(
            id="fishaudio",
            name="Fish Audio",
            description="High-quality TTS with instant voice cloning. Supports multiple languages.",
            voice_cloning=VoiceCloningSupport.ZERO_SHOT,
            supported_languages=[
                "en", "zh", "ja", "ko", "es", "fr", "de", "it", "pt", "ru",
                "ar", "hi", "id", "th", "vi", "pl", "nl", "tr",
            ],
            models=[
                ModelVariant(
                    id="default",
                    name="Fish Audio v1",
                    size_gb=0,
                    vram_gb=0,
                    description="Default high-quality model"
                ),
            ],
            default_model="default",
            sample_rate=44100,
            requires_reference_text=False,
            vram_requirement_gb=0,
            supports_streaming=True,
            supports_emotion_tags=False,
            preset_voices=[
                VoiceInfo(id="default", name="Default Voice", description="Fish Audio default voice"),
            ],
            extra_params={
                "chunk_length": {
                    "type": "int",
                    "default": 200,
                    "min": 100,
                    "max": 500,
                    "description": "Audio chunk length for processing"
                },
                "normalize": {
                    "type": "boolean",
                    "default": True,
                    "description": "Normalize audio output"
                },
                "latency": {
                    "type": "select",
                    "default": "normal",
                    "options": ["normal", "balanced"],
                    "description": "Latency mode"
                },
            },
        )

    def load(self, model: Optional[str] = None) -> None:
        """Initialize the Fish Audio client"""
        from settings_service import settings_service

        self._api_key = settings_service.get_api_key("fishaudio")
        if not self._api_key:
            raise ValueError("Fish Audio API key not configured. Set it in Settings.")

        self._model = model or "default"
        self._loaded = True

    def unload(self) -> None:
        """Clear the client"""
        self._api_key = None
        self._loaded = False

    def get_preset_voices(self, language: Optional[str] = None) -> List[VoiceInfo]:
        """Fetch available voices from Fish Audio API"""
        if not self._loaded:
            self.load()

        try:
            with httpx.Client() as client:
                response = client.get(
                    f"{self.API_BASE}/model",
                    headers={"Authorization": f"Bearer {self._api_key}"},
                    params={"page_size": 50, "sort": "score"},
                    timeout=30.0,
                )
                response.raise_for_status()
                data = response.json()

                voices = []
                for item in data.get("items", []):
                    voices.append(VoiceInfo(
                        id=item.get("_id", ""),
                        name=item.get("title", "Unknown"),
                        description=item.get("description", "")[:100] if item.get("description") else "",
                        language=",".join(item.get("languages", [])),
                    ))
                return voices if voices else self.get_info().preset_voices

        except Exception as e:
            print(f"[FishAudio] Failed to fetch voices: {e}")
            return self.get_info().preset_voices

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
        Generate audio using Fish Audio TTS API.

        Args:
            text: Text to synthesize
            voice_id: Fish Audio voice/model ID
            voice_audio_path: Path to reference audio for voice cloning
            language: Language code
            speed: Playback speed (applied post-process)
            **kwargs: Additional params

        Returns:
            Tuple of (audio_array, sample_rate)
        """
        if not self._loaded:
            self.load(kwargs.get("model"))

        chunk_length = kwargs.get("chunk_length", 200)
        normalize = kwargs.get("normalize", True)
        latency = kwargs.get("latency", "normal")

        try:
            # Prepare request payload
            payload = {
                "text": text,
                "chunk_length": chunk_length,
                "normalize": normalize,
                "format": "wav",
                "latency": latency,
            }

            # Add reference audio if provided (voice cloning)
            files = None
            if voice_audio_path:
                with open(voice_audio_path, "rb") as f:
                    reference_audio = f.read()
                files = {"reference_audio": ("reference.wav", reference_audio, "audio/wav")}
                if voice_audio_text:
                    payload["reference_text"] = voice_audio_text
            elif voice_id and voice_id != "default":
                payload["reference_id"] = voice_id

            with httpx.Client() as client:
                if files:
                    response = client.post(
                        f"{self.API_BASE}/v1/tts",
                        headers={"Authorization": f"Bearer {self._api_key}"},
                        data=payload,
                        files=files,
                        timeout=120.0,
                    )
                else:
                    response = client.post(
                        f"{self.API_BASE}/v1/tts",
                        headers={
                            "Authorization": f"Bearer {self._api_key}",
                            "Content-Type": "application/json",
                        },
                        json=payload,
                        timeout=120.0,
                    )

                response.raise_for_status()
                audio_bytes = response.content

            # Decode audio
            audio_array, sample_rate = self._decode_audio(audio_bytes)

            # Apply speed adjustment if needed
            if speed != 1.0:
                audio_array = self._adjust_speed(audio_array, sample_rate, speed)

            return audio_array, sample_rate

        except Exception as e:
            raise RuntimeError(f"Fish Audio TTS generation failed: {e}")

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
                    dtype = np.int16
                elif sample_width == 4:
                    dtype = np.int32
                else:
                    dtype = np.uint8

                audio_array = np.frombuffer(raw_data, dtype=dtype)

                if dtype == np.int16:
                    audio_array = audio_array.astype(np.float32) / 32768.0
                elif dtype == np.int32:
                    audio_array = audio_array.astype(np.float32) / 2147483648.0
                else:
                    audio_array = audio_array.astype(np.float32) / 128.0 - 1.0

                if n_channels == 2:
                    audio_array = audio_array.reshape(-1, 2).mean(axis=1)

                return audio_array, sample_rate

    def _adjust_speed(self, audio: np.ndarray, sample_rate: int, speed: float) -> np.ndarray:
        """Adjust audio playback speed"""
        try:
            import librosa
            return librosa.effects.time_stretch(audio, rate=speed)
        except ImportError:
            from scipy import signal
            new_length = int(len(audio) / speed)
            return signal.resample(audio, new_length)
