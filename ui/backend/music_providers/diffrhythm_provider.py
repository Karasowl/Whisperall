"""DiffRhythm Music Provider - Text-to-music generation"""

import torch
import numpy as np
from pathlib import Path
from typing import Optional, List

from .base import MusicProvider, MusicProviderInfo


# Supported genres (DiffRhythm is quite flexible)
DIFFRHYTHM_GENRES = [
    "pop", "rock", "electronic", "hip-hop", "jazz", "classical",
    "country", "folk", "r&b", "metal", "indie", "ambient",
    "dance", "reggae", "blues", "latin", "world", "experimental"
]


class DiffRhythmProvider(MusicProvider):
    """Provider for DiffRhythm - Text-to-music generation"""

    def __init__(self, device: Optional[str] = None):
        super().__init__(device)
        self._model = None
        self._vocoder = None

    @classmethod
    def get_info(cls) -> MusicProviderInfo:
        return MusicProviderInfo(
            id="diffrhythm",
            name="DiffRhythm",
            description="Generate full songs with lyrics and instrumentals. Up to 4:45 duration. ~6GB VRAM (FP16).",
            max_duration_seconds=285,  # 4:45
            supported_genres=DIFFRHYTHM_GENRES,
            requires_lyrics=False,  # Can do instrumental
            vram_requirement_gb=6.0,
            models=[
                {
                    "id": "diffrhythm-v1",
                    "name": "DiffRhythm V1",
                    "size_gb": 2.5,
                    "vram_gb": 6.0,
                    "description": "Original model, good quality"
                },
                {
                    "id": "diffrhythm-v2",
                    "name": "DiffRhythm V2",
                    "size_gb": 3.0,
                    "vram_gb": 8.0,
                    "description": "Improved model, better vocals"
                }
            ],
            default_model="diffrhythm-v1",
            sample_rate=44100,
            supports_instrumental=True,
            supports_vocals=True,
            extra_params={
                "guidance_scale": {"type": "float", "default": 3.5, "min": 1.0, "max": 10.0},
                "num_inference_steps": {"type": "int", "default": 50, "min": 20, "max": 100},
                "seed": {"type": "int", "default": -1, "min": -1, "max": 2147483647},
            }
        )

    def _check_installed(self) -> bool:
        """Check if DiffRhythm is installed"""
        try:
            import diffrhythm
            return True
        except ImportError:
            return False

    def load(self, model: Optional[str] = None) -> None:
        """Load DiffRhythm model"""
        if not self._check_installed():
            raise RuntimeError(
                "DiffRhythm is not available. "
                "Install with: pip install diffrhythm"
            )

        if self._model is not None:
            self._loaded = True
            return

        print(f"[DiffRhythm] Loading model on {self.device}...")

        try:
            from diffrhythm import DiffRhythm

            model_id = model or "diffrhythm-v1"
            model_name = "diffrhythm/diffrhythm-v1" if "v1" in model_id else "diffrhythm/diffrhythm-v2"

            self._model = DiffRhythm.from_pretrained(model_name, device=self.device)

            self._loaded = True
            print("[DiffRhythm] Model loaded successfully")
        except Exception as e:
            raise RuntimeError(f"Failed to load DiffRhythm model: {e}")

    def unload(self) -> None:
        """Unload model"""
        if self._model is not None:
            del self._model
            self._model = None
        if self._vocoder is not None:
            del self._vocoder
            self._vocoder = None
        self._loaded = False
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        print("[DiffRhythm] Model unloaded")

    def _parse_lrc_lyrics(self, lyrics: str) -> List[dict]:
        """Parse LRC format lyrics into structured format"""
        import re

        lines = []
        pattern = r'\[(\d{2}):(\d{2})\.(\d{2})\]\s*(.*)'

        for line in lyrics.strip().split('\n'):
            match = re.match(pattern, line.strip())
            if match:
                minutes = int(match.group(1))
                seconds = int(match.group(2))
                centis = int(match.group(3))
                text = match.group(4)

                timestamp = minutes * 60 + seconds + centis / 100
                lines.append({
                    "timestamp": timestamp,
                    "text": text
                })
            elif line.strip():
                # Plain text without timestamp
                lines.append({
                    "timestamp": None,
                    "text": line.strip()
                })

        return lines

    def generate(
        self,
        lyrics: str,
        style_prompt: str,
        duration_seconds: int = 180,
        reference_audio: Optional[str] = None,
        model: Optional[str] = None,
        seed: int = -1,
        guidance_scale: float = 3.5,
        num_inference_steps: int = 50,
        **kwargs
    ) -> tuple[np.ndarray, int]:
        """Generate music using DiffRhythm"""

        if self._model is None:
            self.load(model)

        # Cap duration at max
        max_duration = self.get_info().max_duration_seconds
        duration_seconds = min(duration_seconds, max_duration)

        print(f"[DiffRhythm] Generating: style='{style_prompt[:50]}...', duration={duration_seconds}s")

        # Set seed
        if seed >= 0:
            torch.manual_seed(seed)
            if torch.cuda.is_available():
                torch.cuda.manual_seed(seed)
        else:
            seed = torch.randint(0, 2147483647, (1,)).item()
            torch.manual_seed(seed)

        try:
            # Parse lyrics if provided
            parsed_lyrics = None
            if lyrics and lyrics.strip():
                parsed_lyrics = self._parse_lrc_lyrics(lyrics)

            # Load reference audio if provided
            ref_audio = None
            if reference_audio:
                import torchaudio
                ref_audio, ref_sr = torchaudio.load(reference_audio)
                if ref_sr != 44100:
                    ref_audio = torchaudio.functional.resample(ref_audio, ref_sr, 44100)

            # Generate music
            audio = self._model.generate(
                style_prompt=style_prompt,
                lyrics=parsed_lyrics,
                duration=duration_seconds,
                reference_audio=ref_audio,
                guidance_scale=guidance_scale,
                num_inference_steps=num_inference_steps,
            )

            # Convert to numpy
            if isinstance(audio, torch.Tensor):
                audio = audio.cpu().numpy()

            if audio.dtype != np.float32:
                audio = audio.astype(np.float32)

            # Normalize
            if audio.max() > 1.0 or audio.min() < -1.0:
                audio = audio / max(abs(audio.max()), abs(audio.min()))

            return audio, 44100

        except Exception as e:
            raise RuntimeError(f"DiffRhythm generation failed: {e}")
