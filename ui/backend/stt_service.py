"""
STT Service - Faster-Whisper and API fallbacks.
Provides local transcription with optional API providers.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional, Tuple

import requests

from settings_service import settings_service

# Diagnostics
from diagnostics import log_function, error_context
from diagnostics.error_codes import ErrorCode


class STTService:
    def __init__(self):
        self._models = {}

    def _normalize_model_id(self, model: Optional[str]) -> str:
        if not model:
            return "base"
        model = model.strip()
        if model.startswith("faster-whisper-"):
            model = model.replace("faster-whisper-", "")
        if model.startswith("faster-distil-whisper-"):
            model = model.replace("faster-distil-whisper-", "distil-")
        if model in ("distil-whisper-large-v3", "faster-distil-whisper-large-v3"):
            return "distil-large-v3"
        return model

    def _detect_device(self, requested: Optional[str]) -> str:
        if requested and requested != "auto":
            return requested
        try:
            import torch
            if torch.cuda.is_available():
                return "cuda"
        except Exception:
            pass
        return "cpu"

    def _compute_type(self, device: str) -> str:
        return "float16" if device == "cuda" else "int8"

    def _resolve_local_model(self, provider: str) -> str:
        if provider.startswith("faster-whisper-"):
            model = provider.replace("faster-whisper-", "")
        else:
            model = settings_service.get("providers.stt.faster_whisper.model", "base")

        return self._normalize_model_id(model)

    def _load_local_model(self, model_name: str, device: str):
        # Ensure model name is normalized (safety check)
        model_name = self._normalize_model_id(model_name)

        if model_name in self._models:
            return self._models[model_name]

        try:
            from faster_whisper import WhisperModel
        except Exception as exc:
            raise RuntimeError("faster-whisper is not installed") from exc

        model = WhisperModel(model_name, device=device, compute_type=self._compute_type(device))
        self._models[model_name] = model
        return model

    def _transcribe_local(self, audio_path: Path, language: str, prompt: Optional[str]) -> Tuple[str, dict]:
        provider = settings_service.get_selected_provider("stt")
        model_name = self._resolve_local_model(provider)
        device = self._detect_device(settings_service.get("providers.stt.faster_whisper.device", "auto"))
        model = self._load_local_model(model_name, device=device)

        lang = None if language == "auto" else language
        # Use forward slashes to avoid Windows path escape issues
        audio_str = str(audio_path).replace("\\", "/")
        segments, info = model.transcribe(
            audio_str,
            language=lang,
            vad_filter=True,
            initial_prompt=prompt or None
        )
        text = " ".join(seg.text.strip() for seg in segments if seg.text)
        return text.strip(), {"language": info.language, "duration": info.duration, "model": model_name}

    def _transcribe_openai(self, audio_path: Path, language: str) -> Tuple[str, dict]:
        key = settings_service.get_api_key("openai")
        if not key:
            raise RuntimeError("OpenAI API key is not configured")

        data = {"model": "whisper-1"}
        if language != "auto":
            data["language"] = language

        with audio_path.open("rb") as audio_file:
            resp = requests.post(
                "https://api.openai.com/v1/audio/transcriptions",
                headers={"Authorization": f"Bearer {key}"},
                files={"file": audio_file},
                data=data,
                timeout=120
            )
        if resp.status_code != 200:
            raise RuntimeError(f"OpenAI STT error: HTTP {resp.status_code}")

        result = resp.json()
        return result.get("text", "").strip(), {"provider": "openai"}

    def _transcribe_groq(self, audio_path: Path, language: str, prompt: Optional[str]) -> Tuple[str, dict]:
        key = settings_service.get_api_key("groq")
        if not key:
            raise RuntimeError("Groq API key is not configured")

        model = settings_service.get("providers.stt.groq.model", "whisper-large-v3")
        data = {"model": model}
        if language != "auto":
            data["language"] = language
        if prompt:
            data["prompt"] = prompt

        with audio_path.open("rb") as audio_file:
            resp = requests.post(
                "https://api.groq.com/openai/v1/audio/transcriptions",
                headers={"Authorization": f"Bearer {key}"},
                files={"file": audio_file},
                data=data,
                timeout=120
            )
        if resp.status_code != 200:
            raise RuntimeError(f"Groq STT error: HTTP {resp.status_code}")

        result = resp.json()
        return result.get("text", "").strip(), {"provider": "groq", "model": model}

    def _transcribe_deepgram(self, audio_path: Path, language: str) -> Tuple[str, dict]:
        key = settings_service.get_api_key("deepgram")
        if not key:
            raise RuntimeError("Deepgram API key is not configured")

        model = settings_service.get("providers.stt.deepgram.model", "nova-2")
        params = {"model": model, "smart_format": "true", "punctuate": "true"}
        if language != "auto":
            params["language"] = language

        with audio_path.open("rb") as audio_file:
            resp = requests.post(
                "https://api.deepgram.com/v1/listen",
                headers={"Authorization": f"Token {key}"},
                params=params,
                data=audio_file,
                timeout=120
            )
        if resp.status_code != 200:
            raise RuntimeError(f"Deepgram STT error: HTTP {resp.status_code}")

        result = resp.json()
        alternatives = result.get("results", {}).get("channels", [{}])[0].get("alternatives", [])
        transcript = alternatives[0].get("transcript", "") if alternatives else ""
        return transcript.strip(), {"provider": "deepgram", "model": model}

    def _transcribe_elevenlabs(self, audio_path: Path, language: str) -> Tuple[str, dict]:
        """Transcribe using ElevenLabs Scribe API (10 hours included in Starter plan)"""
        key = settings_service.get_api_key("elevenlabs")
        if not key:
            raise RuntimeError("ElevenLabs API key is not configured")

        model = settings_service.get("providers.stt.elevenlabs.model", "scribe_v2")

        # Prepare multipart form data
        files = {"file": audio_path.open("rb")}
        data = {"model_id": model}

        # Add language if specified (ISO-639-1 code)
        if language != "auto":
            data["language_code"] = language

        try:
            resp = requests.post(
                "https://api.elevenlabs.io/v1/speech-to-text",
                headers={"xi-api-key": key},
                files=files,
                data=data,
                timeout=180  # Longer timeout for potentially larger files
            )
        finally:
            files["file"].close()

        if resp.status_code != 200:
            error_detail = ""
            try:
                error_detail = resp.json().get("detail", {}).get("message", resp.text)
            except Exception:
                error_detail = resp.text
            raise RuntimeError(f"ElevenLabs STT error: HTTP {resp.status_code} - {error_detail}")

        result = resp.json()
        text = result.get("text", "").strip()
        detected_language = result.get("language_code", language)

        return text, {
            "provider": "elevenlabs",
            "model": model,
            "language": detected_language,
            "language_probability": result.get("language_probability"),
        }

    @log_function(module="stt", error_code=ErrorCode.STT_TRANSCRIPTION_FAILED)
    def transcribe(self, audio_path: Path, language: str = "auto", prompt: Optional[str] = None) -> Tuple[str, dict]:
        provider = settings_service.get_selected_provider("stt")

        with error_context(provider=provider, language=language):
            if provider.startswith("faster-whisper"):
                return self._transcribe_local(audio_path, language, prompt)
            if provider == "openai":
                return self._transcribe_openai(audio_path, language)
            if provider == "groq":
                return self._transcribe_groq(audio_path, language, prompt)
            if provider == "deepgram":
                return self._transcribe_deepgram(audio_path, language)
            if provider == "elevenlabs":
                return self._transcribe_elevenlabs(audio_path, language)

            raise RuntimeError(f"STT provider not supported: {provider}")


_service: Optional[STTService] = None


def get_stt_service() -> STTService:
    global _service
    if _service is None:
        _service = STTService()
    return _service
