"""SiliconFlow TTS Provider - CosyVoice and other models via API"""

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


class SiliconFlowProvider(TTSProvider):
    """SiliconFlow TTS - Access to CosyVoice and other open models"""

    API_BASE = "https://api.siliconflow.cn/v1"

    def __init__(self, device: Optional[str] = None):
        self._loaded = False
        self._api_key = None
        self.device = "api"

    @classmethod
    def get_info(cls) -> TTSProviderInfo:
        return TTSProviderInfo(
            id="siliconflow",
            name="SiliconFlow (CosyVoice)",
            description="API access to CosyVoice and other open TTS models. Great for Chinese and multilingual.",
            voice_cloning=VoiceCloningSupport.ZERO_SHOT,
            supported_languages=[
                "zh", "en", "ja", "ko", "yue",  # CosyVoice languages
            ],
            models=[
                ModelVariant(
                    id="FunAudioLLM/CosyVoice2-0.5B",
                    name="CosyVoice 2 (0.5B)",
                    size_gb=0,
                    vram_gb=0,
                    description="Latest CosyVoice model, best quality"
                ),
                ModelVariant(
                    id="FunAudioLLM/CosyVoice-300M-SFT",
                    name="CosyVoice SFT (300M)",
                    size_gb=0,
                    vram_gb=0,
                    description="Fine-tuned model with preset voices"
                ),
                ModelVariant(
                    id="FunAudioLLM/CosyVoice-300M-Instruct",
                    name="CosyVoice Instruct (300M)",
                    size_gb=0,
                    vram_gb=0,
                    description="Instruction-following model"
                ),
            ],
            default_model="FunAudioLLM/CosyVoice2-0.5B",
            sample_rate=22050,
            requires_reference_text=True,  # CosyVoice needs reference text
            vram_requirement_gb=0,
            supports_streaming=False,
            supports_emotion_tags=False,
            preset_voices=[
                VoiceInfo(id="中文女", name="Chinese Female", description="Standard Chinese female voice", language="zh"),
                VoiceInfo(id="中文男", name="Chinese Male", description="Standard Chinese male voice", language="zh"),
                VoiceInfo(id="英文女", name="English Female", description="English female voice", language="en"),
                VoiceInfo(id="英文男", name="English Male", description="English male voice", language="en"),
                VoiceInfo(id="日语男", name="Japanese Male", description="Japanese male voice", language="ja"),
                VoiceInfo(id="粤语女", name="Cantonese Female", description="Cantonese female voice", language="yue"),
                VoiceInfo(id="韩语女", name="Korean Female", description="Korean female voice", language="ko"),
            ],
            extra_params={
                "speed": {
                    "type": "float",
                    "default": 1.0,
                    "min": 0.5,
                    "max": 2.0,
                    "description": "Speech speed"
                },
            },
        )

    def load(self, model: Optional[str] = None) -> None:
        """Initialize the SiliconFlow client"""
        from settings_service import settings_service

        self._api_key = settings_service.get_api_key("siliconflow")
        if not self._api_key:
            raise ValueError("SiliconFlow API key not configured. Set it in Settings.")

        self._model = model or "FunAudioLLM/CosyVoice2-0.5B"
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
        language: str = "zh",
        speed: float = 1.0,
        **kwargs
    ) -> tuple[np.ndarray, int]:
        """
        Generate audio using SiliconFlow TTS API.

        Args:
            text: Text to synthesize
            voice_id: Voice name (e.g., "中文女")
            voice_audio_path: Path to reference audio for voice cloning
            voice_audio_text: Transcript of reference audio (required for CosyVoice)
            language: Language code
            speed: Speech speed
            **kwargs: Additional params

        Returns:
            Tuple of (audio_array, sample_rate)
        """
        if not self._loaded:
            self.load(kwargs.get("model"))

        model = kwargs.get("model", self._model)

        # Default voice based on language
        if not voice_id:
            voice_map = {
                "zh": "中文女",
                "en": "英文女",
                "ja": "日语男",
                "ko": "韩语女",
                "yue": "粤语女",
            }
            voice_id = voice_map.get(language, "中文女")

        try:
            # Build request payload
            payload = {
                "model": model,
                "input": text,
                "voice": voice_id,
                "response_format": "wav",
            }

            # Add speed if not default
            if speed != 1.0:
                payload["speed"] = speed

            # Handle voice cloning with reference audio
            if voice_audio_path:
                with open(voice_audio_path, "rb") as f:
                    audio_data = f.read()
                audio_base64 = base64.b64encode(audio_data).decode("utf-8")

                # CosyVoice clone endpoint
                payload = {
                    "model": model,
                    "input": text,
                    "voice": "clone",
                    "reference_audio": f"data:audio/wav;base64,{audio_base64}",
                    "response_format": "wav",
                }

                if voice_audio_text:
                    payload["reference_text"] = voice_audio_text

            with httpx.Client() as client:
                response = client.post(
                    f"{self.API_BASE}/audio/speech",
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

            return audio_array, sample_rate

        except Exception as e:
            raise RuntimeError(f"SiliconFlow TTS generation failed: {e}")

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
