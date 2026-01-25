"""F5-TTS Provider - High quality voice cloning with Spanish support"""

import torch
import numpy as np
from pathlib import Path
from typing import Optional
import tempfile
import os

from .base import TTSProvider, TTSProviderInfo, VoiceCloningSupport


# F5-TTS supported languages
F5_LANGUAGES = {
    "en": "English",
    "zh": "Chinese",
    "es": "Spanish",  # Via F5-Spanish model
}


class F5TTSProvider(TTSProvider):
    """Provider for F5-TTS with excellent Spanish voice cloning"""

    def __init__(self, device: Optional[str] = None):
        super().__init__(device)
        self._model = None
        self._current_model_name = None
        self._vocoder = None
        self._repo_ckpt_cache = {}

    @classmethod
    def get_info(cls) -> TTSProviderInfo:
        return TTSProviderInfo(
            id="f5-tts",
            name="F5-TTS",
            description="Best quality voice cloning. Excellent for Spanish with F5-Spanish model.",
            voice_cloning=VoiceCloningSupport.ZERO_SHOT,
            supported_languages=list(F5_LANGUAGES.keys()),
            models=[
                {"id": "F5TTS_v1_Base", "name": "F5-TTS Base", "size_gb": 2.5, "vram_gb": 6, "description": "Modelo principal multilenguaje"},
                {"id": "F5-Spanish", "name": "F5-TTS Spanish", "size_gb": 2.5, "vram_gb": 6, "description": "Optimizado para espanol"},
                {"id": "E2TTS_Base", "name": "E2-TTS Base", "size_gb": 2.0, "vram_gb": 5, "description": "Arquitectura alternativa"},
            ],
            default_model="F5TTS_v1_Base",
            sample_rate=24000,
            requires_reference_text=False,  # ASR can auto-transcribe
            min_reference_duration=1.0,
            max_reference_duration=25.0,
            vram_requirement_gb=6.0,
            supports_streaming=True,
            supports_emotion_tags=False,
            extra_params={
                "nfe_step": {"type": "int", "default": 32, "min": 4, "max": 64, "description": "Flow matching steps (higher=better quality, slower)"},
                "cfg_strength": {"type": "float", "default": 2.0, "min": 0.0, "max": 5.0},
                "sway_sampling_coef": {"type": "float", "default": -1.0, "min": -2.0, "max": 2.0},
                "speed": {"type": "float", "default": 1.0, "min": 0.5, "max": 2.0},
                "cross_fade_duration": {"type": "float", "default": 0.15, "min": 0.0, "max": 1.0},
            }
        )

    def _check_installed(self) -> bool:
        """Check if f5-tts is installed"""
        try:
            import f5_tts
            return True
        except ImportError:
            return False

    def _resolve_repo_checkpoint(self, repo_id: str) -> str:
        """Resolve a Hugging Face repo checkpoint file to a local path."""
        cached = self._repo_ckpt_cache.get(repo_id)
        if cached:
            return cached

        try:
            from huggingface_hub import snapshot_download
        except Exception as exc:
            raise RuntimeError("Hugging Face client not available. Install dependencies to use F5-TTS.") from exc

        try:
            repo_path = snapshot_download(
                repo_id=repo_id,
                allow_patterns=["*.safetensors", "*.pt"],
                local_files_only=True,
            )
        except Exception as exc:
            raise RuntimeError(
                "F5-TTS model files not found. Download the model from the Models page and try again."
            ) from exc

        candidates = list(Path(repo_path).rglob("*.safetensors")) + list(Path(repo_path).rglob("*.pt"))
        if not candidates:
            raise RuntimeError(
                "F5-TTS model files not found. Download the model from the Models page and try again."
            )

        def score(path: Path) -> tuple[int, int]:
            name = path.name.lower()
            name_score = 0
            if "model" in name:
                name_score += 2
            if "ckpt" in name or "checkpoint" in name:
                name_score += 1
            return (name_score, path.stat().st_size)

        candidates.sort(key=score, reverse=True)
        ckpt_path = str(candidates[0])
        self._repo_ckpt_cache[repo_id] = ckpt_path
        return ckpt_path

    def load(self, model: Optional[str] = None) -> None:
        """Load F5-TTS model"""
        if not self._check_installed():
            raise RuntimeError(
                "F5-TTS voice engine is not available. "
                "Visit the Models page to download and install this TTS provider."
            )

        model = model or "F5TTS_v1_Base"

        if self._current_model_name == model and self._model is not None:
            self._loaded = True
            return

        print(f"[F5-TTS] Loading {model} on {self.device}...")

        from f5_tts.api import F5TTS
        import inspect

        # Map our model IDs to (base_model, ckpt_file)
        # base_model must match config file names: F5TTS_v1_Base, E2TTS_Base, etc.
        model_configs = {
            "F5TTS_v1_Base": ("F5TTS_v1_Base", ""),  # Default F5-TTS model
            "F5-Spanish": ("F5TTS_v1_Base", "jpgallegoar/F5-Spanish"),  # Spanish fine-tune
            "E2TTS_Base": ("E2TTS_Base", ""),  # E2-TTS model
        }

        base_model, ckpt_file = model_configs.get(model, ("F5TTS_v1_Base", ""))
        if ckpt_file and "/" in ckpt_file:
            ckpt_file = self._resolve_repo_checkpoint(ckpt_file)

        # Check F5TTS API signature (it changed between versions)
        init_sig = inspect.signature(F5TTS.__init__)
        init_params = list(init_sig.parameters.keys())

        if "model_type" in init_params:
            # Old API - uses model_type like "F5-TTS"
            old_model_type = "E2-TTS" if "E2" in model else "F5-TTS"
            self._model = F5TTS(
                model_type=old_model_type,
                ckpt_file=ckpt_file if ckpt_file else None,
                device=self.device,
            )
        elif "model" in init_params:
            # Current API - model must match config file name (F5TTS_v1_Base, etc.)
            self._model = F5TTS(
                model=base_model,
                ckpt_file=ckpt_file if ckpt_file else "",
                device=self.device,
            )
        else:
            # Fallback - use defaults
            self._model = F5TTS(device=self.device)

        self._current_model_name = model
        self._loaded = True
        print(f"[F5-TTS] {model} loaded successfully")

    def unload(self) -> None:
        """Unload model"""
        if self._model is not None:
            del self._model
            self._model = None
        self._current_model_name = None
        self._loaded = False
        torch.cuda.empty_cache() if torch.cuda.is_available() else None
        print("[F5-TTS] Model unloaded")

    def generate(
        self,
        text: str,
        voice_id: Optional[str] = None,
        voice_audio_path: Optional[str] = None,
        voice_audio_text: Optional[str] = None,
        language: str = "en",
        speed: float = 1.0,
        model: Optional[str] = None,
        nfe_step: int = 32,
        cfg_strength: float = 2.0,
        sway_sampling_coef: float = -1.0,
        cross_fade_duration: float = 0.15,
        seed: Optional[int] = None,
        **kwargs
    ) -> tuple[np.ndarray, int]:
        """Generate audio using F5-TTS"""

        # Select model based on language
        if model is None:
            if language == "es":
                model = "F5-Spanish"
            else:
                model = "F5TTS_v1_Base"

        # Ensure model is loaded
        if self._current_model_name != model or self._model is None:
            self.load(model)

        # Validate reference audio
        if not voice_audio_path:
            raise ValueError("F5-TTS requires reference audio for voice cloning")

        if not Path(voice_audio_path).exists():
            raise ValueError(f"Reference audio not found: {voice_audio_path}")

        # Set seed
        if seed is not None and seed > 0:
            torch.manual_seed(seed)

        print(f"[F5-TTS] Generating with ref={voice_audio_path}, text_len={len(text)}")

        # Generate using F5-TTS API
        # If no reference text provided, F5-TTS will use ASR to transcribe
        wav, sr, _ = self._model.infer(
            ref_file=voice_audio_path,
            ref_text=voice_audio_text or "",  # Empty = auto ASR
            gen_text=text,
            nfe_step=nfe_step,
            cfg_strength=cfg_strength,
            sway_sampling_coef=sway_sampling_coef,
            speed=speed,
            cross_fade_duration=cross_fade_duration,
            seed=seed if seed and seed > 0 else -1,
        )

        # Ensure numpy array
        if isinstance(wav, torch.Tensor):
            wav = wav.squeeze().cpu().numpy()

        return wav, sr

    def generate_with_multiple_voices(
        self,
        text: str,
        voices: dict,  # {"voice_name": {"audio": path, "text": optional}}
        main_voice: str,
        **kwargs
    ) -> tuple[np.ndarray, int]:
        """
        Generate with multiple voices (for dialogue/audiobooks).

        Text can include voice markers like: {voice_name}Text spoken by this voice.
        """
        if not self._check_installed():
            raise RuntimeError("F5-TTS not installed")

        # This would use F5-TTS's multi-voice TOML configuration
        # For now, just use single voice
        main_voice_info = voices.get(main_voice, {})
        return self.generate(
            text=text,
            voice_audio_path=main_voice_info.get("audio"),
            voice_audio_text=main_voice_info.get("text"),
            **kwargs
        )
