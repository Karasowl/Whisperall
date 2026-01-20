"""
Audio Preprocessor for Voice Training
Handles normalization, resampling, silence removal, and segmentation
"""

from __future__ import annotations

import numpy as np
from pathlib import Path
from typing import Optional, List, Tuple
import soundfile as sf


class AudioPreprocessor:
    """Preprocesses audio files for voice training"""

    def __init__(
        self,
        target_sample_rate: int = 22050,
        target_db: float = -20.0,
        min_segment_duration: float = 1.0,
        max_segment_duration: float = 15.0,
        silence_threshold_db: float = -40.0,
        min_silence_duration: float = 0.3,
    ):
        self.target_sample_rate = target_sample_rate
        self.target_db = target_db
        self.min_segment_duration = min_segment_duration
        self.max_segment_duration = max_segment_duration
        self.silence_threshold_db = silence_threshold_db
        self.min_silence_duration = min_silence_duration

    def load_audio(self, audio_path: str) -> Tuple[np.ndarray, int]:
        """Load audio file and return (samples, sample_rate)"""
        audio, sr = sf.read(audio_path, dtype='float32')

        # Convert to mono if stereo
        if len(audio.shape) > 1:
            audio = audio.mean(axis=1)

        return audio, sr

    def resample(self, audio: np.ndarray, src_sr: int, target_sr: int) -> np.ndarray:
        """Resample audio to target sample rate"""
        if src_sr == target_sr:
            return audio

        try:
            import librosa
            return librosa.resample(audio, orig_sr=src_sr, target_sr=target_sr)
        except ImportError:
            # Fallback to scipy
            from scipy import signal
            duration = len(audio) / src_sr
            target_length = int(duration * target_sr)
            return signal.resample(audio, target_length)

    def normalize_volume(self, audio: np.ndarray, target_db: float = -20.0) -> np.ndarray:
        """Normalize audio to target dB level"""
        # Calculate current RMS
        rms = np.sqrt(np.mean(audio ** 2))
        if rms < 1e-10:
            return audio

        # Calculate target RMS
        target_rms = 10 ** (target_db / 20)

        # Apply gain
        gain = target_rms / rms
        return audio * gain

    def remove_silence(
        self,
        audio: np.ndarray,
        sample_rate: int,
        threshold_db: float = -40.0,
        min_silence_duration: float = 0.3,
    ) -> np.ndarray:
        """Remove long silences from audio"""
        # Convert threshold to amplitude
        threshold = 10 ** (threshold_db / 20)

        # Calculate frame energy
        frame_length = int(sample_rate * 0.025)  # 25ms frames
        hop_length = int(sample_rate * 0.010)    # 10ms hop

        # Calculate RMS energy for each frame
        num_frames = 1 + (len(audio) - frame_length) // hop_length
        energies = np.zeros(num_frames)

        for i in range(num_frames):
            start = i * hop_length
            end = start + frame_length
            frame = audio[start:end]
            energies[i] = np.sqrt(np.mean(frame ** 2))

        # Find non-silent regions
        is_voiced = energies > threshold

        # Expand voiced regions slightly
        min_silence_frames = int(min_silence_duration * sample_rate / hop_length)

        # Find continuous silent regions
        output_audio = []
        in_silence = False
        silence_start = 0

        for i, voiced in enumerate(is_voiced):
            if voiced:
                if in_silence:
                    silence_length = i - silence_start
                    if silence_length < min_silence_frames:
                        # Keep short silences
                        start_sample = silence_start * hop_length
                        end_sample = i * hop_length
                        output_audio.append(audio[start_sample:end_sample])
                    in_silence = False

                start_sample = i * hop_length
                end_sample = start_sample + hop_length
                output_audio.append(audio[start_sample:end_sample])
            else:
                if not in_silence:
                    in_silence = True
                    silence_start = i

        if output_audio:
            return np.concatenate(output_audio)
        return audio

    def segment_audio(
        self,
        audio: np.ndarray,
        sample_rate: int,
        min_duration: float = 1.0,
        max_duration: float = 15.0,
    ) -> List[Tuple[np.ndarray, float, float]]:
        """
        Split audio into segments.
        Returns list of (audio_segment, start_time, end_time)
        """
        total_duration = len(audio) / sample_rate

        if total_duration <= max_duration:
            return [(audio, 0.0, total_duration)]

        segments = []
        current_pos = 0
        min_samples = int(min_duration * sample_rate)
        max_samples = int(max_duration * sample_rate)

        while current_pos < len(audio):
            # Try to find a good split point (silence)
            end_pos = min(current_pos + max_samples, len(audio))

            if end_pos < len(audio):
                # Look for silence in the last 20% of the segment
                search_start = end_pos - int(max_samples * 0.2)
                search_region = audio[search_start:end_pos]

                # Find quietest point
                frame_length = int(sample_rate * 0.025)
                min_energy = float('inf')
                best_split = end_pos

                for i in range(0, len(search_region) - frame_length, frame_length // 2):
                    frame = search_region[i:i + frame_length]
                    energy = np.sqrt(np.mean(frame ** 2))
                    if energy < min_energy:
                        min_energy = energy
                        best_split = search_start + i

                end_pos = best_split

            segment = audio[current_pos:end_pos]

            # Only include if long enough
            if len(segment) >= min_samples:
                start_time = current_pos / sample_rate
                end_time = end_pos / sample_rate
                segments.append((segment, start_time, end_time))

            current_pos = end_pos

        return segments

    def process_file(
        self,
        input_path: str,
        output_path: Optional[str] = None,
    ) -> dict:
        """
        Process a single audio file.
        Returns dict with processing info.
        """
        # Load audio
        audio, sr = self.load_audio(input_path)
        original_duration = len(audio) / sr

        # Resample
        if sr != self.target_sample_rate:
            audio = self.resample(audio, sr, self.target_sample_rate)
            sr = self.target_sample_rate

        # Normalize volume
        audio = self.normalize_volume(audio, self.target_db)

        # Remove silence
        audio = self.remove_silence(
            audio, sr,
            threshold_db=self.silence_threshold_db,
            min_silence_duration=self.min_silence_duration
        )

        processed_duration = len(audio) / sr

        # Save if output path provided
        if output_path:
            sf.write(output_path, audio, sr)

        return {
            "original_duration": original_duration,
            "processed_duration": processed_duration,
            "sample_rate": sr,
            "removed_silence_seconds": original_duration - processed_duration,
        }

    def process_and_segment(
        self,
        input_path: str,
        output_dir: str,
        filename_prefix: str = "segment",
    ) -> List[dict]:
        """
        Process audio and split into segments.
        Returns list of segment info dicts.
        """
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)

        # Load and preprocess
        audio, sr = self.load_audio(input_path)

        if sr != self.target_sample_rate:
            audio = self.resample(audio, sr, self.target_sample_rate)
            sr = self.target_sample_rate

        audio = self.normalize_volume(audio, self.target_db)

        # Segment
        segments = self.segment_audio(
            audio, sr,
            min_duration=self.min_segment_duration,
            max_duration=self.max_segment_duration
        )

        # Save segments
        results = []
        for i, (segment, start_time, end_time) in enumerate(segments):
            filename = f"{filename_prefix}_{i:04d}.wav"
            output_path = output_dir / filename

            sf.write(str(output_path), segment, sr)

            results.append({
                "filename": filename,
                "path": str(output_path),
                "start_time": start_time,
                "end_time": end_time,
                "duration": end_time - start_time,
            })

        return results
