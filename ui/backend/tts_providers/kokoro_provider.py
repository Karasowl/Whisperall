"""Kokoro TTS Provider - Lightweight, fast TTS with preset voices"""

import torch
import numpy as np
from pathlib import Path
from typing import Optional, List

from .base import TTSProvider, TTSProviderInfo, VoiceCloningSupport, VoiceInfo


# Kokoro language codes
KOKORO_LANGUAGES = {
    "en-us": "English (US)",
    "en-gb": "English (UK)",
    "es": "Spanish",
    "fr": "French",
    "zh": "Chinese (Mandarin)",
    "ja": "Japanese",
    "hi": "Hindi",
    "it": "Italian",
    "pt": "Portuguese",
    "ko": "Korean",
}

# Kokoro preset voices
KOKORO_VOICES = [
    # American English
    VoiceInfo(id="af_heart", name="Heart", language="en-us", gender="female", description="Warm, friendly female voice"),
    VoiceInfo(id="af_alloy", name="Alloy", language="en-us", gender="female", description="Clear female voice"),
    VoiceInfo(id="af_aoede", name="Aoede", language="en-us", gender="female", description="Expressive female voice"),
    VoiceInfo(id="af_bella", name="Bella", language="en-us", gender="female", description="Soft female voice"),
    VoiceInfo(id="af_jessica", name="Jessica", language="en-us", gender="female", description="Professional female voice"),
    VoiceInfo(id="af_kore", name="Kore", language="en-us", gender="female", description="Young female voice"),
    VoiceInfo(id="af_nicole", name="Nicole", language="en-us", gender="female", description="Mature female voice"),
    VoiceInfo(id="af_nova", name="Nova", language="en-us", gender="female", description="Energetic female voice"),
    VoiceInfo(id="af_river", name="River", language="en-us", gender="female", description="Calm female voice"),
    VoiceInfo(id="af_sarah", name="Sarah", language="en-us", gender="female", description="Conversational female voice"),
    VoiceInfo(id="af_sky", name="Sky", language="en-us", gender="female", description="Light female voice"),
    VoiceInfo(id="am_adam", name="Adam", language="en-us", gender="male", description="Deep male voice"),
    VoiceInfo(id="am_echo", name="Echo", language="en-us", gender="male", description="Rich male voice"),
    VoiceInfo(id="am_eric", name="Eric", language="en-us", gender="male", description="Clear male voice"),
    VoiceInfo(id="am_fenrir", name="Fenrir", language="en-us", gender="male", description="Strong male voice"),
    VoiceInfo(id="am_liam", name="Liam", language="en-us", gender="male", description="Friendly male voice"),
    VoiceInfo(id="am_michael", name="Michael", language="en-us", gender="male", description="Professional male voice"),
    VoiceInfo(id="am_onyx", name="Onyx", language="en-us", gender="male", description="Deep, authoritative male voice"),
    VoiceInfo(id="am_puck", name="Puck", language="en-us", gender="male", description="Playful male voice"),

    # British English
    VoiceInfo(id="bf_alice", name="Alice", language="en-gb", gender="female", description="British female voice"),
    VoiceInfo(id="bf_emma", name="Emma", language="en-gb", gender="female", description="British female voice"),
    VoiceInfo(id="bf_lily", name="Lily", language="en-gb", gender="female", description="British female voice"),
    VoiceInfo(id="bm_daniel", name="Daniel", language="en-gb", gender="male", description="British male voice"),
    VoiceInfo(id="bm_fable", name="Fable", language="en-gb", gender="male", description="British male voice"),
    VoiceInfo(id="bm_george", name="George", language="en-gb", gender="male", description="British male voice"),
    VoiceInfo(id="bm_lewis", name="Lewis", language="en-gb", gender="male", description="British male voice"),

    # Spanish (these use the Spanish G2P)
    VoiceInfo(id="ef_dora", name="Dora", language="es", gender="female", description="Spanish female voice"),
    VoiceInfo(id="em_alex", name="Alex", language="es", gender="male", description="Spanish male voice"),
    VoiceInfo(id="em_santa", name="Santa", language="es", gender="male", description="Spanish male voice"),

    # French
    VoiceInfo(id="ff_siwis", name="Siwis", language="fr", gender="female", description="French female voice"),

    # Japanese
    VoiceInfo(id="jf_alpha", name="Alpha", language="ja", gender="female", description="Japanese female voice"),
    VoiceInfo(id="jf_gongitsune", name="Gongitsune", language="ja", gender="female", description="Japanese female voice"),
    VoiceInfo(id="jf_nezumi", name="Nezumi", language="ja", gender="female", description="Japanese female voice"),
    VoiceInfo(id="jf_tebukuro", name="Tebukuro", language="ja", gender="female", description="Japanese female voice"),
    VoiceInfo(id="jm_kumo", name="Kumo", language="ja", gender="male", description="Japanese male voice"),

    # Chinese
    VoiceInfo(id="zf_xiaobei", name="Xiaobei", language="zh", gender="female", description="Chinese female voice"),
    VoiceInfo(id="zf_xiaoni", name="Xiaoni", language="zh", gender="female", description="Chinese female voice"),
    VoiceInfo(id="zf_xiaoxiao", name="Xiaoxiao", language="zh", gender="female", description="Chinese female voice"),
    VoiceInfo(id="zf_xiaoyi", name="Xiaoyi", language="zh", gender="female", description="Chinese female voice"),
    VoiceInfo(id="zm_yunjian", name="Yunjian", language="zh", gender="male", description="Chinese male voice"),
    VoiceInfo(id="zm_yunxi", name="Yunxi", language="zh", gender="male", description="Chinese male voice"),
    VoiceInfo(id="zm_yunxia", name="Yunxia", language="zh", gender="male", description="Chinese male voice"),
    VoiceInfo(id="zm_yunyang", name="Yunyang", language="zh", gender="male", description="Chinese male voice"),

    # Hindi
    VoiceInfo(id="hf_alpha", name="Alpha", language="hi", gender="female", description="Hindi female voice"),
    VoiceInfo(id="hf_beta", name="Beta", language="hi", gender="female", description="Hindi female voice"),
    VoiceInfo(id="hm_omega", name="Omega", language="hi", gender="male", description="Hindi male voice"),
    VoiceInfo(id="hm_psi", name="Psi", language="hi", gender="male", description="Hindi male voice"),

    # Italian
    VoiceInfo(id="if_sara", name="Sara", language="it", gender="female", description="Italian female voice"),
    VoiceInfo(id="im_nicola", name="Nicola", language="it", gender="male", description="Italian male voice"),

    # Portuguese
    VoiceInfo(id="pf_dora", name="Dora", language="pt", gender="female", description="Portuguese female voice"),
    VoiceInfo(id="pm_alex", name="Alex", language="pt", gender="male", description="Portuguese male voice"),
]


