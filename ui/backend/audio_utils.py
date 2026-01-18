"""Audio utilities for chunking, concatenation, and format conversion"""
import re
import numpy as np
from pathlib import Path
from typing import Generator
import subprocess
import shutil


def split_into_sentences(text: str) -> list[str]:
    """Split text into sentences using regex"""
    # Handle common sentence endings
    # This regex splits on . ! ? followed by space or end of string
    # But preserves abbreviations like Mr. Mrs. Dr. etc.

    # First, protect common abbreviations
    protected = text
    abbreviations = ['Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Prof.', 'Sr.', 'Jr.', 'vs.', 'etc.', 'i.e.', 'e.g.']
    for abbr in abbreviations:
        protected = protected.replace(abbr, abbr.replace('.', '<DOT>'))

    # Split on sentence boundaries
    sentences = re.split(r'(?<=[.!?])\s+', protected)

    # Restore abbreviations
    sentences = [s.replace('<DOT>', '.') for s in sentences]

    # Filter empty strings
    sentences = [s.strip() for s in sentences if s.strip()]

    return sentences


def chunk_text(text: str, max_chars: int = 250) -> list[str]:
    """
    Split text into chunks suitable for TTS generation.

    Strategy:
    1. Split into sentences
    2. Group sentences until max_chars is reached
    3. Never split a sentence in the middle
    """
    sentences = split_into_sentences(text)
    chunks = []
    current_chunk = ""

    for sentence in sentences:
        # If single sentence exceeds max, we have to include it anyway
        if len(sentence) > max_chars:
            if current_chunk:
                chunks.append(current_chunk.strip())
                current_chunk = ""
            chunks.append(sentence)
            continue

        # Check if adding this sentence would exceed limit
        potential = current_chunk + " " + sentence if current_chunk else sentence

        if len(potential) <= max_chars:
            current_chunk = potential
        else:
            # Save current chunk and start new one
            if current_chunk:
                chunks.append(current_chunk.strip())
            current_chunk = sentence

    # Don't forget the last chunk
    if current_chunk:
        chunks.append(current_chunk.strip())

    return chunks


def concatenate_audio(
    audio_arrays: list[np.ndarray],
    sample_rate: int = 24000,
    crossfade_ms: int = 50
) -> np.ndarray:
    """
    Concatenate multiple audio arrays with crossfade for smooth transitions.

    Args:
        audio_arrays: List of audio numpy arrays
        sample_rate: Audio sample rate
        crossfade_ms: Crossfade duration in milliseconds

    Returns:
        Concatenated audio array
    """
    if not audio_arrays:
        return np.array([], dtype=np.float32)

    if len(audio_arrays) == 1:
        return audio_arrays[0]

    crossfade_samples = int(sample_rate * crossfade_ms / 1000)

    # Calculate total length
    total_length = sum(len(a) for a in audio_arrays)
    # Subtract overlap for each join
    total_length -= crossfade_samples * (len(audio_arrays) - 1)

    result = np.zeros(total_length, dtype=np.float32)
    position = 0

    for i, audio in enumerate(audio_arrays):
        if i == 0:
            # First chunk - just copy
            result[:len(audio)] = audio
            position = len(audio)
        else:
            # Apply crossfade with previous chunk
            fade_start = position - crossfade_samples

            # Create fade curves
            fade_out = np.linspace(1, 0, crossfade_samples, dtype=np.float32)
            fade_in = np.linspace(0, 1, crossfade_samples, dtype=np.float32)

            # Apply crossfade
            if crossfade_samples <= len(audio):
                result[fade_start:position] *= fade_out
                result[fade_start:position] += audio[:crossfade_samples] * fade_in

                # Copy rest of audio
                remaining = audio[crossfade_samples:]
                result[position:position + len(remaining)] = remaining
                position += len(remaining)
            else:
                # Audio shorter than crossfade, just append
                result[position:position + len(audio)] = audio
                position += len(audio)

    return result[:position]


def change_speed(audio: np.ndarray, sample_rate: int, speed: float) -> np.ndarray:
    """
    Change audio playback speed without changing pitch.
    Uses librosa for time stretching.

    Args:
        audio: Input audio array
        sample_rate: Sample rate
        speed: Speed factor (1.0 = normal, 0.5 = half speed, 2.0 = double speed)

    Returns:
        Speed-adjusted audio
    """
    if speed == 1.0:
        return audio

    try:
        import librosa
        # Time stretch: rate > 1 = faster, rate < 1 = slower
        stretched = librosa.effects.time_stretch(audio, rate=speed)
        return stretched
    except ImportError:
        print("Warning: librosa not available for speed change")
        return audio


def convert_format(
    input_path: str,
    output_path: str,
    format: str = "mp3",
    bitrate: str = "192k"
) -> str:
    """
    Convert audio file to different format using FFmpeg.

    Args:
        input_path: Path to input audio file
        output_path: Path for output file
        format: Output format (mp3, flac, ogg, etc.)
        bitrate: Bitrate for lossy formats

    Returns:
        Path to converted file
    """
    # Check if ffmpeg is available
    ffmpeg_path = shutil.which("ffmpeg")
    if not ffmpeg_path:
        raise RuntimeError("FFmpeg not found. Please install FFmpeg.")

    output_path = Path(output_path).with_suffix(f".{format}")

    cmd = [
        ffmpeg_path,
        "-y",  # Overwrite output
        "-i", str(input_path),
    ]

    if format == "mp3":
        cmd.extend(["-b:a", bitrate])
    elif format == "flac":
        cmd.extend(["-c:a", "flac"])
    elif format == "ogg":
        cmd.extend(["-c:a", "libvorbis", "-b:a", bitrate])

    cmd.append(str(output_path))

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg error: {result.stderr}")

    return str(output_path)


def estimate_duration(text: str, words_per_minute: int = 150) -> float:
    """
    Estimate audio duration in seconds based on text length.

    Args:
        text: Input text
        words_per_minute: Speaking rate (default 150 WPM for natural speech)

    Returns:
        Estimated duration in seconds
    """
    word_count = len(text.split())
    minutes = word_count / words_per_minute
    return minutes * 60


def estimate_generation_time(
    text: str,
    model_type: str = "multilingual",
    has_gpu: bool = True
) -> float:
    """
    Estimate generation time based on text length and model.

    Returns:
        Estimated time in seconds
    """
    chunks = chunk_text(text)
    num_chunks = len(chunks)

    # Rough estimates per chunk (in seconds)
    if has_gpu:
        time_per_chunk = {
            "turbo": 3,
            "original": 8,
            "multilingual": 8,
        }
    else:
        time_per_chunk = {
            "turbo": 30,
            "original": 60,
            "multilingual": 60,
        }

    base_time = time_per_chunk.get(model_type, 10)
    return num_chunks * base_time
