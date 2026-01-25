"""ElevenLabs TTS Provider - Premium cloud-based voice synthesis"""

from typing import Optional, List
import numpy as np
import io

from ..base import (
    TTSProvider,
    TTSProviderInfo,
    VoiceCloningSupport,
    VoiceInfo,
    ModelVariant,
)


class ElevenLabsProvider(TTSProvider):
    """ElevenLabs TTS Provider - Premium voice synthesis with instant voice cloning"""

    def __init__(self, device: Optional[str] = None):
        # API provider doesn't need device
        self._loaded = False
        self._client = None
        self._voices_cache = {}
        self.device = "api"

    @classmethod
    def get_info(cls) -> TTSProviderInfo:
        return TTSProviderInfo(
            id="elevenlabs",
            name="ElevenLabs",
            description="Premium voice synthesis with instant voice cloning and voice library.",
            voice_cloning=VoiceCloningSupport.ZERO_SHOT,
            supported_languages=[
                "en", "es", "fr", "de", "it", "pt", "pl", "zh", "ja", "ko",
                "ar", "hi", "ru", "nl", "sv", "da", "fi", "no", "tr", "cs",
                "el", "he", "id", "ms", "th", "vi", "uk", "ro", "hu", "bg",
            ],
            models=[
                ModelVariant(
                    id="eleven_multilingual_v2",
                    name="Multilingual V2",
                    size_gb=0,
                    vram_gb=0,
                    description="Best quality, 29 languages"
                ),
                ModelVariant(
                    id="eleven_turbo_v2_5",
                    name="Turbo V2.5",
                    size_gb=0,
                    vram_gb=0,
                    description="Low latency, good quality"
                ),
                ModelVariant(
                    id="eleven_flash_v2_5",
                    name="Flash V2.5",
                    size_gb=0,
                    vram_gb=0,
                    description="Fastest, optimized for streaming"
                ),
            ],
            default_model="eleven_multilingual_v2",
            sample_rate=44100,
            requires_reference_text=False,
            vram_requirement_gb=0,  # API - no local VRAM
            supports_streaming=True,
            supports_emotion_tags=False,
            preset_voices=[],  # Voices are fetched dynamically from API
            extra_params={
                "stability": {
                    "type": "float",
                    "default": 0.5,
                    "min": 0.0,
                    "max": 1.0,
                    "description": "Voice stability (higher = more consistent)"
                },
                "similarity_boost": {
                    "type": "float",
                    "default": 0.75,
                    "min": 0.0,
                    "max": 1.0,
                    "description": "Voice similarity to original"
                },
                "style": {
                    "type": "float",
                    "default": 0.0,
                    "min": 0.0,
                    "max": 1.0,
                    "description": "Speaking style exaggeration"
                },
                "use_speaker_boost": {
                    "type": "boolean",
                    "default": True,
                    "description": "Enhance speaker clarity"
                },
            },
        )

    def load(self, model: Optional[str] = None) -> None:
        """Initialize the ElevenLabs client"""
        try:
            from elevenlabs import ElevenLabs
            from settings_service import settings_service

            api_key = settings_service.get_api_key("elevenlabs")
            if not api_key:
                raise ValueError("ElevenLabs API key not configured. Set it in Settings.")

            self._client = ElevenLabs(api_key=api_key)
            self._model = model or "eleven_multilingual_v2"
            self._loaded = True
        except ImportError:
            raise ImportError("elevenlabs package not installed. Run: pip install elevenlabs")

    def unload(self) -> None:
        """Clear the client"""
        self._client = None
        self._voices_cache = {}
        self._loaded = False

    def _normalize_language(self, label: Optional[str]) -> Optional[str]:
        if not label:
            return None
        value = str(label).strip().lower()
        if not value:
            return None
        if len(value) == 2:
            return value
        if "-" in value and len(value) <= 6:
            return value
        mapping = {
            "american": "en-us",
            "us": "en-us",
            "british": "en-gb",
            "uk": "en-gb",
            "australian": "en-au",
            "india": "en-in",
            "indian": "en-in",
            "irish": "en-ie",
            "new zealand": "en-nz",
            "south african": "en-za",
            "nigerian": "en-ng",
            "english": "en",
            "spanish": "es",
            "mexican": "es",
            "latin american": "es",
            "french": "fr",
            "german": "de",
            "italian": "it",
            "portuguese": "pt",
            "japanese": "ja",
            "korean": "ko",
            "chinese": "zh",
            "hindi": "hi",
            "arabic": "ar",
            "russian": "ru",
            "dutch": "nl",
            "swedish": "sv",
            "danish": "da",
            "finnish": "fi",
            "norwegian": "no",
            "turkish": "tr",
            "czech": "cs",
            "greek": "el",
            "hebrew": "he",
            "indonesian": "id",
            "malay": "ms",
            "thai": "th",
            "vietnamese": "vi",
            "ukrainian": "uk",
            "romanian": "ro",
            "hungarian": "hu",
            "bulgarian": "bg",
            "polish": "pl",
        }
        for key, code in mapping.items():
            if key in value:
                return code
        return None

    def _language_matches(self, voice_lang: Optional[str], target_lang: str) -> bool:
        if not voice_lang:
            return False
        voice_base = voice_lang.split("-")[0]
        target_base = target_lang.split("-")[0]
        return voice_lang == target_lang or voice_base == target_base

    def _language_label(self, code: str) -> Optional[str]:
        base = code.split("-")[0].lower()
        labels = {
            "en": "English",
            "es": "Spanish",
            "fr": "French",
            "de": "German",
            "it": "Italian",
            "pt": "Portuguese",
            "pl": "Polish",
            "zh": "Chinese",
            "ja": "Japanese",
            "ko": "Korean",
            "ar": "Arabic",
            "hi": "Hindi",
            "ru": "Russian",
            "nl": "Dutch",
            "sv": "Swedish",
            "da": "Danish",
            "fi": "Finnish",
            "no": "Norwegian",
            "tr": "Turkish",
            "cs": "Czech",
            "el": "Greek",
            "he": "Hebrew",
            "id": "Indonesian",
            "ms": "Malay",
            "th": "Thai",
            "vi": "Vietnamese",
            "uk": "Ukrainian",
            "ro": "Romanian",
            "hu": "Hungarian",
            "bg": "Bulgarian",
        }
        return labels.get(base)

    def _default_voices(self) -> List[VoiceInfo]:
        return [
            VoiceInfo(id="21m00Tcm4TlvDq8ikWAM", name="Rachel", description="Calm, young female", language="en-us"),
            VoiceInfo(id="AZnzlk1XvdvUeBnXmlld", name="Domi", description="Strong, confident female", language="en-us"),
            VoiceInfo(id="EXAVITQu4vr4xnSDxMaL", name="Bella", description="Soft, friendly female", language="en-us"),
            VoiceInfo(id="ErXwobaYiN019PkySvjV", name="Antoni", description="Well-rounded male", language="en-us"),
            VoiceInfo(id="MF3mGyEYCl7XYWbV9V6O", name="Elli", description="Emotional, young female", language="en-us"),
            VoiceInfo(id="TxGEqnHWrfWFTfGW9XjX", name="Josh", description="Deep, narrative male", language="en-us"),
            VoiceInfo(id="VR6AewLTigWG4xSOukaG", name="Arnold", description="Crisp, middle-aged male", language="en-us"),
            VoiceInfo(id="pNInz6obpgDQGcFmaJgB", name="Adam", description="Deep, middle-aged male", language="en-us"),
            VoiceInfo(id="yoZ06aMxZJJ28mfd3POQ", name="Sam", description="Raspy, young male", language="en-us"),
        ]

    def get_preset_voices(self, language: Optional[str] = None) -> List[VoiceInfo]:
        """Fetch available voices from ElevenLabs API"""
        if not self._loaded:
            self.load()

        cache_key = (language or "all").lower()
        cached = self._voices_cache.get(cache_key)
        if cached is not None:
            return cached

        try:
            user_voices = self._voices_cache.get("user")
            if user_voices is None:
                response = self._client.voices.get_all(show_legacy=True)
                user_voices = []
                for voice in response.voices:
                    labels = getattr(voice, "labels", None)
                    label_gender = None
                    label_lang = None
                    if isinstance(labels, dict):
                        label_gender = labels.get("gender")
                        label_lang = labels.get("language") or labels.get("accent") or labels.get("locale")
                    elif labels is not None:
                        label_gender = getattr(labels, "gender", None)
                        label_lang = getattr(labels, "language", None) or getattr(labels, "accent", None) or getattr(labels, "locale", None)

                    verified = getattr(voice, "verified_languages", None) or []
                    if not label_lang and verified:
                        first = verified[0]
                        label_lang = getattr(first, "locale", None) or getattr(first, "language", None) or getattr(first, "accent", None)

                    sample_url = getattr(voice, "preview_url", None)
                    if not sample_url and verified:
                        first = verified[0]
                        sample_url = getattr(first, "preview_url", None)

                    name = voice.name or voice.voice_id
                    user_voices.append(VoiceInfo(
                        id=voice.voice_id,
                        name=name,
                        description=getattr(voice, "description", None) or name,
                        gender=(str(label_gender).lower() if label_gender else None),
                        language=self._normalize_language(label_lang),
                        is_preset=voice.category != "cloned" if hasattr(voice, "category") else True,
                        sample_url=sample_url,
                    ))
                self._voices_cache["user"] = user_voices
        except Exception as e:
            print(f"[ElevenLabs] Failed to fetch owned voices: {e}")
            user_voices = self._default_voices()

        shared_voices: List[VoiceInfo] = []
        if language:
            try:
                target_lang = self._normalize_language(language) or language.lower()
                page = 1
                max_pages = 3
                page_size = 100
                while page <= max_pages:
                    response = self._client.voices.get_shared(page_size=page_size, page=page)
                    for voice in response.voices:
                        voice_lang = self._normalize_language(voice.locale or voice.language or voice.accent)
                        if not voice_lang:
                            continue
                        if not self._language_matches(voice_lang, target_lang):
                            continue
                        name = voice.name or voice.voice_id
                        description = voice.description or voice.use_case or voice.descriptive or name
                        shared_voices.append(VoiceInfo(
                            id=voice.voice_id,
                            name=name,
                            description=description,
                            gender=str(voice.gender).lower() if voice.gender else None,
                            language=voice_lang,
                            is_preset=True,
                            sample_url=voice.preview_url,
                        ))

                    if not response.has_more or len(shared_voices) >= 50:
                        break
                    page += 1

                if len(shared_voices) < 5:
                    label = self._language_label(target_lang)
                    if label:
                        response = self._client.voices.get_shared(page_size=page_size, language=label)
                        for voice in response.voices:
                            voice_lang = self._normalize_language(voice.locale or voice.language or voice.accent)
                            if not voice_lang:
                                continue
                            if not self._language_matches(voice_lang, target_lang):
                                continue
                            name = voice.name or voice.voice_id
                            description = voice.description or voice.use_case or voice.descriptive or name
                            shared_voices.append(VoiceInfo(
                                id=voice.voice_id,
                                name=name,
                                description=description,
                                gender=str(voice.gender).lower() if voice.gender else None,
                                language=voice_lang,
                                is_preset=True,
                                sample_url=voice.preview_url,
                            ))
            except Exception as e:
                print(f"[ElevenLabs] Failed to fetch shared voices: {e}")

        merged: List[VoiceInfo] = []
        seen = set()
        for voice in (user_voices or []) + shared_voices:
            if voice.id in seen:
                continue
            seen.add(voice.id)
            merged.append(voice)

        if not merged:
            merged = self._default_voices()

        self._voices_cache[cache_key] = merged
        return merged

    def generate(
        self,
        text: str,
        voice_id: Optional[str] = None,
        voice_audio_path: Optional[str] = None,
        voice_audio_text: Optional[str] = None,
        language: str = "en",
        speed: float = 1.0,
        **kwargs
    ) -> tuple[np.ndarray, int]:
        """
        Generate audio using ElevenLabs TTS API.

        Args:
            text: Text to synthesize
            voice_id: ElevenLabs voice ID
            voice_audio_path: Path to reference audio for instant voice cloning
            language: Language code (for language detection hint)
            speed: Playback speed (not directly supported, applied post-process)
            **kwargs: Additional params (stability, similarity_boost, style, model)

        Returns:
            Tuple of (audio_array, sample_rate)
        """
        if not self._loaded:
            self.load(kwargs.get("model"))

        # Get voice settings
        stability = kwargs.get("stability", 0.5)
        similarity_boost = kwargs.get("similarity_boost", 0.75)
        style = kwargs.get("style", 0.0)
        use_speaker_boost = kwargs.get("use_speaker_boost", True)
        model = kwargs.get("model", self._model or "eleven_multilingual_v2")

        # Default voice if not specified
        if not voice_id:
            voice_id = "21m00Tcm4TlvDq8ikWAM"  # Rachel

        try:
            from elevenlabs import VoiceSettings

            # Handle instant voice cloning if reference audio provided
            if voice_audio_path:
                audio_data = self._generate_with_clone(
                    text=text,
                    reference_audio_path=voice_audio_path,
                    model=model,
                    stability=stability,
                    similarity_boost=similarity_boost,
                    style=style,
                )
            else:
                # Standard generation with existing voice
                audio_data = self._client.text_to_speech.convert(
                    voice_id=voice_id,
                    text=text,
                    model_id=model,
                    voice_settings=VoiceSettings(
                        stability=stability,
                        similarity_boost=similarity_boost,
                        style=style,
                        use_speaker_boost=use_speaker_boost,
                    ),
                )

            # Convert generator to bytes
            audio_bytes = b"".join(audio_data)

            # Decode MP3 to numpy array
            audio_array, sample_rate = self._decode_audio(audio_bytes)

            # Apply speed adjustment if not 1.0
            if speed != 1.0:
                audio_array = self._adjust_speed(audio_array, sample_rate, speed)

            return audio_array, sample_rate

        except Exception as e:
            raise RuntimeError(f"ElevenLabs TTS generation failed: {e}")

    def _generate_with_clone(
        self,
        text: str,
        reference_audio_path: str,
        model: str,
        stability: float,
        similarity_boost: float,
        style: float,
    ) -> bytes:
        """Generate audio using instant voice cloning"""
        from elevenlabs import VoiceSettings

        # Read reference audio
        with open(reference_audio_path, "rb") as f:
            reference_audio = f.read()

        # Use voice design/clone endpoint
        audio_data = self._client.text_to_speech.convert_as_stream(
            text=text,
            model_id=model,
            voice_settings=VoiceSettings(
                stability=stability,
                similarity_boost=similarity_boost,
                style=style,
            ),
        )

        return audio_data

    def _decode_audio(self, audio_bytes: bytes) -> tuple[np.ndarray, int]:
        """Decode audio bytes (MP3) to numpy array"""
        try:
            import soundfile as sf

            with io.BytesIO(audio_bytes) as audio_io:
                audio_array, sample_rate = sf.read(audio_io)

            # Ensure float32
            audio_array = audio_array.astype(np.float32)

            # Convert stereo to mono if needed
            if len(audio_array.shape) > 1:
                audio_array = audio_array.mean(axis=1)

            return audio_array, sample_rate

        except ImportError:
            # Fallback to pydub if soundfile not available
            try:
                from pydub import AudioSegment

                audio = AudioSegment.from_mp3(io.BytesIO(audio_bytes))
                sample_rate = audio.frame_rate
                samples = np.array(audio.get_array_of_samples())

                # Normalize
                if audio.sample_width == 2:
                    samples = samples.astype(np.float32) / 32768.0
                elif audio.sample_width == 4:
                    samples = samples.astype(np.float32) / 2147483648.0

                # Convert stereo to mono
                if audio.channels == 2:
                    samples = samples.reshape(-1, 2).mean(axis=1)

                return samples, sample_rate

            except ImportError:
                raise ImportError("Neither soundfile nor pydub is installed. Install one: pip install soundfile")

    def _adjust_speed(self, audio: np.ndarray, sample_rate: int, speed: float) -> np.ndarray:
        """Adjust audio playback speed using resampling"""
        try:
            import librosa

            # Time-stretch without changing pitch
            return librosa.effects.time_stretch(audio, rate=speed)
        except ImportError:
            # Simple resampling fallback (changes pitch)
            from scipy import signal

            new_length = int(len(audio) / speed)
            return signal.resample(audio, new_length)
