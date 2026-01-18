"""TTS Service - Wrapper for Chatterbox models"""
import torch
import torchaudio
import numpy as np
from pathlib import Path
from typing import Optional, Literal
import sys

# Add src directory to path to import whisperall
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "src"))

from whisperall.tts import ChatterboxTTS
from whisperall.tts_turbo import ChatterboxTurboTTS
from whisperall.mtl_tts import ChatterboxMultilingualTTS, SUPPORTED_LANGUAGES

ModelType = Literal["original", "turbo", "multilingual"]

class TTSService:
    """Unified TTS service supporting all Chatterbox models"""

    SAMPLE_RATE = 24000

    def __init__(self, device: Optional[str] = None):
        if device is None:
            if torch.cuda.is_available():
                device = "cuda"
            elif torch.backends.mps.is_available():
                device = "mps"
            else:
                device = "cpu"

        self.device = device
        self._models: dict = {}
        self._current_model: Optional[str] = None
        print(f"TTSService initialized on device: {device}")

    def _load_model(self, model_type: ModelType):
        """Load a model if not already loaded"""
        if model_type in self._models:
            return self._models[model_type]

        print(f"Loading {model_type} model...")

        if model_type == "original":
            model = ChatterboxTTS.from_pretrained(device=self.device)
        elif model_type == "turbo":
            model = ChatterboxTurboTTS.from_pretrained(device=self.device)
        elif model_type == "multilingual":
            model = ChatterboxMultilingualTTS.from_pretrained(device=self.device)
        else:
            raise ValueError(f"Unknown model type: {model_type}")

        self._models[model_type] = model
        print(f"{model_type} model loaded successfully")
        return model

    def unload_model(self, model_type: ModelType):
        """Unload a model to free VRAM"""
        if model_type in self._models:
            del self._models[model_type]
            torch.cuda.empty_cache()
            print(f"{model_type} model unloaded")

    def get_supported_languages(self) -> dict[str, str]:
        """Get supported languages for multilingual model"""
        return dict(SUPPORTED_LANGUAGES)

    def generate(
        self,
        text: str,
        model_type: ModelType = "multilingual",
        language_id: str = "en",
        audio_prompt_path: Optional[str] = None,
        temperature: float = 0.8,
        exaggeration: float = 0.5,
        cfg_weight: float = 0.5,
        top_p: float = 0.95,
        top_k: int = 1000,
        repetition_penalty: float = 1.2,
        seed: Optional[int] = None,
    ) -> tuple[np.ndarray, int]:
        """
        Generate audio from text

        Returns:
            tuple of (audio_array, sample_rate)
        """
        model = self._load_model(model_type)

        # Set seed for reproducibility
        if seed is not None and seed > 0:
            torch.manual_seed(seed)
            if self.device == "cuda":
                torch.cuda.manual_seed(seed)

        # Build generation kwargs based on model type
        kwargs = {"audio_prompt_path": audio_prompt_path} if audio_prompt_path else {}

        if model_type == "turbo":
            # Turbo has different parameters
            kwargs.update({
                "temperature": temperature,
                "top_p": top_p,
                "top_k": top_k,
                "repetition_penalty": repetition_penalty,
            })
            wav = model.generate(text, **kwargs)

        elif model_type == "multilingual":
            kwargs.update({
                "language_id": language_id,
                "temperature": temperature,
                "exaggeration": exaggeration,
                "cfg_weight": cfg_weight,
            })
            wav = model.generate(text, **kwargs)

        else:  # original
            kwargs.update({
                "temperature": temperature,
                "exaggeration": exaggeration,
                "cfg_weight": cfg_weight,
            })
            wav = model.generate(text, **kwargs)

        # Convert to numpy
        if isinstance(wav, torch.Tensor):
            wav = wav.squeeze().cpu().numpy()

        return wav, self.SAMPLE_RATE

    def save_audio(
        self,
        audio: np.ndarray,
        output_path: str,
        sample_rate: int = 24000,
        format: str = "wav"
    ) -> str:
        """Save audio to file"""
        output_path = Path(output_path)

        # Ensure correct extension
        if not output_path.suffix:
            output_path = output_path.with_suffix(f".{format}")

        # Convert to tensor for torchaudio
        if isinstance(audio, np.ndarray):
            audio_tensor = torch.from_numpy(audio).unsqueeze(0)
        else:
            audio_tensor = audio.unsqueeze(0) if audio.dim() == 1 else audio

        torchaudio.save(str(output_path), audio_tensor, sample_rate)
        return str(output_path)


# Singleton instance
_service: Optional[TTSService] = None

def get_tts_service() -> TTSService:
    """Get or create the TTS service singleton"""
    global _service
    if _service is None:
        _service = TTSService()
    return _service


