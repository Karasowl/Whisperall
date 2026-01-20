"""MiniMax TTS Provider - Chinese AI company with high-quality TTS"""

from typing import Optional, List
import numpy as np
import io
import httpx
import base64

from ..base import (
    TTSProvider,
    TTSProviderInfo,
    VoiceCloningSupport,
    VoiceInfo,
    ModelVariant,
)


class MiniMaxTTSProvider(TTSProvider):
    """MiniMax TTS - High-quality Chinese and multilingual synthesis"""

    API_BASE = "https://api.minimax.chat/v1"

    def __init__(self, device: Optional[str] = None):
        self._loaded = False
        self._api_key = None
        self._group_id = None
        self.device = "api"

    @classmethod
    def get_info(cls) -> TTSProviderInfo:
        return TTSProviderInfo(
            id="minimax",
            name="MiniMax TTS",
            description="High-quality TTS from MiniMax. Excellent for Chinese with multilingual support.",
            voice_cloning=VoiceCloningSupport.ZERO_SHOT,
            supported_languages=[
                "zh", "en", "ja", "ko",
            ],
            models=[
                ModelVariant(
                    id="speech-01-turbo",
                    name="Speech 01 Turbo",
                    size_gb=0,
                    vram_gb=0,
                    description="Fast, optimized for real-time"
                ),
                ModelVariant(
                    id="speech-01-hd",
                    name="Speech 01 HD",
                    size_gb=0,
                    vram_gb=0,
                    description="Higher quality, more expressive"
                ),
                ModelVariant(
                    id="speech-02",
                    name="Speech 02",
                    size_gb=0,
                    vram_gb=0,
                    description="Latest model with emotion control"
                ),
            ],
            default_model="speech-01-turbo",
            sample_rate=24000,
            requires_reference_text=False,
            vram_requirement_gb=0,
            supports_streaming=True,
            supports_emotion_tags=True,
            preset_voices=[
                VoiceInfo(id="male-qn-qingse", name="青涩青年", description="Young male voice", gender="male", language="zh"),
                VoiceInfo(id="male-qn-jingying", name="精英青年", description="Elite male voice", gender="male", language="zh"),
                VoiceInfo(id="male-qn-badao", name="霸道青年", description="Assertive male", gender="male", language="zh"),
                VoiceInfo(id="male-qn-daxuesheng", name="大学生", description="College student male", gender="male", language="zh"),
                VoiceInfo(id="female-shaonv", name="少女", description="Young female voice", gender="female", language="zh"),
                VoiceInfo(id="female-yujie", name="御姐", description="Mature female voice", gender="female", language="zh"),
                VoiceInfo(id="female-chengshu", name="成熟女性", description="Mature woman", gender="female", language="zh"),
                VoiceInfo(id="female-tianmei", name="甜美女生", description="Sweet female", gender="female", language="zh"),
                VoiceInfo(id="presenter_male", name="Presenter Male", description="News presenter male", gender="male", language="zh"),
                VoiceInfo(id="presenter_female", name="Presenter Female", description="News presenter female", gender="female", language="zh"),
                VoiceInfo(id="audiobook_male_1", name="Audiobook Male", description="Audiobook narrator male", gender="male", language="zh"),
                VoiceInfo(id="audiobook_female_1", name="Audiobook Female", description="Audiobook narrator female", gender="female", language="zh"),
            ],
            extra_params={
                "speed": {
                    "type": "float",
                    "default": 1.0,
                    "min": 0.5,
                    "max": 2.0,
                    "description": "Speech speed"
                },
                "pitch": {
                    "type": "int",
                    "default": 0,
                    "min": -12,
                    "max": 12,
                    "description": "Pitch adjustment in semitones"
                },
                "emotion": {
                    "type": "select",
                    "default": "neutral",
                    "options": ["neutral", "happy", "sad", "angry", "fearful", "disgusted", "surprised"],
                    "description": "Emotional tone (speech-02 only)"
                },
            },
        )

    def load(self, model: Optional[str] = None) -> None:
        """Initialize the MiniMax client"""
        from settings_service import settings_service

        self._api_key = settings_service.get_api_key("minimax")
        if not self._api_key:
            raise ValueError("MiniMax API key not configured. Set it in Settings.")

        # MiniMax requires group_id, can be provided as "api_key:group_id"
        if ":" in self._api_key:
            self._api_key, self._group_id = self._api_key.split(":", 1)
        else:
            self._group_id = settings_service.get_api_key("minimax_group_id") or ""

        self._model = model or "speech-01-turbo"
        self._loaded = True

    def unload(self) -> None:
        """Clear the client"""
        self._api_key = None
        self._group_id = None
        self._loaded = False

    def generate(
        self,
        text: str,
        voice_id: Optional[str] = None,
        voice_audio_path: Optional[str] = None,
        voice_audio_text: Optional[str] = None,
        language: str = "zh",
        speed: float = 1.0,
        **kwargs
    ) -> tuple[np.ndarray, int]:
        """
        Generate audio using MiniMax TTS API.

        Args:
            text: Text to synthesize
            voice_id: MiniMax voice ID
            voice_audio_path: Path to reference audio for voice cloning
            language: Language code
            speed: Speech speed
            **kwargs: Additional params (pitch, emotion, model)

        Returns:
            Tuple of (audio_array, sample_rate)
        """
        if not self._loaded:
            self.load(kwargs.get("model"))

        model = kwargs.get("model", self._model)
        pitch = kwargs.get("pitch", 0)
        emotion = kwargs.get("emotion", "neutral")

        # Default voice
        if not voice_id:
            voice_id = "female-shaonv" if language == "zh" else "presenter_female"

        try:
            # Build request payload
            payload = {
                "model": model,
                "text": text,
                "voice_setting": {
                    "voice_id": voice_id,
                    "speed": speed,
                    "pitch": pitch,
                },
                "audio_setting": {
                    "sample_rate": 24000,
                    "format": "wav",
                },
            }

            # Add emotion for speech-02
            if model == "speech-02" and emotion != "neutral":
                payload["voice_setting"]["emotion"] = emotion

            # Handle voice cloning
            if voice_audio_path:
                with open(voice_audio_path, "rb") as f:
                    audio_data = f.read()
                audio_base64 = base64.b64encode(audio_data).decode("utf-8")

                payload["voice_setting"]["voice_id"] = "clone"
                payload["voice_setting"]["audio_sample"] = audio_base64
                if voice_audio_text:
                    payload["voice_setting"]["audio_sample_text"] = voice_audio_text

            # Build URL with group_id if available
            url = f"{self.API_BASE}/t2a_v2"
            if self._group_id:
                url = f"{url}?GroupId={self._group_id}"

            with httpx.Client() as client:
                response = client.post(
                    url,
                    headers={
                        "Authorization": f"Bearer {self._api_key}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                    timeout=120.0,
                )
                response.raise_for_status()
                data = response.json()

                # MiniMax returns base64 audio in response
                audio_base64 = data.get("data", {}).get("audio", "")
                if not audio_base64:
                    # Alternative: some endpoints return audio directly
                    if response.headers.get("content-type", "").startswith("audio"):
                        audio_bytes = response.content
                    else:
                        raise RuntimeError("No audio data in response")
                else:
                    audio_bytes = base64.b64decode(audio_base64)

            # Decode audio
            audio_array, sample_rate = self._decode_audio(audio_bytes)

            return audio_array, sample_rate

        except Exception as e:
            raise RuntimeError(f"MiniMax TTS generation failed: {e}")

    def _decode_audio(self, audio_bytes: bytes) -> tuple[np.ndarray, int]:
        """Decode WAV/MP3 bytes to numpy array"""
        # Try WAV first
        try:
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
        except Exception:
            pass

        # Try MP3 with soundfile or pydub
        try:
            import soundfile as sf
            with io.BytesIO(audio_bytes) as audio_io:
                audio_array, sample_rate = sf.read(audio_io)
                if len(audio_array.shape) > 1:
                    audio_array = audio_array.mean(axis=1)
                return audio_array.astype(np.float32), sample_rate
        except ImportError:
            from pydub import AudioSegment
            audio = AudioSegment.from_file(io.BytesIO(audio_bytes))
            sample_rate = audio.frame_rate
            samples = np.array(audio.get_array_of_samples()).astype(np.float32)
            if audio.sample_width == 2:
                samples = samples / 32768.0
            if audio.channels == 2:
                samples = samples.reshape(-1, 2).mean(axis=1)
            return samples, sample_rate
