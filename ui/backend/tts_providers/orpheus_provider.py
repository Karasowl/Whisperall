"""Orpheus TTS Provider - Human-like speech with emotion control"""

import torch
import numpy as np
from pathlib import Path
from typing import Optional, List
import tempfile
import os

from .base import TTSProvider, TTSProviderInfo, VoiceCloningSupport


# Orpheus supported languages
ORPHEUS_LANGUAGES = {
    "en": "English",
    "es": "Spanish",
    "zh": "Chinese",
    "hi": "Hindi",
    "ko": "Korean",
    "fr": "French",
    "de": "German",
}

# Emotion/paralinguistic tags supported by Orpheus
ORPHEUS_EMOTION_TAGS = [
    "<laugh>",
    "<chuckle>",
    "<sigh>",
    "<cough>",
    "<sniffle>",
    "<groan>",
    "<yawn>",
    "<gasp>",
]


class OrpheusProvider(TTSProvider):
    """Provider for Orpheus TTS with human-like speech and emotion control"""

    def __init__(self, device: Optional[str] = None):
        super().__init__(device)
        self._model = None
        self._current_model_name = None

    @classmethod
    def get_info(cls) -> TTSProviderInfo:
        return TTSProviderInfo(
            id="orpheus",
            name="Orpheus TTS",
            description="Human-like speech with natural emotion. Supports Spanish and emotion tags.",
            voice_cloning=VoiceCloningSupport.ZERO_SHOT,
            supported_languages=list(ORPHEUS_LANGUAGES.keys()),
            models=[
                {"id": "orpheus-3b", "name": "Orpheus 3B", "size_gb": 6.0, "vram_gb": 12, "description": "Máxima calidad, multilenguaje, requiere GPU potente"},
            ],
            default_model="orpheus-3b",
            sample_rate=24000,
            requires_reference_text=True,  # Reference needs transcription
            min_reference_duration=5.0,
            max_reference_duration=30.0,
            vram_requirement_gb=12.0,  # 3B model needs significant VRAM
            supports_streaming=True,
            supports_emotion_tags=True,
            extra_params={
                "temperature": {"type": "float", "default": 0.6, "min": 0.1, "max": 1.5},
                "top_p": {"type": "float", "default": 0.95, "min": 0.1, "max": 1.0},
                "repetition_penalty": {"type": "float", "default": 1.1, "min": 1.0, "max": 2.0},
                "max_tokens": {"type": "int", "default": 4096, "min": 256, "max": 8192},
            }
        )

    @classmethod
    def get_emotion_tags(cls) -> List[str]:
        """Get available emotion tags"""
        return ORPHEUS_EMOTION_TAGS.copy()

    def _check_installed(self) -> bool:
        """Check if orpheus-speech is installed"""
        try:
            import orpheus_tts
            return True
        except ImportError:
            return False

    def load(self, model: Optional[str] = None) -> None:
        """Load Orpheus model"""
        if not self._check_installed():
            raise RuntimeError(
                "Orpheus TTS voice engine is not available. "
                "Visit the Models page to download and install this TTS provider."
            )

        model = model or "orpheus-3b"

        if self._current_model_name == model and self._model is not None:
            self._loaded = True
            return

        print(f"[Orpheus] Loading {model} on {self.device}...")

        from orpheus_tts import OrpheusModel

        # Map model names to HuggingFace paths
        model_map = {
            "orpheus-3b": "canopylabs/orpheus-3b-0.1-ft",
        }

        hf_path = model_map.get(model, model)

        # Adjust max_model_len based on available VRAM
        if torch.cuda.is_available():
            vram_gb = torch.cuda.get_device_properties(0).total_memory / (1024**3)
            max_len = 4096 if vram_gb >= 16 else 2048
        else:
            max_len = 2048

        self._model = OrpheusModel(
            model_name=hf_path,
            max_model_len=max_len,
        )

        self._current_model_name = model
        self._loaded = True
        print(f"[Orpheus] {model} loaded successfully")

    def unload(self) -> None:
        """Unload model"""
        if self._model is not None:
            del self._model
            self._model = None
        self._current_model_name = None
        self._loaded = False
        torch.cuda.empty_cache() if torch.cuda.is_available() else None
        print("[Orpheus] Model unloaded")

    def _load_reference_audio(self, audio_path: str) -> bytes:
        """Load reference audio as bytes for prompt"""
        import wave
        import io

        # Convert to WAV if needed
        from audio_utils import convert_format

        wav_path = audio_path
        if not audio_path.lower().endswith('.wav'):
            temp_wav = tempfile.NamedTemporaryFile(suffix='.wav', delete=False)
            wav_path = temp_wav.name
            convert_format(audio_path, wav_path, "wav")

        with open(wav_path, 'rb') as f:
            audio_bytes = f.read()

        # Cleanup temp file if created
        if wav_path != audio_path:
            os.unlink(wav_path)

        return audio_bytes

    def generate(
        self,
        text: str,
        voice_id: Optional[str] = None,
        voice_audio_path: Optional[str] = None,
        voice_audio_text: Optional[str] = None,
        language: str = "en",
        speed: float = 1.0,
        model: Optional[str] = None,
        temperature: float = 0.6,
        top_p: float = 0.95,
        repetition_penalty: float = 1.1,
        max_tokens: int = 4096,
        seed: Optional[int] = None,
        **kwargs
    ) -> tuple[np.ndarray, int]:
        """Generate audio using Orpheus TTS"""

        # Select model based on language if not specified
        model = model or self._current_model_name or "orpheus-3b"

        # Ensure model is loaded
        if self._current_model_name != model or self._model is None:
            self.load(model)

        # Set seed
        if seed is not None and seed > 0:
            torch.manual_seed(seed)

        print(f"[Orpheus] Generating text_len={len(text)}, voice_clone={voice_audio_path is not None}")

        # Build prompt with optional voice reference
        if voice_audio_path and voice_audio_text:
            # Zero-shot voice cloning: include reference in prompt
            # Orpheus uses text-speech pairs in prompt for conditioning
            prompt_parts = [
                {"text": voice_audio_text, "audio": voice_audio_path},
            ]

            # Generate with voice conditioning
            audio_chunks = self._model.generate_speech(
                prompt=prompt_parts,
                text=text,
                temperature=temperature,
                top_p=top_p,
                repetition_penalty=repetition_penalty,
                max_tokens=max_tokens,
            )
        else:
            # Generate without voice cloning (uses default voice)
            audio_chunks = self._model.generate_speech(
                text=text,
                temperature=temperature,
                top_p=top_p,
                repetition_penalty=repetition_penalty,
                max_tokens=max_tokens,
            )

        # Combine audio chunks
        wav = np.concatenate(list(audio_chunks))

        # Ensure correct format
        if wav.dtype != np.float32:
            wav = wav.astype(np.float32)

        # Normalize
        if np.abs(wav).max() > 1.0:
            wav = wav / np.abs(wav).max()

        return wav, 24000

    def generate_with_emotions(
        self,
        text: str,
        emotions: dict,  # {"position": "tag"} e.g., {10: "<laugh>"}
        **kwargs
    ) -> tuple[np.ndarray, int]:
        """
        Generate text with emotion tags inserted at specific positions.

        Args:
            text: Base text
            emotions: Dict mapping character positions to emotion tags
        """
        # Insert emotion tags into text
        result = []
        last_pos = 0
        for pos in sorted(emotions.keys()):
            result.append(text[last_pos:pos])
            result.append(emotions[pos])
            last_pos = pos
        result.append(text[last_pos:])

        text_with_emotions = "".join(result)

        return self.generate(text=text_with_emotions, **kwargs)
