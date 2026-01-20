"""Zonos TTS Provider - High-quality multilingual TTS from Zyphra"""

import torch
import numpy as np
from pathlib import Path
from typing import Optional, List

from .base import TTSProvider, TTSProviderInfo, VoiceCloningSupport, VoiceInfo


# Zonos supported languages
ZONOS_LANGUAGES = {
    "en": "English",
    "es": "Spanish",
    "fr": "French",
    "de": "German",
    "zh": "Chinese",
    "ja": "Japanese",
    "ko": "Korean",
    "it": "Italian",
    "pt": "Portuguese",
}


class ZonosProvider(TTSProvider):
    """Provider for Zonos TTS - High-quality multilingual from Zyphra"""

    def __init__(self, device: Optional[str] = None):
        super().__init__(device)
        self._model = None

    @classmethod
    def get_info(cls) -> TTSProviderInfo:
        return TTSProviderInfo(
            id="zonos",
            name="Zonos",
            description="High-quality multilingual TTS from Zyphra. Zero-shot voice cloning with excellent prosody. ~6GB VRAM.",
            voice_cloning=VoiceCloningSupport.ZERO_SHOT,
            supported_languages=list(ZONOS_LANGUAGES.keys()),
            models=[
                {
                    "id": "zonos-hybrid",
                    "name": "Zonos Hybrid",
                    "size_gb": 2.5,
                    "vram_gb": 6.0,
                    "description": "Hybrid model with best quality/speed balance"
                },
                {
                    "id": "zonos-transformer",
                    "name": "Zonos Transformer",
                    "size_gb": 3.0,
                    "vram_gb": 7.0,
                    "description": "Full transformer model for maximum quality"
                }
            ],
            default_model="zonos-hybrid",
            sample_rate=44100,
            requires_reference_text=False,
            min_reference_duration=3.0,
            max_reference_duration=30.0,
            vram_requirement_gb=6.0,
            supports_streaming=True,
            supports_emotion_tags=True,
            preset_voices=[],
            extra_params={
                "speaking_rate": {"type": "float", "default": 1.0, "min": 0.5, "max": 2.0},
                "emotion": {"type": "select", "default": "neutral",
                           "options": ["neutral", "happy", "sad", "angry", "fearful", "surprised"]},
            }
        )

    def _check_installed(self) -> bool:
        """Check if Zonos is installed"""
        try:
            import zonos
            return True
        except ImportError:
            return False

    def load(self, model: Optional[str] = None) -> None:
        """Load Zonos model"""
        if not self._check_installed():
            raise RuntimeError(
                "Zonos TTS is not available. "
                "Visit the Models page to download and install this TTS provider."
            )

        if self._model is not None:
            self._loaded = True
            return

        print(f"[Zonos] Loading model on {self.device}...")

        try:
            from zonos import Zonos

            model_id = model or "zonos-hybrid"
            model_type = "Zyphra/Zonos-v0.1-hybrid" if "hybrid" in model_id else "Zyphra/Zonos-v0.1-transformer"

            self._model = Zonos.from_pretrained(model_type, device=self.device)

            self._loaded = True
            print("[Zonos] Model loaded successfully")
        except Exception as e:
            raise RuntimeError(f"Failed to load Zonos model: {e}")

    def unload(self) -> None:
        """Unload model"""
        if self._model is not None:
            del self._model
            self._model = None
        self._loaded = False
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        print("[Zonos] Model unloaded")

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
        emotion: str = "neutral",
        speaking_rate: float = 1.0,
        **kwargs
    ) -> tuple[np.ndarray, int]:
        """Generate audio using Zonos TTS"""

        if self._model is None:
            self.load(model)

        print(f"[Zonos] Generating: lang={language}, emotion={emotion}, text_len={len(text)}")

        if seed is not None and seed > 0:
            torch.manual_seed(seed)
            if torch.cuda.is_available():
                torch.cuda.manual_seed(seed)

        try:
            # Load reference audio if provided
            speaker_embedding = None
            if voice_audio_path:
                import torchaudio
                ref_audio, ref_sr = torchaudio.load(voice_audio_path)
                if ref_sr != 44100:
                    ref_audio = torchaudio.functional.resample(ref_audio, ref_sr, 44100)
                speaker_embedding = self._model.make_speaker_embedding(ref_audio)

            # Generate audio
            audio = self._model.generate(
                text=text,
                speaker=speaker_embedding,
                language=language,
                emotion=emotion,
                speaking_rate=speaking_rate * speed,
            )

            # Convert to numpy
            if isinstance(audio, torch.Tensor):
                audio = audio.cpu().numpy()

            if audio.dtype != np.float32:
                audio = audio.astype(np.float32)

            return audio, 44100

        except Exception as e:
            raise RuntimeError(f"Zonos generation failed: {e}")
