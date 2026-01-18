"""
Reader Service - fast TTS playback for clipboard reading.
Uses Kokoro if available, otherwise falls back to Chatterbox TTS.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional, Tuple

from audio_utils import change_speed
from tts_service import get_tts_service


class ReaderService:
    def __init__(self):
        self._kokoro_available = False
        self._kokoro = None
        self._try_load_kokoro()

    def _try_load_kokoro(self) -> None:
        try:
            import kokoro  # type: ignore
            self._kokoro = kokoro
            self._kokoro_available = True
        except Exception:
            self._kokoro_available = False

    def _synthesize_kokoro(self, text: str, voice: str, speed: float) -> Tuple[list, int]:
        # Placeholder for Kokoro integration if available.
        raise RuntimeError("Kokoro integration not available")

    def synthesize(self, text: str, language: str = "en", voice: Optional[str] = None, speed: float = 1.0):
        if self._kokoro_available:
            return self._synthesize_kokoro(text, voice or "af_sky", speed)

        tts = get_tts_service()
        audio, sample_rate = tts.generate(
            text=text,
            model_type="multilingual",
            language_id=language or "en"
        )
        if speed != 1.0:
            audio = change_speed(audio, sample_rate, speed)
        return audio, sample_rate

    def synthesize_to_file(
        self,
        text: str,
        output_path: Path,
        language: str = "en",
        voice: Optional[str] = None,
        speed: float = 1.0
    ) -> Path:
        audio, sample_rate = self.synthesize(text, language=language, voice=voice, speed=speed)
        tts = get_tts_service()
        tts.save_audio(audio, str(output_path), sample_rate)
        return output_path


_service: Optional[ReaderService] = None


def get_reader_service() -> ReaderService:
    global _service
    if _service is None:
        _service = ReaderService()
    return _service

