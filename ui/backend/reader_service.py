"""
Reader Service - fast TTS playback for clipboard reading.
Uses the selected TTS provider from settings with provider registry.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional, Tuple, Any

from audio_utils import change_speed
from tts_service import get_tts_service
from tts_providers import get_provider
from tts_providers.registry import list_providers, is_provider_ready

# Diagnostics
from diagnostics import log_function, error_context, log_info, log_error
from diagnostics.error_codes import ErrorCode


class ReaderService:
    def _get_provider_config(self, provider_id: str) -> dict:
        from settings_service import settings_service
        key = provider_id.replace("-", "_")
        return settings_service.get(f"providers.tts.{key}", {}) or {}

    def _resolve_provider(self) -> str:
        from settings_service import settings_service

        preferred = settings_service.get_selected_provider("tts") or "kokoro"

        # Build candidate list: preferred -> known fast defaults -> anything else that exists.
        fallback_order = [
            "kokoro",
            "chatterbox",
            "deepinfra-tts",
            "openai-tts",
            "elevenlabs",
        ]

        candidates = []
        if preferred:
            candidates.append(preferred)
        for p in fallback_order:
            if p not in candidates:
                candidates.append(p)
        for p in list_providers():
            if p not in candidates:
                candidates.append(p)

        # Pick the first ready provider.
        for provider_id in candidates:
            if provider_id not in list_providers():
                continue
            if is_provider_ready(provider_id):
                return provider_id

        # If nothing is ready, craft a helpful error message for the preferred provider.
        from tts_providers import get_provider_info
        provider_id = preferred if preferred in list_providers() else (list_providers()[0] if list_providers() else preferred)
        info = get_provider_info(provider_id) if provider_id else None
        provider_name = info.name if info else (provider_id or "unknown")

        hint = "Go to Models page and download the required model."
        try:
            from tts_providers.registry import PROVIDER_DEPENDENCIES
            deps = PROVIDER_DEPENDENCIES.get(provider_id or "")
            if deps and deps.get("type") == "api":
                key_name = deps.get("api_key")
                if key_name and not settings_service.get_api_key(key_name):
                    hint = (
                        "This provider requires an API key. Set it in Settings > API Keys "
                        f"or via env var WHISPERALL_{key_name.upper()}_API_KEY."
                    )
                else:
                    hint = "This provider is not ready. Check your network and provider configuration."
        except Exception:
            pass

        raise RuntimeError(f"TTS provider '{provider_name}' is not ready. {hint}")

    @log_function(module="reader", error_code=ErrorCode.READ_TTS_FAILED)
    def synthesize(
        self,
        text: str,
        language: str = "en",
        voice: Optional[str] = None,
        speed: float = 1.0,
        fast_mode: Optional[bool] = None,
        device: Optional[str] = None,
    ) -> Tuple[Any, int, dict]:
        from settings_service import settings_service

        if not text or not text.strip():
            log_error("reader", "synthesize", "Empty text provided",
                      error_code=ErrorCode.READ_TEXT_EMPTY)
            raise ValueError("Text cannot be empty")

        provider_id = self._resolve_provider()
        log_info("reader", "synthesize", f"Using provider {provider_id}", text_length=len(text))

        with error_context(provider=provider_id, language=language, voice=voice, text_length=len(text)):
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

            meta: dict[str, str] = {"provider": provider_id}
            if model:
                meta["model"] = str(model)
            if voice_id:
                meta["voice_id"] = str(voice_id)

            return audio, sample_rate, meta

    def synthesize_to_file_with_meta(
        self,
        text: str,
        output_path: Path,
        language: str = "en",
        voice: Optional[str] = None,
        speed: float = 1.0,
        fast_mode: bool = False,
        device: Optional[str] = None,
    ) -> Tuple[Path, dict]:
        audio, sample_rate, meta = self.synthesize(
            text,
            language=language,
            voice=voice,
            speed=speed,
            fast_mode=fast_mode,
            device=device,
        )
        tts = get_tts_service()
        tts.save_audio(audio, str(output_path), sample_rate)
        return output_path, meta

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
        output_path, _meta = self.synthesize_to_file_with_meta(
            text=text,
            output_path=output_path,
            language=language,
            voice=voice,
            speed=speed,
            fast_mode=fast_mode,
            device=device,
        )
        return output_path


_service: Optional[ReaderService] = None


def get_reader_service() -> ReaderService:
    global _service
    if _service is None:
        _service = ReaderService()
    return _service
