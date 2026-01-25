"""MMAudio SFX Provider - Video-to-audio sound effects generation"""

import torch
import numpy as np
from pathlib import Path
from typing import Optional, List

from .base import SFXProvider, SFXProviderInfo


class MMAudioProvider(SFXProvider):
    """Provider for MMAudio - Video-synchronized sound effects generation"""

    def __init__(self, device: Optional[str] = None):
        super().__init__(device)
        self._model = None
        self._feature_extractor = None

    @classmethod
    def get_info(cls) -> SFXProviderInfo:
        return SFXProviderInfo(
            id="mmaudio",
            name="MMAudio",
            description="Generate synchronized sound effects from video. Analyzes visual content and creates matching audio. ~6GB VRAM (FP16).",
            vram_requirement_gb=6.0,
            models=[
                {
                    "id": "mmaudio-small",
                    "name": "MMAudio Small",
                    "size_gb": 1.0,
                    "vram_gb": 4.0,
                    "description": "Faster generation, lighter on VRAM"
                },
                {
                    "id": "mmaudio-medium",
                    "name": "MMAudio Medium",
                    "size_gb": 2.0,
                    "vram_gb": 6.0,
                    "description": "Balanced quality and speed"
                },
                {
                    "id": "mmaudio-large",
                    "name": "MMAudio Large",
                    "size_gb": 3.5,
                    "vram_gb": 8.0,
                    "description": "Best quality, requires more VRAM"
                }
            ],
            default_model="mmaudio-medium",
            sample_rate=44100,
            max_video_duration_seconds=300,  # 5 minutes
            supports_prompt=True,
            extra_params={
                "num_inference_steps": {"type": "int", "default": 25, "min": 10, "max": 100},
                "guidance_scale": {"type": "float", "default": 4.5, "min": 1.0, "max": 10.0},
                "seed": {"type": "int", "default": -1, "min": -1, "max": 2147483647},
            }
        )

    def _check_installed(self) -> bool:
        """Check if MMAudio is installed"""
        try:
            import mmaudio
            return True
        except ImportError:
            return False

    def load(self, model: Optional[str] = None) -> None:
        """Load MMAudio model"""
        if not self._check_installed():
            raise RuntimeError(
                "MMAudio is not available. "
                "Install with: pip install mmaudio"
            )

        if self._model is not None:
            self._loaded = True
            return

        print(f"[MMAudio] Loading model on {self.device}...")

        try:
            from mmaudio import MMAudio

            model_id = model or "mmaudio-medium"

            # Map model IDs to actual model names
            model_map = {
                "mmaudio-small": "mmaudio/mmaudio-small-44k",
                "mmaudio-medium": "mmaudio/mmaudio-medium-44k",
                "mmaudio-large": "mmaudio/mmaudio-large-44k",
            }

            model_name = model_map.get(model_id, model_map["mmaudio-medium"])

            self._model = MMAudio.from_pretrained(model_name, device=self.device)

            self._loaded = True
            print("[MMAudio] Model loaded successfully")
        except Exception as e:
            raise RuntimeError(f"Failed to load MMAudio model: {e}")

    def unload(self) -> None:
        """Unload model"""
        if self._model is not None:
            del self._model
            self._model = None
        if self._feature_extractor is not None:
            del self._feature_extractor
            self._feature_extractor = None
        self._loaded = False
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        print("[MMAudio] Model unloaded")

    def generate(
        self,
        video_path: str,
        prompt: Optional[str] = None,
        model: Optional[str] = None,
        seed: int = -1,
        num_inference_steps: int = 25,
        guidance_scale: float = 4.5,
        negative_prompt: Optional[str] = None,
        **kwargs
    ) -> tuple[np.ndarray, int]:
        """Generate sound effects from video using MMAudio"""

        if self._model is None:
            self.load(model)

        video_path = Path(video_path)
        if not video_path.exists():
            raise FileNotFoundError(f"Video file not found: {video_path}")

        print(f"[MMAudio] Generating SFX for: {video_path.name}")
        if prompt:
            print(f"[MMAudio] Prompt: {prompt[:50]}...")

        # Set seed
        if seed >= 0:
            torch.manual_seed(seed)
            if torch.cuda.is_available():
                torch.cuda.manual_seed(seed)
        else:
            seed = torch.randint(0, 2147483647, (1,)).item()
            torch.manual_seed(seed)

        try:
            # Generate audio
            audio = self._model.generate(
                video=str(video_path),
                prompt=prompt,
                negative_prompt=negative_prompt or "low quality, noise, distortion",
                num_inference_steps=num_inference_steps,
                guidance_scale=guidance_scale,
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
            raise RuntimeError(f"MMAudio generation failed: {e}")

    def merge_audio_with_video(
        self,
        video_path: str,
        audio: np.ndarray,
        sample_rate: int,
        output_path: str,
        mix_original: bool = False,
        original_volume: float = 0.3,
    ) -> str:
        """
        Merge generated audio with video.

        Args:
            video_path: Path to original video
            audio: Generated audio array
            sample_rate: Sample rate of generated audio
            output_path: Path for output video with audio
            mix_original: If True, mix with original audio
            original_volume: Volume of original audio (0.0-1.0) when mixing

        Returns:
            Path to output video
        """
        import subprocess
        import tempfile
        import soundfile as sf

        # Save generated audio to temp file
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            temp_audio = f.name
            sf.write(temp_audio, audio, sample_rate)

        try:
            if mix_original:
                # Mix original and generated audio
                cmd = [
                    "ffmpeg", "-y",
                    "-i", video_path,
                    "-i", temp_audio,
                    "-filter_complex",
                    f"[0:a]volume={original_volume}[a0];[1:a]volume=1.0[a1];[a0][a1]amix=inputs=2:duration=longest[aout]",
                    "-map", "0:v",
                    "-map", "[aout]",
                    "-c:v", "copy",
                    "-c:a", "aac",
                    output_path
                ]
            else:
                # Replace audio entirely
                cmd = [
                    "ffmpeg", "-y",
                    "-i", video_path,
                    "-i", temp_audio,
                    "-map", "0:v",
                    "-map", "1:a",
                    "-c:v", "copy",
                    "-c:a", "aac",
                    "-shortest",
                    output_path
                ]

            subprocess.run(cmd, check=True, capture_output=True)
            return output_path

        finally:
            Path(temp_audio).unlink(missing_ok=True)
