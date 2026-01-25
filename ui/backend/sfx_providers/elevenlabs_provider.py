"""ElevenLabs Sound Effects Provider - Text-to-sound effects generation via API"""

import numpy as np
from typing import Optional, Dict

from .base import SFXProvider, SFXProviderInfo
from core.api_provider import BaseAPIProvider, APIProviderConfig
from core.audio import decode_audio_bytes


class ElevenLabsSFXProvider(BaseAPIProvider, SFXProvider):
    """Provider for ElevenLabs Sound Effects API - 12.5 minutes/month in Starter plan"""

    CONFIG = APIProviderConfig(
        provider_id="elevenlabs",
        provider_name="ElevenLabs SFX",
        api_key_name="elevenlabs",
        base_url="https://api.elevenlabs.io"
    )

    def __init__(self, device: Optional[str] = None):
        BaseAPIProvider.__init__(self)
        # API provider doesn't use device, but keep for interface compatibility
        self.device = device or "api"
        self._loaded = True  # API is always "loaded"

    def _get_auth_header(self, api_key: str) -> Dict[str, str]:
        """ElevenLabs uses xi-api-key header."""
        return {"xi-api-key": api_key}

    @classmethod
    def get_info(cls) -> SFXProviderInfo:
        return SFXProviderInfo(
            id="elevenlabs",
            name="ElevenLabs SFX",
            description="AI-powered text-to-sound effects. 750 seconds (~12.5 min) per month in Starter plan. High-quality cinematic sounds.",
            vram_requirement_gb=0.0,  # API-based, no local VRAM needed
            models=[
                {
                    "id": "eleven_text_to_sound_v2",
                    "name": "Sound Effects V2",
                    "size_gb": 0,
                    "vram_gb": 0,
                    "description": "Latest model with looping support"
                }
            ],
            default_model="eleven_text_to_sound_v2",
            sample_rate=44100,
            max_video_duration_seconds=30,  # ElevenLabs max is 30 seconds
            supports_prompt=True,
            extra_params={
                "duration_seconds": {"type": "float", "default": None, "min": 0.5, "max": 30.0},
                "prompt_influence": {"type": "float", "default": 0.3, "min": 0.0, "max": 1.0},
                "loop": {"type": "bool", "default": False},
            }
        )

    def load(self, model: Optional[str] = None) -> None:
        """API provider is always ready - just verify API key exists"""
        if not self.validate_api_key():
            raise RuntimeError(
                "ElevenLabs API key not configured. "
                "Add your key in Settings > API Keys."
            )
        self._loaded = True

    def unload(self) -> None:
        """Nothing to unload for API provider"""
        self._loaded = False

    def generate(
        self,
        video_path: str = None,
        prompt: Optional[str] = None,
        model: Optional[str] = None,
        duration_seconds: Optional[float] = None,
        prompt_influence: float = 0.3,
        loop: bool = False,
        output_format: str = "mp3_44100_128",
        **kwargs
    ) -> tuple[np.ndarray, int]:
        """
        Generate sound effects from text prompt using ElevenLabs API.

        Note: video_path is ignored - this provider generates from text only.
        For video-synchronized SFX, use MMAudio provider instead.

        Args:
            video_path: Ignored (kept for interface compatibility)
            prompt: Text description of the sound effect to generate
            model: Model ID (default: eleven_text_to_sound_v2)
            duration_seconds: Duration in seconds (0.5-30), None for auto
            prompt_influence: How closely to follow the prompt (0-1)
            loop: Generate a looping sound effect
            output_format: Audio format (mp3_44100_128, wav, etc.)

        Returns:
            Tuple of (audio_array, sample_rate)
        """
        if not prompt:
            raise ValueError("ElevenLabs SFX requires a text prompt")

        model_id = model or "eleven_text_to_sound_v2"

        print(f"[ElevenLabs SFX] Generating: {prompt[:50]}...")

        # Build request body
        body = {
            "text": prompt,
            "model_id": model_id,
            "prompt_influence": prompt_influence,
        }

        if duration_seconds is not None:
            body["duration_seconds"] = max(0.5, min(30.0, duration_seconds))

        # Looping only supported in v2
        if loop and "v2" in model_id:
            body["loop"] = True

        # Make API request
        response = self.client.post(
            f"/v1/sound-generation",
            json=body,
            params={"output_format": output_format},
            headers={"Content-Type": "application/json"}
        )

        # Convert audio bytes to numpy array using core audio utilities
        audio_bytes = response.content
        audio, sr = decode_audio_bytes(audio_bytes, target_sample_rate=44100)

        print(f"[ElevenLabs SFX] Generated {len(audio)/44100:.1f}s of audio")
        return audio, 44100

    def generate_from_text(
        self,
        prompt: str,
        duration_seconds: Optional[float] = None,
        prompt_influence: float = 0.3,
        loop: bool = False,
    ) -> tuple[np.ndarray, int]:
        """
        Convenience method for text-only generation.

        This is the primary way to use ElevenLabs SFX - no video needed.
        """
        return self.generate(
            video_path=None,
            prompt=prompt,
            duration_seconds=duration_seconds,
            prompt_influence=prompt_influence,
            loop=loop,
        )
