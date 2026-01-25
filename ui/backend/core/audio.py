"""Unified audio format conversion utilities.

This module centralizes audio processing functions that were previously
duplicated across multiple providers (TTS, SFX, Music).
"""

import io
import wave
import logging
from typing import Tuple, Optional, Union
from pathlib import Path

import numpy as np

logger = logging.getLogger(__name__)


def decode_audio_bytes(
    audio_bytes: bytes,
    target_sample_rate: Optional[int] = None,
    to_mono: bool = True
) -> Tuple[np.ndarray, int]:
    """
    Decode audio bytes to numpy array.

    Tries soundfile first, falls back to pydub.
    Supports: WAV, MP3, FLAC, OGG, and other common formats.

    Args:
        audio_bytes: Raw audio bytes
        target_sample_rate: Resample to this rate if provided
        to_mono: Convert to mono if True

    Returns:
        Tuple of (audio_array as float32, sample_rate)

    Raises:
        RuntimeError: If decoding fails with all backends
    """
    # Try soundfile first (faster, fewer dependencies)
    audio_array, sample_rate = _decode_with_soundfile(audio_bytes)

    # Fallback to pydub
    if audio_array is None:
        audio_array, sample_rate = _decode_with_pydub(audio_bytes)

    if audio_array is None:
        raise RuntimeError(
            "Failed to decode audio. Install 'soundfile' or 'pydub' package."
        )

    # Ensure float32
    audio_array = normalize_audio(audio_array)

    # Convert to mono if needed
    if to_mono and len(audio_array.shape) > 1:
        audio_array = audio_array.mean(axis=1)

    # Resample if needed
    if target_sample_rate and sample_rate != target_sample_rate:
        audio_array = resample_audio(audio_array, sample_rate, target_sample_rate)
        sample_rate = target_sample_rate

    return audio_array, sample_rate


def _decode_with_soundfile(audio_bytes: bytes) -> Tuple[Optional[np.ndarray], int]:
    """Decode using soundfile."""
    try:
        import soundfile as sf
        with io.BytesIO(audio_bytes) as audio_io:
            audio_array, sample_rate = sf.read(audio_io)
        return audio_array.astype(np.float32), sample_rate
    except ImportError:
        logger.debug("soundfile not available")
        return None, 0
    except Exception as e:
        logger.debug(f"soundfile decode failed: {e}")
        return None, 0


def _decode_with_pydub(audio_bytes: bytes) -> Tuple[Optional[np.ndarray], int]:
    """Decode using pydub (fallback)."""
    try:
        from pydub import AudioSegment

        audio_io = io.BytesIO(audio_bytes)
        segment = AudioSegment.from_file(audio_io)

        sample_rate = segment.frame_rate
        samples = np.array(segment.get_array_of_samples(), dtype=np.float32)

        # Normalize based on sample width
        if segment.sample_width == 1:
            samples /= 128.0
        elif segment.sample_width == 2:
            samples /= 32768.0
        elif segment.sample_width == 4:
            samples /= 2147483648.0

        # Handle stereo
        if segment.channels == 2:
            samples = samples.reshape(-1, 2)

        return samples, sample_rate
    except ImportError:
        logger.debug("pydub not available")
        return None, 0
    except Exception as e:
        logger.debug(f"pydub decode failed: {e}")
        return None, 0


def normalize_audio(audio: np.ndarray) -> np.ndarray:
    """
    Normalize audio to float32 in range [-1, 1].

    Args:
        audio: Input audio array (any dtype)

    Returns:
        Normalized float32 array
    """
    # Convert to float32
    if audio.dtype != np.float32:
        if audio.dtype == np.int16:
            audio = audio.astype(np.float32) / 32768.0
        elif audio.dtype == np.int32:
            audio = audio.astype(np.float32) / 2147483648.0
        elif audio.dtype == np.uint8:
            audio = (audio.astype(np.float32) - 128) / 128.0
        else:
            audio = audio.astype(np.float32)

    # Clip to [-1, 1] if out of range
    max_val = np.abs(audio).max()
    if max_val > 1.0:
        audio = audio / max_val

    return audio


