"""Voice Analyzer - Analyze voice characteristics using VoiceEncoder"""
import numpy as np
import librosa
import torch
from pathlib import Path
from typing import Optional
from dataclasses import dataclass
import sys

# Add whisperall to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "src"))

from whisperall.models.voice_encoder import VoiceEncoder
from whisperall.models.voice_encoder.melspec import melspectrogram
from whisperall.models.voice_encoder.config import VoiceEncConfig


@dataclass
class VoiceAnalysis:
    """Analysis results for a voice"""
    embedding: np.ndarray  # 256-dim speaker embedding
    duration_seconds: float
    pitch_mean: float  # Hz
    pitch_std: float
    pitch_category: str  # "low", "medium", "high"
    energy_mean: float
    energy_category: str  # "soft", "moderate", "loud"
    tempo_category: str  # "slow", "normal", "fast" (based on silence ratio)
    description: str  # Auto-generated description


class VoiceAnalyzer:
    """Analyze voice characteristics from audio files"""

    def __init__(self, device: str = None):
        if device is None:
            device = "cuda" if torch.cuda.is_available() else "cpu"
        self.device = device
        self._encoder: Optional[VoiceEncoder] = None
        self.hp = VoiceEncConfig()

    def _load_encoder(self) -> VoiceEncoder:
        """Lazy load the voice encoder"""
        if self._encoder is None:
            from huggingface_hub import hf_hub_download
            import os

            print("Loading VoiceEncoder for voice analysis...")
            print("(This will download the model on first use, ~100MB)")

            try:
                # Download encoder weights
                ve_path = hf_hub_download(
                    repo_id="ResembleAI/chatterbox",
                    filename="ve.safetensors"
                )

                # Load encoder
                from safetensors.torch import load_file
                self._encoder = VoiceEncoder(self.hp)
                state_dict = load_file(ve_path)
                self._encoder.load_state_dict(state_dict)
                self._encoder.to(self.device)
                self._encoder.eval()
                print(f"VoiceEncoder loaded successfully on {self.device}")

            except Exception as e:
                raise RuntimeError(
                    f"Failed to load VoiceEncoder. The model will be downloaded automatically. "
                    f"Error: {str(e)}"
                )

        return self._encoder

    def analyze(self, audio_path: str) -> VoiceAnalysis:
        """
        Analyze a voice audio file

        Args:
            audio_path: Path to audio file (WAV, MP3, FLAC, etc.)

        Returns:
            VoiceAnalysis with embedding and characteristics
        """
        # Load audio
        wav, sr = librosa.load(audio_path, sr=None)
        duration = len(wav) / sr

        # Get speaker embedding
        encoder = self._load_encoder()
        with torch.inference_mode():
            embedding = encoder.embeds_from_wavs([wav], sr, as_spk=True)

        # Analyze pitch (F0)
        f0, voiced_flag, _ = librosa.pyin(
            wav,
            fmin=librosa.note_to_hz('C2'),  # ~65 Hz
            fmax=librosa.note_to_hz('C6'),  # ~1047 Hz
            sr=sr
        )
        f0_valid = f0[~np.isnan(f0)]

        if len(f0_valid) > 0:
            pitch_mean = float(np.mean(f0_valid))
            pitch_std = float(np.std(f0_valid))
        else:
            pitch_mean = 150.0  # Default
            pitch_std = 30.0

        # Categorize pitch
        if pitch_mean < 130:
            pitch_category = "low"
            pitch_desc = "grave"
        elif pitch_mean < 200:
            pitch_category = "medium"
            pitch_desc = "medio"
        else:
            pitch_category = "high"
            pitch_desc = "agudo"

        # Analyze energy/loudness
        rms = librosa.feature.rms(y=wav)[0]
        energy_mean = float(np.mean(rms))

        if energy_mean < 0.02:
            energy_category = "soft"
            energy_desc = "suave"
        elif energy_mean < 0.08:
            energy_category = "moderate"
            energy_desc = "moderada"
        else:
            energy_category = "loud"
            energy_desc = "fuerte"

        # Analyze tempo/pacing based on silence ratio
        intervals = librosa.effects.split(wav, top_db=20)
        if len(intervals) > 0:
            voiced_duration = sum(end - start for start, end in intervals) / sr
            silence_ratio = 1 - (voiced_duration / duration)
        else:
            silence_ratio = 0.5

        if silence_ratio > 0.4:
            tempo_category = "slow"
            tempo_desc = "pausada"
        elif silence_ratio > 0.2:
            tempo_category = "normal"
            tempo_desc = "natural"
        else:
            tempo_category = "fast"
            tempo_desc = "rápida"

        # Determine gender hint from pitch (rough estimate)
        if pitch_mean < 165:
            gender_hint = "masculina"
        elif pitch_mean > 200:
            gender_hint = "femenina"
        else:
            gender_hint = "neutral"

        # Generate description
        description = f"Voz {gender_hint}, tono {pitch_desc}, intensidad {energy_desc}, cadencia {tempo_desc}"

        return VoiceAnalysis(
            embedding=embedding,
            duration_seconds=duration,
            pitch_mean=pitch_mean,
            pitch_std=pitch_std,
            pitch_category=pitch_category,
            energy_mean=energy_mean,
            energy_category=energy_category,
            tempo_category=tempo_category,
            description=description
        )

    def compare_voices(self, embedding1: np.ndarray, embedding2: np.ndarray) -> float:
        """
        Calculate similarity between two voice embeddings

        Args:
            embedding1: First voice embedding (256-dim)
            embedding2: Second voice embedding (256-dim)

        Returns:
            Similarity score between 0 and 1 (1 = identical)
        """
        # Cosine similarity (embeddings are already L2-normalized)
        similarity = float(np.dot(embedding1, embedding2))
        # Convert from [-1, 1] to [0, 1]
        return (similarity + 1) / 2

    def get_embedding(self, audio_path: str) -> np.ndarray:
        """Get just the embedding without full analysis"""
        wav, sr = librosa.load(audio_path, sr=None)
        encoder = self._load_encoder()
        with torch.inference_mode():
            return encoder.embeds_from_wavs([wav], sr, as_spk=True)


# Singleton instance
_analyzer: Optional[VoiceAnalyzer] = None
_analyzer_device: Optional[str] = None

def get_voice_analyzer(device: Optional[str] = None) -> VoiceAnalyzer:
    """Get or create the VoiceAnalyzer singleton"""
    global _analyzer, _analyzer_device
    if device is None:
        device = "cuda" if torch.cuda.is_available() else "cpu"
    if _analyzer is None or _analyzer_device != device:
        _analyzer = VoiceAnalyzer(device=device)
        _analyzer_device = device
    return _analyzer

