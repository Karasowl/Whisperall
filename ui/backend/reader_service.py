"""
Reader Service - fast TTS playback for clipboard reading.
Uses the selected TTS provider from settings with provider registry.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional, Tuple

from audio_utils import change_speed
from tts_service import get_tts_service
from tts_providers import get_provider
from tts_providers.registry import list_providers, is_provider_ready


class ReaderService:
    def _get_provider_config(self, provider_id: str) -> dict:
        from settings_service import settings_service
        key = provider_id.replace("-", "_")
        return settings_service.get(f"providers.tts.{key}", {}) or {}

    def _resolve_provider(self) -> str:
        from settings_service import settings_service

        provider_id = settings_service.get_selected_provider("tts") or "chatterbox"
        if provider_id not in list_providers():
            provider_id = "chatterbox"
        if provider_id != "chatterbox" and not is_provider_ready(provider_id):
            from tts_providers import get_provider_info
            info = get_provider_info(provider_id)
            provider_name = info.name if info else provider_id
            raise RuntimeError(
                f"TTS provider '{provider_name}' is not ready. "
                f"Go to Models page and download the required model, or select a different TTS provider in Settings."
            )
        return provider_id

    def synthesize(
        self,
        text: str,
        language: str = "en",
        voice: Optional[str] = None,
        speed: float = 1.0,
        fast_mode: Optional[bool] = None,
        device: Optional[str] = None,
    ):
        from settings_service import settings_service

        provider_id = self._resolve_provider()
        provider = get_provider(provider_id, device=device)
        config = self._get_provider_config(provider_id)

        if fast_mode is None:
            fast_mode = settings_service.get("performance.fast_mode", False)

        model = config.get("model")
        preset_voice_id = config.get("preset_voice_id")
        voice_id = voice or preset_voice_id

        gen_kwargs = {
            "language": language,
            "speed": speed,
        }

        if model:
            gen_kwargs["model"] = model

        if provider_id == "chatterbox":
            gen_kwargs.update({
                "temperature": 0.8,
                "exaggeration": 0.5,
                "cfg_weight": 0.0 if fast_mode else 0.5,
                "top_p": 0.95,
                "top_k": 1000,
            })
        elif provider_id == "f5-tts":
            gen_kwargs.update({
                "model": model if model != "multilingual" else None,
            })
        elif provider_id == "orpheus":
            gen_kwargs.update({
                "model": model if model not in ["multilingual", "original", "turbo"] else None,
                "temperature": 0.8,
                "top_p": 0.9,
            })
        elif provider_id == "kokoro":
            gen_kwargs["voice_id"] = voice_id
        elif provider_id == "zonos":
            gen_kwargs["model"] = model if model not in ["multilingual", "original"] else None
            if voice_id:
                gen_kwargs["voice_id"] = voice_id
        elif provider_id == "vibevoice":
            gen_kwargs["model"] = model if model not in ["multilingual", "original"] else None
            gen_kwargs["temperature"] = 0.8
        elif provider_id == "voxcpm":
            gen_kwargs["model"] = model if model not in ["multilingual", "original"] else None
            gen_kwargs["temperature"] = 0.8
            gen_kwargs["top_p"] = 0.9
        elif provider_id == "dia":
            gen_kwargs["model"] = model if model not in ["multilingual", "original"] else None
            if voice_id:
                gen_kwargs["voice_id"] = voice_id
        elif provider_id == "openvoice":
            gen_kwargs["model"] = model if model not in ["multilingual", "original"] else None
        elif provider_id == "fish-speech":
            gen_kwargs["model"] = model if model not in ["multilingual", "original"] else None
            gen_kwargs["temperature"] = 0.8
            gen_kwargs["top_p"] = 0.9
        # API Providers
        elif provider_id == "openai-tts":
            gen_kwargs["model"] = model or "tts-1"
            gen_kwargs["voice_id"] = voice_id or "alloy"
        elif provider_id == "elevenlabs":
            gen_kwargs["model"] = model or "eleven_multilingual_v2"
            if voice_id:
                gen_kwargs["voice_id"] = voice_id
        elif provider_id == "fishaudio":
            gen_kwargs["model"] = model or "default"
            if voice_id:
                gen_kwargs["voice_id"] = voice_id
        elif provider_id == "cartesia":
            gen_kwargs["model"] = model or "sonic-2"
            if voice_id:
                gen_kwargs["voice_id"] = voice_id
        elif provider_id == "playht":
            gen_kwargs["model"] = model or "PlayHT2.0-turbo"
            if voice_id:
                gen_kwargs["voice_id"] = voice_id
        elif provider_id == "siliconflow":
            gen_kwargs["model"] = model or "CosyVoice-300M-SFT"
            if voice_id:
                gen_kwargs["voice_id"] = voice_id
        elif provider_id == "minimax":
            gen_kwargs["model"] = model or "speech-01-turbo"
            if voice_id:
                gen_kwargs["voice_id"] = voice_id
        elif provider_id == "zyphra":
            gen_kwargs["model"] = model or "zonos-v1"
            if voice_id:
                gen_kwargs["voice_id"] = voice_id
        elif provider_id == "narilabs":
            gen_kwargs["model"] = model or "dia-1.6b"
            if voice_id:
                gen_kwargs["voice_id"] = voice_id
        else:
            # Fallback for unknown providers
            if voice_id:
                gen_kwargs["voice_id"] = voice_id

        audio, sample_rate = provider.generate(text=text, **gen_kwargs)

        # API providers and some local providers handle speed internally
        providers_with_internal_speed = [
            "f5-tts", "kokoro", "openai-tts", "elevenlabs", "fishaudio",
            "cartesia", "playht", "siliconflow", "minimax", "zyphra", "narilabs"
        ]
        if speed != 1.0 and provider_id not in providers_with_internal_speed:
            audio = change_speed(audio, sample_rate, speed)
        return audio, sample_rate

    def synthesize_to_file(
        self,
        text: str,
        output_path: Path,
        language: str = "en",
        voice: Optional[str] = None,
        speed: float = 1.0,
        fast_mode: bool = False,
        device: Optional[str] = None,
    ) -> Path:
        audio, sample_rate = self.synthesize(
            text,
            language=language,
            voice=voice,
            speed=speed,
            fast_mode=fast_mode,
            device=device,
        )
        tts = get_tts_service()
        tts.save_audio(audio, str(output_path), sample_rate)
        return output_path


_service: Optional[ReaderService] = None


def get_reader_service() -> ReaderService:
    global _service
    if _service is None:
        _service = ReaderService()
    return _service
