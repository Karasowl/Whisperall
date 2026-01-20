"""VoxCPM TTS Provider - Voice cloning TTS from OpenBMB"""

import torch
import numpy as np
from pathlib import Path
from typing import Optional, List

from .base import TTSProvider, TTSProviderInfo, VoiceCloningSupport, VoiceInfo


# VoxCPM supported languages
VOXCPM_LANGUAGES = {
    "en": "English",
    "zh": "Chinese",
}


class VoxCPMProvider(TTSProvider):
    """Provider for VoxCPM TTS - Voice cloning from OpenBMB"""

    def __init__(self, device: Optional[str] = None):
        super().__init__(device)
        self._model = None

    @classmethod
    def get_info(cls) -> TTSProviderInfo:
        return TTSProviderInfo(
            id="voxcpm",
            name="VoxCPM",
            description="Voice cloning TTS from OpenBMB. Good for English and Chinese. ~4-6GB VRAM.",
            voice_cloning=VoiceCloningSupport.ZERO_SHOT,
            supported_languages=list(VOXCPM_LANGUAGES.keys()),
            models=[
                {
                    "id": "voxcpm-base",
                    "name": "VoxCPM Base",
                    "size_gb": 2.0,
                    "vram_gb": 4.0,
                    "description": "Base model for voice cloning"
                },
                {
                    "id": "voxcpm-large",
                    "name": "VoxCPM Large",
                    "size_gb": 3.5,
                    "vram_gb": 6.0,
                    "description": "Larger model with better quality"
                }
            ],
            default_model="voxcpm-base",
            sample_rate=24000,
            requires_reference_text=True,  # VoxCPM works better with transcription
            min_reference_duration=3.0,
            max_reference_duration=30.0,
            vram_requirement_gb=4.0,
            supports_streaming=False,
            supports_emotion_tags=False,
            preset_voices=[],
            extra_params={
                "temperature": {"type": "float", "default": 0.7, "min": 0.1, "max": 1.5},
                "top_p": {"type": "float", "default": 0.9, "min": 0.1, "max": 1.0},
            }
        )

    def _check_installed(self) -> bool:
        """Check if VoxCPM is installed"""
        try:
            import voxcpm
            return True
        except ImportError:
            return False

    def load(self, model: Optional[str] = None) -> None:
        """Load VoxCPM model"""
        if not self._check_installed():
            raise RuntimeError(
                "VoxCPM TTS is not available. "
                "Visit the Models page to download and install this TTS provider."
            )

        if self._model is not None:
            self._loaded = True
            return

        print(f"[VoxCPM] Loading model on {self.device}...")

        try:
            from voxcpm import VoxCPM

            model_id = model or "voxcpm-base"
            model_name = "openbmb/VoxCPM" if "base" in model_id else "openbmb/VoxCPM-large"

            self._model = VoxCPM.from_pretrained(model_name, device=self.device)

            self._loaded = True
            print("[VoxCPM] Model loaded successfully")
        except Exception as e:
            raise RuntimeError(f"Failed to load VoxCPM model: {e}")

    def unload(self) -> None:
        """Unload model"""
        if self._model is not None:
            del self._model
            self._model = None
        self._loaded = False
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        print("[VoxCPM] Model unloaded")

    def generate(
        self,
        text: str,
        voice_id: Optional[str] = None,
        voice_audio_path: Optional[str] = None,
        voice_audio_text: Optional[str] = None,
        language: str = "en",
        speed: float = 1.0,
        model: Optional[str] = None,
        seed: Optional[int] = None,
        temperature: float = 0.7,
        top_p: float = 0.9,
        **kwargs
    ) -> tuple[np.ndarray, int]:
        """Generate audio using VoxCPM TTS"""

        if self._model is None:
            self.load(model)

        print(f"[VoxCPM] Generating: lang={language}, text_len={len(text)}")

        if seed is not None and seed > 0:
            torch.manual_seed(seed)
            if torch.cuda.is_available():
                torch.cuda.manual_seed(seed)

        try:
            # Load reference audio if provided
            prompt_audio = None
            prompt_text = voice_audio_text or ""

            if voice_audio_path:
                import torchaudio
                prompt_audio, sr = torchaudio.load(voice_audio_path)
                if sr != 24000:
                    prompt_audio = torchaudio.functional.resample(prompt_audio, sr, 24000)

            # Generate audio
            audio = self._model.generate(
                text=text,
                prompt_audio=prompt_audio,
                prompt_text=prompt_text,
                temperature=temperature,
                top_p=top_p,
            )

            # Apply speed adjustment if needed
            if speed != 1.0 and audio is not None:
                import librosa
                audio_np = audio.cpu().numpy() if isinstance(audio, torch.Tensor) else audio
                audio = librosa.effects.time_stretch(audio_np, rate=speed)

            # Convert to numpy
            if isinstance(audio, torch.Tensor):
                audio = audio.cpu().numpy()

            if audio.dtype != np.float32:
                audio = audio.astype(np.float32)

            return audio, 24000

        except Exception as e:
            raise RuntimeError(f"VoxCPM generation failed: {e}")
