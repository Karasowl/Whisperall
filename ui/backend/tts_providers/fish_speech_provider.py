"""Fish-Speech TTS Provider - High-quality multilingual TTS with voice cloning"""

import torch
import numpy as np
from pathlib import Path
from typing import Optional, List

from .base import TTSProvider, TTSProviderInfo, VoiceCloningSupport, VoiceInfo


# Fish-Speech supported languages
FISH_SPEECH_LANGUAGES = {
    "en": "English",
    "es": "Spanish",
    "fr": "French",
    "de": "German",
    "zh": "Chinese",
    "ja": "Japanese",
    "ko": "Korean",
    "ar": "Arabic",
    "pt": "Portuguese",
    "it": "Italian",
    "ru": "Russian",
    "pl": "Polish",
}


class FishSpeechProvider(TTSProvider):
    """Provider for Fish-Speech TTS - multilingual with voice cloning"""

    def __init__(self, device: Optional[str] = None):
        super().__init__(device)
        self._model = None
        self._tokenizer = None

    @classmethod
    def get_info(cls) -> TTSProviderInfo:
        return TTSProviderInfo(
            id="fish-speech",
            name="Fish-Speech",
            description="High-quality multilingual TTS with zero-shot voice cloning. Supports 12+ languages including excellent Spanish.",
            voice_cloning=VoiceCloningSupport.ZERO_SHOT,
            supported_languages=list(FISH_SPEECH_LANGUAGES.keys()),
            models=[
                {
                    "id": "fish-speech-1.4",
                    "name": "Fish-Speech 1.4",
                    "size_gb": 1.5,
                    "vram_gb": 4.0,
                    "description": "Latest stable version with improved quality"
                },
                {
                    "id": "fish-speech-1.5",
                    "name": "Fish-Speech 1.5 (Preview)",
                    "size_gb": 1.8,
                    "vram_gb": 4.5,
                    "description": "Preview version with experimental features"
                }
            ],
            default_model="fish-speech-1.4",
            sample_rate=44100,
            requires_reference_text=False,  # Fish-Speech doesn't require transcription
            min_reference_duration=3.0,
            max_reference_duration=30.0,
            vram_requirement_gb=4.0,
            supports_streaming=True,
            supports_emotion_tags=False,
            preset_voices=[],  # Fish-Speech is primarily voice cloning
            extra_params={
                "temperature": {"type": "float", "default": 0.7, "min": 0.1, "max": 1.5},
                "top_p": {"type": "float", "default": 0.8, "min": 0.1, "max": 1.0},
                "repetition_penalty": {"type": "float", "default": 1.2, "min": 1.0, "max": 2.0},
            }
        )

    def _check_installed(self) -> bool:
        """Check if fish-speech is installed"""
        try:
            import fish_speech
            return True
        except ImportError:
            return False

    def load(self, model: Optional[str] = None) -> None:
        """Load Fish-Speech model"""
        if not self._check_installed():
            raise RuntimeError(
                "Fish-Speech TTS is not available. "
                "Visit the Models page to download and install this TTS provider."
            )

        if self._model is not None:
            self._loaded = True
            return

        print(f"[Fish-Speech] Loading model on {self.device}...")

        try:
            from fish_speech.models import load_model
            from fish_speech.tokenizer import FishTokenizer

            model_id = model or "fish-speech-1.4"

            # Load model and tokenizer
            self._model = load_model(model_id, device=self.device)
            self._tokenizer = FishTokenizer()

            self._loaded = True
            print("[Fish-Speech] Model loaded successfully")
        except Exception as e:
            raise RuntimeError(f"Failed to load Fish-Speech model: {e}")

    def unload(self) -> None:
        """Unload model"""
        if self._model is not None:
            del self._model
            self._model = None
        if self._tokenizer is not None:
            del self._tokenizer
            self._tokenizer = None
        self._loaded = False
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        print("[Fish-Speech] Model unloaded")

    def _extract_voice_embedding(self, audio_path: str) -> np.ndarray:
        """Extract voice embedding from reference audio"""
        try:
            from fish_speech.utils import extract_speaker_embedding
            import librosa

            # Load and preprocess audio
            audio, sr = librosa.load(audio_path, sr=44100)

            # Extract embedding
            embedding = extract_speaker_embedding(audio, sr, self._model)
            return embedding
        except Exception as e:
            raise RuntimeError(f"Failed to extract voice embedding: {e}")

    def generate(
        self,
        text: str,
        voice_id: Optional[str] = None,
        voice_audio_path: Optional[str] = None,
        voice_audio_text: Optional[str] = None,  # Not required for Fish-Speech
        language: str = "en",
        speed: float = 1.0,
        model: Optional[str] = None,
        seed: Optional[int] = None,
        temperature: float = 0.7,
        top_p: float = 0.8,
        repetition_penalty: float = 1.2,
        **kwargs
    ) -> tuple[np.ndarray, int]:
        """Generate audio using Fish-Speech TTS"""

        # Ensure model is loaded
        if self._model is None:
            self.load(model)

        print(f"[Fish-Speech] Generating: lang={language}, text_len={len(text)}")

        # Set seed for reproducibility
        if seed is not None and seed > 0:
            torch.manual_seed(seed)
            if torch.cuda.is_available():
                torch.cuda.manual_seed(seed)

        try:
            from fish_speech.inference import generate_speech

            # Prepare generation parameters
            gen_params = {
                "text": text,
                "language": language,
                "temperature": temperature,
                "top_p": top_p,
                "repetition_penalty": repetition_penalty,
                "speed": speed,
            }

            # Handle voice cloning
            if voice_audio_path:
                print(f"[Fish-Speech] Using voice reference: {voice_audio_path}")
                embedding = self._extract_voice_embedding(voice_audio_path)
                gen_params["speaker_embedding"] = embedding

            # Generate audio
            audio = generate_speech(
                self._model,
                self._tokenizer,
                **gen_params
            )

            # Ensure correct format
            if isinstance(audio, torch.Tensor):
                audio = audio.cpu().numpy()

            if audio.dtype != np.float32:
                audio = audio.astype(np.float32)

            # Normalize if needed
            if audio.max() > 1.0 or audio.min() < -1.0:
                audio = audio / max(abs(audio.max()), abs(audio.min()))

            return audio, 44100

        except ImportError:
            # Fallback: Try using fish_speech CLI approach
            return self._generate_cli_fallback(
                text, voice_audio_path, language, speed, temperature, top_p
            )

    def _generate_cli_fallback(
        self,
        text: str,
        voice_audio_path: Optional[str],
        language: str,
        speed: float,
        temperature: float,
        top_p: float
    ) -> tuple[np.ndarray, int]:
        """Fallback generation using CLI-style approach"""
        import subprocess
        import tempfile
        import soundfile as sf

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            output_path = f.name

        try:
            cmd = [
                "python", "-m", "fish_speech.tools.inference",
                "--text", text,
                "--output", output_path,
                "--language", language,
                "--temperature", str(temperature),
                "--top_p", str(top_p),
            ]

            if voice_audio_path:
                cmd.extend(["--reference", voice_audio_path])

            subprocess.run(cmd, check=True, capture_output=True)

            # Load generated audio
            audio, sr = sf.read(output_path)

            if audio.dtype != np.float32:
                audio = audio.astype(np.float32)

            return audio, sr

        finally:
            Path(output_path).unlink(missing_ok=True)
