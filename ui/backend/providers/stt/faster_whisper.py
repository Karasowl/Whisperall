"""Faster-Whisper STT Provider - Local transcription"""

from pathlib import Path
from typing import Optional, Dict, Any, Tuple

from .base import STTProvider, STTProviderInfo
from ..base import ProviderType, ModelVariant


# Model variants with their sizes
FASTER_WHISPER_MODELS = [
    ModelVariant(id="faster-whisper-tiny", name="Tiny", size_gb=0.04, vram_gb=1, description="Very fast, basic accuracy"),
    ModelVariant(id="faster-whisper-base", name="Base", size_gb=0.07, vram_gb=1, description="Fast, good for quick transcription"),
    ModelVariant(id="faster-whisper-small", name="Small", size_gb=0.24, vram_gb=2, description="Balanced speed and accuracy"),
    ModelVariant(id="faster-whisper-medium", name="Medium", size_gb=0.77, vram_gb=4, description="High accuracy, slower"),
    ModelVariant(id="faster-whisper-large-v3", name="Large V3", size_gb=1.55, vram_gb=6, description="Best accuracy"),
    ModelVariant(id="faster-distil-whisper-large-v3", name="Distil Large V3", size_gb=0.76, vram_gb=4, description="Near-large accuracy, faster"),
]


class FasterWhisperProvider(STTProvider):
    """Local STT using Faster-Whisper"""

    def __init__(self, device: Optional[str] = None):
        super().__init__(device)
        self._models = {}

    @classmethod
    def get_info(cls) -> STTProviderInfo:
        return STTProviderInfo(
            id="faster-whisper",
            name="Faster-Whisper",
            description="High-performance local transcription. No internet required.",
            type=ProviderType.LOCAL,
            requires_model_download="faster-whisper-base",  # Default model
            supported_languages=["multilingual"],
            models=FASTER_WHISPER_MODELS,
            default_model="faster-whisper-base",
            supports_vad=True,
            supports_timestamps=True,
            supports_diarization=False,
            docs_url="https://github.com/SYSTRAN/faster-whisper",
        )

    def _compute_type(self) -> str:
        return "float16" if self.device == "cuda" else "int8"

    def _load_model(self, model_name: str):
        if model_name in self._models:
            return self._models[model_name]

        try:
            from faster_whisper import WhisperModel
        except ImportError as exc:
            raise RuntimeError(
                "Speech recognition engine is not available. "
                "Visit the Models page to install the required components."
            ) from exc

        model = WhisperModel(model_name, device=self.device, compute_type=self._compute_type())
        self._models[model_name] = model
        self._loaded = True
        return model

    def transcribe(
        self,
        audio_path: Path,
        language: str = "auto",
        prompt: Optional[str] = None,
        model: Optional[str] = None,
        **kwargs
    ) -> Tuple[str, Dict[str, Any]]:
        model_name = model or "base"

        # Map old model IDs to new format
        if model_name.startswith("faster-whisper-"):
            model_name = model_name.replace("faster-whisper-", "")
        if model_name == "faster-distil-whisper-large-v3":
            model_name = "distil-large-v3"

        whisper_model = self._load_model(model_name)

        lang = None if language == "auto" else language
        segments, info = whisper_model.transcribe(
            str(audio_path),
            language=lang,
            vad_filter=True,
            initial_prompt=prompt or None
        )
        text = " ".join(seg.text.strip() for seg in segments if seg.text)

        return text.strip(), {
            "language": info.language,
            "duration": info.duration,
            "model": model_name,
            "provider": "faster-whisper"
        }