class KokoroProvider(TTSProvider):
    """Provider for Kokoro TTS - lightweight and fast with preset voices"""

    def __init__(self, device: Optional[str] = None):
        super().__init__(device)
        self._pipeline = None

    @classmethod
    def get_info(cls) -> TTSProviderInfo:
        return TTSProviderInfo(
            id="kokoro",
            name="Kokoro TTS",
            description="Very fast and lightweight (82M params). Uses preset voices, no cloning. Great for quick generation.",
            voice_cloning=VoiceCloningSupport.NONE,
            supported_languages=list(KOKORO_LANGUAGES.keys()),
            models=["kokoro-v0.19"],
            default_model="kokoro-v0.19",
            sample_rate=24000,
            requires_reference_text=False,
            min_reference_duration=0,
            max_reference_duration=0,
            vram_requirement_gb=1.0,  # Very lightweight
            supports_streaming=True,
            supports_emotion_tags=False,
            preset_voices=KOKORO_VOICES,
            extra_params={
                "speed": {"type": "float", "default": 1.0, "min": 0.5, "max": 2.0},
            }
        )

    def _check_installed(self) -> bool:
        """Check if kokoro is installed"""
        try:
            import kokoro
            return True
        except ImportError:
            return False

    def load(self, model: Optional[str] = None) -> None:
        """Load Kokoro model"""
        if not self._check_installed():
            raise RuntimeError(
                "Kokoro TTS voice engine is not available. "
                "Visit the Models page to download and install this TTS provider."
            )

        if self._pipeline is not None:
            self._loaded = True
            return

        print(f"[Kokoro] Loading model on {self.device}...")

        from kokoro import KPipeline

        # Initialize pipeline (uses default model)
        self._pipeline = KPipeline(lang_code="a")  # 'a' for American English default

        self._loaded = True
        print("[Kokoro] Model loaded successfully")

    def unload(self) -> None:
        """Unload model"""
        if self._pipeline is not None:
            del self._pipeline
            self._pipeline = None
        self._loaded = False
        torch.cuda.empty_cache() if torch.cuda.is_available() else None
        print("[Kokoro] Model unloaded")

    def get_voices_for_language(self, language: str) -> List[VoiceInfo]:
        """Get preset voices for a specific language"""
        return [v for v in KOKORO_VOICES if v.language == language or v.language.startswith(language)]

    def generate(
        self,
        text: str,
        voice_id: Optional[str] = None,
        voice_audio_path: Optional[str] = None,  # Ignored - no cloning
        voice_audio_text: Optional[str] = None,  # Ignored
        language: str = "en-us",
        speed: float = 1.0,
        model: Optional[str] = None,
        seed: Optional[int] = None,
        **kwargs
    ) -> tuple[np.ndarray, int]:
        """Generate audio using Kokoro TTS"""

        # Ensure model is loaded
        if self._pipeline is None:
            self.load()

        # Map language to Kokoro lang code
        lang_map = {
            "en-us": "a",  # American English
            "en-gb": "b",  # British English
            "en": "a",     # Default to American
            "es": "e",     # Spanish
            "fr": "f",     # French
            "ja": "j",     # Japanese
            "zh": "z",     # Chinese
            "hi": "h",     # Hindi
            "it": "i",     # Italian
            "pt": "p",     # Portuguese
            "ko": "k",     # Korean
        }

        lang_code = lang_map.get(language, "a")

        # Select voice
        if not voice_id:
            # Pick default voice for language
            voices = self.get_voices_for_language(language)
            voice_id = voices[0].id if voices else "af_heart"

        print(f"[Kokoro] Generating with voice={voice_id}, lang={lang_code}, text_len={len(text)}")

        # Set seed
        if seed is not None and seed > 0:
            torch.manual_seed(seed)

        # Create pipeline for the specific language
        from kokoro import KPipeline
        pipeline = KPipeline(lang_code=lang_code)

        # Generate audio
        generator = pipeline(
            text,
            voice=voice_id,
            speed=speed,
        )

        # Collect all audio chunks
        audio_chunks = []
        for chunk in generator:
            if hasattr(chunk, 'audio') and chunk.audio is not None:
                audio_chunks.append(chunk.audio.numpy())

        if not audio_chunks:
            raise RuntimeError("Kokoro generated no audio")

        wav = np.concatenate(audio_chunks)

        # Ensure correct format
        if wav.dtype != np.float32:
            wav = wav.astype(np.float32)

        return wav, 24000
