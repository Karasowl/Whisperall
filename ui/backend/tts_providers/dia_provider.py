"""Dia TTS Provider - Dialogue TTS with emotions from Nari Labs"""

import torch
import numpy as np
from pathlib import Path
from typing import Optional, List

from .base import TTSProvider, TTSProviderInfo, VoiceCloningSupport, VoiceInfo


# Dia supported languages (English only for now)
DIA_LANGUAGES = {
    "en": "English",
}

# Dia preset voices (S1, S2 for dialogue)
DIA_PRESET_VOICES = [
    VoiceInfo(id="S1", name="Speaker 1", language="en", gender="neutral",
              description="First speaker in dialogue"),
    VoiceInfo(id="S2", name="Speaker 2", language="en", gender="neutral",
              description="Second speaker in dialogue"),
]


class DiaProvider(TTSProvider):
    """Provider for Dia TTS - Dialogue TTS with emotions from Nari Labs"""

    def __init__(self, device: Optional[str] = None):
        super().__init__(device)
        self._model = None

    @classmethod
    def get_info(cls) -> TTSProviderInfo:
        return TTSProviderInfo(
            id="dia",
            name="Dia 1.6B",
            description="Dialogue TTS from Nari Labs. Excellent for conversations with [S1]/[S2] tags and emotions. ~8GB VRAM. English only.",
            voice_cloning=VoiceCloningSupport.ZERO_SHOT,
            supported_languages=list(DIA_LANGUAGES.keys()),
            models=[
                {
                    "id": "dia-1.6b",
                    "name": "Dia 1.6B",
                    "size_gb": 3.5,
                    "vram_gb": 8.0,
                    "description": "Full model with dialogue and emotion support"
                }
            ],
            default_model="dia-1.6b",
            sample_rate=44100,
            requires_reference_text=False,
            min_reference_duration=3.0,
            max_reference_duration=30.0,
            vram_requirement_gb=8.0,
            supports_streaming=False,
            supports_emotion_tags=True,
            preset_voices=DIA_PRESET_VOICES,
            extra_params={
                "cfg_scale": {"type": "float", "default": 3.0, "min": 1.0, "max": 5.0},
                "temperature": {"type": "float", "default": 1.3, "min": 0.5, "max": 2.0},
                "speed": {"type": "float", "default": 1.0, "min": 0.5, "max": 2.0},
            }
        )

    def _check_installed(self) -> bool:
        """Check if Dia is installed"""
        try:
            from dia.model import Dia
            return True
        except ImportError:
            return False

    def load(self, model: Optional[str] = None) -> None:
        """Load Dia model"""
        if not self._check_installed():
            raise RuntimeError(
                "Dia TTS is not available. "
                "Visit the Models page to download and install this TTS provider. "
                "Note: Dia requires ~8GB VRAM."
            )

        if self._model is not None:
            self._loaded = True
            return

        print(f"[Dia] Loading model on {self.device}...")

        try:
            from dia.model import Dia

            self._model = Dia.from_pretrained("nari-labs/Dia-1.6B", device=self.device)

            self._loaded = True
            print("[Dia] Model loaded successfully")
        except Exception as e:
            raise RuntimeError(f"Failed to load Dia model: {e}")

    def unload(self) -> None:
        """Unload model"""
        if self._model is not None:
            del self._model
            self._model = None
        self._loaded = False
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        print("[Dia] Model unloaded")

    def _format_dialogue_text(self, text: str) -> str:
        """Format text with dialogue tags if not present"""
        # If text already has [S1] or [S2] tags, return as is
        if "[S1]" in text or "[S2]" in text:
            return text
        # Otherwise, wrap in [S1] tag
        return f"[S1] {text}"

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
        cfg_scale: float = 3.0,
        temperature: float = 1.3,
        **kwargs
    ) -> tuple[np.ndarray, int]:
        """Generate audio using Dia TTS"""

        if self._model is None:
            self.load(model)

        # Format text for dialogue
        formatted_text = self._format_dialogue_text(text)
        print(f"[Dia] Generating: text_len={len(text)}, cfg={cfg_scale}, temp={temperature}")

        if seed is not None and seed > 0:
            torch.manual_seed(seed)
            if torch.cuda.is_available():
                torch.cuda.manual_seed(seed)

        try:
            # Load reference audio if provided
            audio_prompt = None
            if voice_audio_path:
                import torchaudio
                audio_prompt, sr = torchaudio.load(voice_audio_path)
                if sr != 44100:
                    audio_prompt = torchaudio.functional.resample(audio_prompt, sr, 44100)

            # Generate audio
            audio = self._model.generate(
                text=formatted_text,
                audio_prompt=audio_prompt,
                cfg_scale=cfg_scale,
                temperature=temperature,
                speed=speed,
            )

            # Convert to numpy
            if isinstance(audio, torch.Tensor):
                audio = audio.cpu().numpy()

            if audio.dtype != np.float32:
                audio = audio.astype(np.float32)

            return audio, 44100

        except Exception as e:
            raise RuntimeError(f"Dia generation failed: {e}")
