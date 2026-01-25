"""Chatterbox TTS Provider - Original, Turbo, and Multilingual models"""

import torch
import numpy as np
from pathlib import Path
from typing import Optional, Literal
import sys

from .base import TTSProvider, TTSProviderInfo, VoiceCloningSupport, VoiceInfo

# Add src directory to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent / "src"))


# Language codes supported by multilingual model
CHATTERBOX_LANGUAGES = {
    "en": "English",
    "es": "Spanish",
    "fr": "French",
    "de": "German",
    "it": "Italian",
    "pt": "Portuguese",
    "pl": "Polish",
    "nl": "Dutch",
    "sv": "Swedish",
    "da": "Danish",
    "fi": "Finnish",
    "no": "Norwegian",
    "ar": "Arabic",
    "he": "Hebrew",
    "hi": "Hindi",
    "ja": "Japanese",
    "ko": "Korean",
    "zh": "Chinese",
    "ru": "Russian",
    "tr": "Turkish",
    "el": "Greek",
    "ms": "Malay",
    "sw": "Swahili",
}


class ChatterboxProvider(TTSProvider):
    """Provider for Chatterbox TTS models (Original, Turbo, Multilingual)"""

    def __init__(self, device: Optional[str] = None):
        super().__init__(device)
        self._models = {}
        self._current_model = None

    @classmethod
    def get_info(cls) -> TTSProviderInfo:
        return TTSProviderInfo(
            id="chatterbox",
            name="Chatterbox",
            description="High-quality voice cloning with emotion control. Good for English, limited Spanish quality.",
            voice_cloning=VoiceCloningSupport.ZERO_SHOT,
            supported_languages=list(CHATTERBOX_LANGUAGES.keys()),
            models=[
                {"id": "multilingual", "name": "Multilingual (500M)", "size_gb": 2.0, "vram_gb": 4, "description": "23 idiomas, calidad media español"},
                {"id": "original", "name": "Original (500M)", "size_gb": 2.0, "vram_gb": 4, "description": "Solo inglés, máxima calidad"},
                {"id": "turbo", "name": "Turbo (350M)", "size_gb": 1.5, "vram_gb": 3, "description": "Rápido, tags emocionales"},
            ],
            default_model="multilingual",
            provider_type="local",
            sample_rate=24000,
            requires_reference_text=False,
            min_reference_duration=5.0,
            max_reference_duration=15.0,
            vram_requirement_gb=4.0,
            supports_streaming=False,
            supports_emotion_tags=True,  # Turbo supports paralinguistic tags
            supports_fast_mode=True,  # CFG can be disabled for ~50% faster generation
            extra_params={
                "temperature": {"type": "float", "default": 0.8, "min": 0.1, "max": 1.5},
                "exaggeration": {"type": "float", "default": 0.5, "min": 0.0, "max": 1.0},
                "cfg_weight": {"type": "float", "default": 0.5, "min": 0.0, "max": 1.0},
            }
        )

    def load(self, model: Optional[str] = None) -> None:
        """Load a Chatterbox model"""
        model = model or "multilingual"

        if model in self._models:
            self._current_model = model
            self._loaded = True
            return

        print(f"[Chatterbox] Loading {model} model on {self.device}...")

        if model == "original":
            from whisperall.tts import ChatterboxTTS
            self._models[model] = ChatterboxTTS.from_pretrained(device=self.device)
        elif model == "turbo":
            from whisperall.tts_turbo import ChatterboxTurboTTS
            self._models[model] = ChatterboxTurboTTS.from_pretrained(device=self.device)
        elif model == "multilingual":
            from whisperall.mtl_tts import ChatterboxMultilingualTTS
            self._models[model] = ChatterboxMultilingualTTS.from_pretrained(device=self.device)
        else:
            raise ValueError(f"Unknown Chatterbox model: {model}")

        self._current_model = model
        self._loaded = True
        print(f"[Chatterbox] {model} model loaded successfully")

    def unload(self) -> None:
        """Unload all models"""
        for model in list(self._models.keys()):
            del self._models[model]
        self._models = {}
        self._current_model = None
        self._loaded = False
        torch.cuda.empty_cache() if torch.cuda.is_available() else None
        print("[Chatterbox] Models unloaded")

    def generate(
        self,
        text: str,
        voice_id: Optional[str] = None,
        voice_audio_path: Optional[str] = None,
        voice_audio_text: Optional[str] = None,
        language: str = "en",
        speed: float = 1.0,
        model: Optional[str] = None,
        temperature: float = 0.8,
        exaggeration: float = 0.5,
        cfg_weight: float = 0.5,
        top_p: float = 0.95,
        top_k: int = 1000,
        repetition_penalty: float = 1.2,
        seed: Optional[int] = None,
        **kwargs
    ) -> tuple[np.ndarray, int]:
        """Generate audio using Chatterbox"""

        model = model or self._current_model or "multilingual"

        # Ensure model is loaded
        if model not in self._models:
            self.load(model)

        tts_model = self._models[model]

        # Set seed
        if seed is not None and seed > 0:
            torch.manual_seed(seed)
            if self.device == "cuda":
                torch.cuda.manual_seed(seed)

        # Build kwargs
        gen_kwargs = {}
        if voice_audio_path:
            gen_kwargs["audio_prompt_path"] = voice_audio_path

        if model == "turbo":
            gen_kwargs.update({
                "temperature": temperature,
                "top_p": top_p,
                "top_k": top_k,
                "repetition_penalty": repetition_penalty,
            })
        elif model == "multilingual":
            gen_kwargs.update({
                "language_id": language,
                "temperature": temperature,
                "exaggeration": exaggeration,
                "cfg_weight": cfg_weight,
            })
        else:  # original
            gen_kwargs.update({
                "temperature": temperature,
                "exaggeration": exaggeration,
                "cfg_weight": cfg_weight,
            })

        # Generate
        wav = tts_model.generate(text, **gen_kwargs)

        # Convert to numpy
        if isinstance(wav, torch.Tensor):
            wav = wav.squeeze().cpu().numpy()

        return wav, 24000