def resample_audio(
    audio: np.ndarray,
    orig_sr: int,
    target_sr: int
) -> np.ndarray:
    """
    Resample audio to target sample rate.

    Tries librosa first, falls back to scipy.

    Args:
        audio: Input audio array
        orig_sr: Original sample rate
        target_sr: Target sample rate

    Returns:
        Resampled audio array
    """
    if orig_sr == target_sr:
        return audio

    try:
        import librosa
        return librosa.resample(audio, orig_sr=orig_sr, target_sr=target_sr)
    except ImportError:
        pass

    try:
        from scipy import signal
        new_length = int(len(audio) * target_sr / orig_sr)
        return signal.resample(audio, new_length).astype(np.float32)
    except ImportError:
        pass

    logger.warning("Neither librosa nor scipy available for resampling")
    return audio


def encode_audio_wav(
    audio: np.ndarray,
    sample_rate: int,
    channels: int = 1
) -> bytes:
    """
    Encode numpy array to WAV bytes.

    Args:
        audio: Audio array (float32 or int16)
        sample_rate: Sample rate
        channels: Number of channels (1 for mono, 2 for stereo)

    Returns:
        WAV file bytes
    """
    # Convert to int16 if float
    if audio.dtype == np.float32:
        audio = (audio * 32767).clip(-32768, 32767).astype(np.int16)

    with io.BytesIO() as wav_io:
        with wave.open(wav_io, 'wb') as wav_file:
            wav_file.setnchannels(channels)
            wav_file.setsampwidth(2)  # 16-bit
            wav_file.setframerate(sample_rate)
            wav_file.writeframes(audio.tobytes())
        return wav_io.getvalue()


def save_audio_wav(
    audio: np.ndarray,
    sample_rate: int,
    path: Union[str, Path],
    channels: int = 1
) -> None:
    """
    Save audio array to WAV file.

    Args:
        audio: Audio array
        sample_rate: Sample rate
        path: Output file path
        channels: Number of channels
    """
    wav_bytes = encode_audio_wav(audio, sample_rate, channels)
    Path(path).write_bytes(wav_bytes)


def adjust_speed(
    audio: np.ndarray,
    sample_rate: int,
    speed: float
) -> np.ndarray:
    """
    Adjust audio playback speed (time-stretch without pitch change).

    Args:
        audio: Input audio array
        sample_rate: Sample rate
        speed: Speed factor (1.0 = normal, 2.0 = 2x faster)

    Returns:
        Speed-adjusted audio array
    """
    if speed == 1.0:
        return audio

    try:
        import librosa
        return librosa.effects.time_stretch(audio, rate=speed)
    except ImportError:
        pass

    # Fallback: simple resampling (changes pitch)
    try:
        from scipy import signal
        new_length = int(len(audio) / speed)
        return signal.resample(audio, new_length).astype(np.float32)
    except ImportError:
        pass

    logger.warning("Speed adjustment requires librosa or scipy")
    return audio


def torch_to_numpy(tensor) -> np.ndarray:
    """
    Convert PyTorch tensor to numpy array.

    Args:
        tensor: PyTorch tensor

    Returns:
        Numpy array (float32)
    """
    if hasattr(tensor, 'cpu'):
        tensor = tensor.cpu()
    if hasattr(tensor, 'detach'):
        tensor = tensor.detach()
    if hasattr(tensor, 'numpy'):
        return tensor.numpy().astype(np.float32)
    return np.array(tensor, dtype=np.float32)


def concatenate_audio_chunks(chunks: list) -> np.ndarray:
    """
    Concatenate audio chunks into single array.

    Handles various input types (numpy, torch, lists).

    Args:
        chunks: List of audio chunks

    Returns:
        Concatenated numpy array
    """
    if not chunks:
        return np.array([], dtype=np.float32)

    # Convert all chunks to numpy
    numpy_chunks = []
    for chunk in chunks:
        if chunk is None:
            continue
        if hasattr(chunk, 'audio'):
            # Handle objects with .audio attribute
            chunk = chunk.audio
        if chunk is None:
            continue
        numpy_chunks.append(torch_to_numpy(chunk))

    if not numpy_chunks:
        return np.array([], dtype=np.float32)

    return np.concatenate(numpy_chunks)
