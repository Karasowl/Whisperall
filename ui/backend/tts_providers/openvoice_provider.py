"""OpenVoice V2 Provider - Multilingual voice cloning TTS from MyShell/MIT"""

import torch
import numpy as np
from pathlib import Path
from typing import Optional, List

from .base import TTSProvider, TTSProviderInfo, VoiceCloningSupport, VoiceInfo


# OpenVoice supported languages
OPENVOICE_LANGUAGES = {
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

# OpenVoice V2 preset base speakers
OPENVOICE_PRESET_VOICES = [
    VoiceInfo(id="en_default", name="English Default", language="en", gender="neutral",
              description="Default English base voice"),
    VoiceInfo(id="en_au", name="English (Australian)", language="en", gender="neutral",
              description="Australian English accent"),
    VoiceInfo(id="en_br", name="English (British)", language="en", gender="neutral",
              description="British English accent"),
    VoiceInfo(id="en_in", name="English (Indian)", language="en", gender="neutral",
              description="Indian English accent"),
    VoiceInfo(id="es", name="Spanish Default", language="es", gender="neutral",
              description="Default Spanish voice"),
    VoiceInfo(id="fr", name="French Default", language="fr", gender="neutral",
              description="Default French voice"),
    VoiceInfo(id="de", name="German Default", language="de", gender="neutral",
              description="Default German voice"),
    VoiceInfo(id="zh", name="Chinese Default", language="zh", gender="neutral",
              description="Default Chinese voice"),
    VoiceInfo(id="ja", name="Japanese Default", language="ja", gender="neutral",
              description="Default Japanese voice"),
    VoiceInfo(id="ko", name="Korean Default", language="ko", gender="neutral",
              description="Default Korean voice"),
]


class OpenVoiceProvider(TTSProvider):
    """Provider for OpenVoice V2 - Cross-lingual voice cloning"""

    def __init__(self, device: Optional[str] = None):
        super().__init__(device)
        self._base_speaker_tts = None
        self._tone_converter = None
        self._se_extractor = None

    @classmethod
    def get_info(cls) -> TTSProviderInfo:
        return TTSProviderInfo(
            id="openvoice",
            name="OpenVoice V2",
            description="Cross-lingual voice cloning from MyShell/MIT. Clone a voice and speak in any supported language. ~3GB VRAM.",
            voice_cloning=VoiceCloningSupport.ZERO_SHOT,
            supported_languages=list(OPENVOICE_LANGUAGES.keys()),
            models=[
                {
                    "id": "openvoice-v2",
                    "name": "OpenVoice V2",
                    "size_gb": 1.2,
                    "vram_gb": 3.0,
                    "description": "Latest version with improved cross-lingual support"
                }
            ],
            default_model="openvoice-v2",
            sample_rate=24000,
            requires_reference_text=False,
            min_reference_duration=3.0,
            max_reference_duration=30.0,
            vram_requirement_gb=3.0,
            supports_streaming=False,
            supports_emotion_tags=True,  # OpenVoice supports style control
            preset_voices=OPENVOICE_PRESET_VOICES,
            extra_params={
                "speed": {"type": "float", "default": 1.0, "min": 0.5, "max": 2.0},
                "style": {"type": "select", "default": "default",
                         "options": ["default", "whispering", "shouting", "excited", "sad"]},
            }
        )

    def _check_installed(self) -> bool:
        """Check if OpenVoice is installed"""
        try:
            from openvoice import se_extractor
            from openvoice.api import ToneColorConverter, BaseSpeakerTTS
            return True
        except ImportError:
            return False

    def load(self, model: Optional[str] = None) -> None:
        """Load OpenVoice models"""
        if not self._check_installed():
            raise RuntimeError(
                "OpenVoice V2 is not available. "
                "Visit the Models page to download and install this TTS provider."
            )

        if self._base_speaker_tts is not None:
            self._loaded = True
            return

        print(f"[OpenVoice] Loading models on {self.device}...")

        try:
            from openvoice.api import ToneColorConverter, BaseSpeakerTTS
            from openvoice import se_extractor
            import os

            # OpenVoice checkpoints path (typically in HuggingFace cache)
            ckpt_base = os.path.expanduser("~/.cache/openvoice")

            # Load base speaker TTS for each language
            self._base_speaker_tts = {}
            base_ckpt = os.path.join(ckpt_base, "checkpoints_v2", "base_speakers")

            # Load English base speaker
            en_ckpt = os.path.join(base_ckpt, "EN")
            if os.path.exists(en_ckpt):
                self._base_speaker_tts["en"] = BaseSpeakerTTS(en_ckpt, device=self.device)

            # Load other language base speakers if available
            for lang in ["ES", "FR", "ZH", "JP", "KR"]:
                lang_ckpt = os.path.join(base_ckpt, lang)
                if os.path.exists(lang_ckpt):
                    lang_lower = lang.lower()
                    if lang == "JP":
                        lang_lower = "ja"
                    elif lang == "KR":
                        lang_lower = "ko"
                    self._base_speaker_tts[lang_lower] = BaseSpeakerTTS(lang_ckpt, device=self.device)

            # Load tone color converter
            converter_ckpt = os.path.join(ckpt_base, "checkpoints_v2", "converter")
            self._tone_converter = ToneColorConverter(converter_ckpt, device=self.device)

            # Store SE extractor module
            self._se_extractor = se_extractor

            self._loaded = True
            print(f"[OpenVoice] Models loaded successfully. Languages: {list(self._base_speaker_tts.keys())}")

        except Exception as e:
            raise RuntimeError(f"Failed to load OpenVoice models: {e}")

    def unload(self) -> None:
        """Unload models"""
        self._base_speaker_tts = None
        self._tone_converter = None
        self._se_extractor = None
        self._loaded = False
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        print("[OpenVoice] Models unloaded")

    def _extract_speaker_embedding(self, audio_path: str):
        """Extract speaker embedding from reference audio"""
        if self._se_extractor is None:
            raise RuntimeError("SE extractor not loaded")

        return self._se_extractor.get_se(
            audio_path,
            self._tone_converter,
            vad=True  # Use VAD for better extraction
        )

    def generate(
        self,
        text: str,
        voice_id: Optional[str] = None,
        voice_audio_path: Optional[str] = None,
        voice_audio_text: Optional[str] = None,  # Not required
        language: str = "en",
        speed: float = 1.0,
        model: Optional[str] = None,
        seed: Optional[int] = None,
        style: str = "default",
        **kwargs
    ) -> tuple[np.ndarray, int]:
        """Generate audio using OpenVoice"""

        # Ensure models are loaded
        if self._base_speaker_tts is None:
            self.load(model)

        print(f"[OpenVoice] Generating: lang={language}, style={style}, text_len={len(text)}")

        # Set seed
        if seed is not None and seed > 0:
            torch.manual_seed(seed)
            if torch.cuda.is_available():
                torch.cuda.manual_seed(seed)

        try:
            import tempfile
            import soundfile as sf
            import os

            # Get base speaker for language
            lang_key = language.split("-")[0]  # Handle en-us -> en
            if lang_key not in self._base_speaker_tts:
                # Fallback to English if language not available
                lang_key = "en"
                print(f"[OpenVoice] Language {language} not available, falling back to English")

            base_tts = self._base_speaker_tts.get(lang_key)
            if not base_tts:
                raise RuntimeError(f"No base speaker TTS for language: {lang_key}")

            # Create temp files
            with tempfile.TemporaryDirectory() as tmpdir:
                base_audio_path = os.path.join(tmpdir, "base.wav")
                output_path = os.path.join(tmpdir, "output.wav")

                # Step 1: Generate base audio with text
                # Select base speaker based on voice_id or default
                base_speaker = voice_id if voice_id and not voice_audio_path else f"{lang_key}_default"

                base_tts.tts(
                    text,
                    base_audio_path,
                    speaker=base_speaker,
                    speed=speed,
                )

                # Step 2: If we have reference audio, apply tone conversion
                if voice_audio_path:
                    print(f"[OpenVoice] Applying voice cloning from: {voice_audio_path}")

                    # Extract target speaker embedding
                    target_se, _ = self._extract_speaker_embedding(voice_audio_path)

                    # Extract source speaker embedding
                    source_se, _ = self._extract_speaker_embedding(base_audio_path)

                    # Apply tone color conversion
                    self._tone_converter.convert(
                        audio_src_path=base_audio_path,
                        src_se=source_se,
                        tgt_se=target_se,
                        output_path=output_path,
                    )

                    final_path = output_path
                else:
                    final_path = base_audio_path

                # Load final audio
                audio, sr = sf.read(final_path)

            # Ensure correct format
            if audio.dtype != np.float32:
                audio = audio.astype(np.float32)

            return audio, sr

        except Exception as e:
            raise RuntimeError(f"OpenVoice generation failed: {e}")
