"""VibeVoice TTS Provider - Lightweight multilingual TTS"""

import torch
import numpy as np
from pathlib import Path
from typing import Optional, List

from .base import TTSProvider, TTSProviderInfo, VoiceCloningSupport, VoiceInfo


# VibeVoice supported languages
VIBEVOICE_LANGUAGES = {
    "en": "English",
    "es": "Spanish",
    "fr": "French",
    "de": "German",
    "zh": "Chinese",
    "ja": "Japanese",
    "ko": "Korean",
}


class VibeVoiceProvider(TTSProvider):
    """Provider for VibeVoice TTS - Lightweight with voice cloning"""

    def __init__(self, device: Optional[str] = None):
        super().__init__(device)
        self._model = None
        self._vocoder = None

    @classmethod
    def get_info(cls) -> TTSProviderInfo:
        return TTSProviderInfo(
            id="vibevoice",
            name="VibeVoice",
            description="Lightweight multilingual TTS with voice cloning. Only ~2.5GB VRAM. Experimental Spanish support.",
            voice_cloning=VoiceCloningSupport.ZERO_SHOT,
            supported_languages=list(VIBEVOICE_LANGUAGES.keys()),
            models=[
                {
                    "id": "vibevoice-0.5b",
                    "name": "VibeVoice 0.5B",
                    "size_gb": 1.0,
                    "vram_gb": 2.5,
                    "description": "Compact model with good quality"
                }
            ],
            default_model="vibevoice-0.5b",
            sample_rate=24000,
            requires_reference_text=False,
            min_reference_duration=3.0,
            max_reference_duration=15.0,
            vram_requirement_gb=2.5,
            supports_streaming=True,
            supports_emotion_tags=False,
            preset_voices=[],
            extra_params={
                "temperature": {"type": "float", "default": 0.7, "min": 0.1, "max": 1.5},
            }
        )

    def _check_installed(self) -> bool:
        """Check if VibeVoice is installed"""
        try:
            import vibevoice
            return True
        except ImportError:
            return False

    def load(self, model: Optional[str] = None) -> None:
        """Load VibeVoice model"""
        if not self._check_installed():
            raise RuntimeError(
                "VibeVoice TTS is not available. "
                "Visit the Models page to download and install this TTS provider."
            )

        if self._model is not None:
            self._loaded = True
            return

        print(f"[VibeVoice] Loading model on {self.device}...")

        try:
            from vibevoice import VibeVoice

            self._model = VibeVoice.from_pretrained(device=self.device)

            self._loaded = True
            print("[VibeVoice] Model loaded successfully")
        except Exception as e:
            raise RuntimeError(f"Failed to load VibeVoice model: {e}")

    def unload(self) -> None:
        """Unload model"""
        if self._model is not None:
            del self._model
            self._model = None
        if self._vocoder is not None:
            del self._vocoder
            self._vocoder = None
        self._loaded = False
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        print("[VibeVoice] Model unloaded")

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
        **kwargs
    ) -> tuple[np.ndarray, int]:
        """Generate audio using VibeVoice TTS"""

        if self._model is None:
            self.load(model)

        print(f"[VibeVoice] Generating: lang={language}, text_len={len(text)}")

        if seed is not None and seed > 0:
            torch.manual_seed(seed)
            if torch.cuda.is_available():
                torch.cuda.manual_seed(seed)

        try:
            # Load reference audio if provided
            ref_audio = None
            if voice_audio_path:
                import librosa
                ref_audio, _ = librosa.load(voice_audio_path, sr=24000)

            # Generate audio
            audio = self._model.synthesize(
                text=text,
                reference_audio=ref_audio,
                language=language,
                temperature=temperature,
                speed=speed,
            )

            # Convert to numpy
            if isinstance(audio, torch.Tensor):
                audio = audio.cpu().numpy()

            if audio.dtype != np.float32:
                audio = audio.astype(np.float32)

            return audio, 24000

        except Exception as e:
            raise RuntimeError(f"VibeVoice generation failed: {e}")
