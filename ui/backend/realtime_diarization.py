"""
Real-time Speaker Diarization Service - Track speakers in streaming audio.

Uses voice embeddings and cosine similarity to identify and track speakers
without requiring Pyannote or HuggingFace tokens.
"""

from __future__ import annotations

import tempfile
import time
import wave
from pathlib import Path
from typing import Optional, List, Dict, Tuple
from dataclasses import dataclass, field
import numpy as np

from sklearn.metrics.pairwise import cosine_similarity


@dataclass
class Speaker:
    """Represents a detected speaker."""
    id: int
    name: str
    embeddings: List[np.ndarray] = field(default_factory=list)
    last_seen: float = 0.0
    segment_count: int = 0

    @property
    def centroid(self) -> Optional[np.ndarray]:
        """Get the centroid embedding for this speaker."""
        if not self.embeddings:
            return None
        return np.mean(self.embeddings, axis=0)


@dataclass
class SpeakerSegment:
    """A segment of audio with speaker identification."""
    speaker_id: int
    speaker_name: str
    text: str
    start_time: float
    end_time: float
    confidence: float
    embedding: Optional[np.ndarray] = None


class RealtimeDiarizationService:
    """
    Real-time speaker diarization using voice embeddings.

    This service maintains a bank of speaker embeddings and assigns
    incoming audio segments to existing speakers or creates new ones.
    """

    def __init__(
        self,
        similarity_threshold: float = 0.75,
        max_speakers: int = 10,
        max_embeddings_per_speaker: int = 20,
        speaker_timeout_seconds: float = 300.0,  # 5 minutes
    ):
        """
        Initialize the diarization service.

        Args:
            similarity_threshold: Minimum cosine similarity to match a speaker (0-1)
            max_speakers: Maximum number of speakers to track
            max_embeddings_per_speaker: Maximum embeddings to keep per speaker
            speaker_timeout_seconds: Remove speakers not seen for this duration
        """
        self._voice_analyzer = None
        self._voice_analyzer_device = None
        self._speakers: Dict[int, Speaker] = {}
        self._next_speaker_id = 1
        self._similarity_threshold = similarity_threshold
        self._max_speakers = max_speakers
        self._max_embeddings_per_speaker = max_embeddings_per_speaker
        self._speaker_timeout = speaker_timeout_seconds
        self._session_start_time = time.time()

    def _get_voice_analyzer(self):
        """Lazy load voice analyzer."""
        if self._voice_analyzer is None:
            import torch
            device = "cuda" if torch.cuda.is_available() else "cpu"

            from voice_analyzer import get_voice_analyzer
            self._voice_analyzer = get_voice_analyzer(device=device)
            self._voice_analyzer_device = device

        return self._voice_analyzer

    def reset(self):
        """Reset the speaker bank for a new session."""
        self._speakers.clear()
        self._next_speaker_id = 1
        self._session_start_time = time.time()

    def get_speakers(self) -> List[Speaker]:
        """Get list of currently tracked speakers."""
        return list(self._speakers.values())

    def get_speaker(self, speaker_id: int) -> Optional[Speaker]:
        """Get a specific speaker by ID."""
        return self._speakers.get(speaker_id)

    def _cleanup_old_speakers(self):
        """Remove speakers that haven't been seen recently."""
        current_time = time.time()
        to_remove = []

        for speaker_id, speaker in self._speakers.items():
            if current_time - speaker.last_seen > self._speaker_timeout:
                to_remove.append(speaker_id)

        for speaker_id in to_remove:
            del self._speakers[speaker_id]

    def _extract_embedding(self, audio_path: Path) -> Optional[np.ndarray]:
        """Extract voice embedding from audio file."""
        try:
            analyzer = self._get_voice_analyzer()
            embedding = analyzer.get_embedding(str(audio_path))
            return embedding.flatten()
        except Exception as e:
            print(f"[RealtimeDiarization] Embedding extraction failed: {e}")
            return None

    def _extract_embedding_from_bytes(
        self,
        audio_data: bytes,
        sample_rate: int = 16000,
        channels: int = 1,
        sample_width: int = 2
    ) -> Optional[np.ndarray]:
        """Extract voice embedding from raw audio bytes."""
        # Save to temporary file
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
            temp_path = Path(f.name)
            with wave.open(f.name, 'wb') as wf:
                wf.setnchannels(channels)
                wf.setsampwidth(sample_width)
                wf.setframerate(sample_rate)
                wf.writeframes(audio_data)

        try:
            embedding = self._extract_embedding(temp_path)
            return embedding
        finally:
            temp_path.unlink(missing_ok=True)

    def _find_matching_speaker(self, embedding: np.ndarray) -> Tuple[Optional[Speaker], float]:
        """
        Find the speaker that best matches the given embedding.

        Returns:
            Tuple of (matching_speaker, similarity_score)
            If no match found, returns (None, 0.0)
        """
        if not self._speakers:
            return None, 0.0

        best_speaker = None
        best_similarity = 0.0

        for speaker in self._speakers.values():
            centroid = speaker.centroid
            if centroid is None:
                continue

            # Calculate cosine similarity
            similarity = cosine_similarity(
                embedding.reshape(1, -1),
                centroid.reshape(1, -1)
            )[0, 0]

            if similarity > best_similarity:
                best_similarity = similarity
                best_speaker = speaker

        if best_similarity >= self._similarity_threshold:
            return best_speaker, best_similarity

        return None, best_similarity

    def _create_speaker(self, embedding: np.ndarray) -> Speaker:
        """Create a new speaker with the given embedding."""
        speaker_id = self._next_speaker_id
        self._next_speaker_id += 1

        speaker = Speaker(
            id=speaker_id,
            name=f"Speaker {speaker_id}",
            embeddings=[embedding],
            last_seen=time.time(),
            segment_count=1
        )

        self._speakers[speaker_id] = speaker
        return speaker

    def _update_speaker(self, speaker: Speaker, embedding: np.ndarray):
        """Update a speaker with a new embedding."""
        speaker.embeddings.append(embedding)
        speaker.last_seen = time.time()
        speaker.segment_count += 1

        # Limit number of embeddings
        if len(speaker.embeddings) > self._max_embeddings_per_speaker:
            # Keep most recent embeddings
            speaker.embeddings = speaker.embeddings[-self._max_embeddings_per_speaker:]

    def identify_speaker(
        self,
        audio_data: bytes,
        sample_rate: int = 16000,
        channels: int = 1,
        sample_width: int = 2,
        min_duration_seconds: float = 0.5
    ) -> Tuple[int, str, float]:
        """
        Identify the speaker from audio data.

        Args:
            audio_data: Raw audio bytes
            sample_rate: Sample rate of audio
            channels: Number of audio channels
            sample_width: Bytes per sample
            min_duration_seconds: Minimum duration to process

        Returns:
            Tuple of (speaker_id, speaker_name, confidence)
        """
        # Check duration
        num_samples = len(audio_data) // (channels * sample_width)
        duration = num_samples / sample_rate

        if duration < min_duration_seconds:
            # Too short, return unknown
            return 0, "Unknown", 0.0

        # Extract embedding
        embedding = self._extract_embedding_from_bytes(
            audio_data, sample_rate, channels, sample_width
        )

        if embedding is None:
            return 0, "Unknown", 0.0

        # Cleanup old speakers
        self._cleanup_old_speakers()

        # Check if we've reached max speakers
        if len(self._speakers) >= self._max_speakers:
            # Only match existing speakers, don't create new
            speaker, confidence = self._find_matching_speaker(embedding)
            if speaker:
                self._update_speaker(speaker, embedding)
                return speaker.id, speaker.name, confidence
            return 0, "Unknown", 0.0

        # Try to match existing speaker
        speaker, confidence = self._find_matching_speaker(embedding)

        if speaker:
            self._update_speaker(speaker, embedding)
            return speaker.id, speaker.name, confidence

        # Create new speaker
        speaker = self._create_speaker(embedding)
        return speaker.id, speaker.name, 1.0

    def identify_speaker_from_file(
        self,
        audio_path: Path,
        min_duration_seconds: float = 0.5
    ) -> Tuple[int, str, float]:
        """
        Identify the speaker from an audio file.

        Args:
            audio_path: Path to audio file
            min_duration_seconds: Minimum duration to process

        Returns:
            Tuple of (speaker_id, speaker_name, confidence)
        """
        # Check duration
        try:
            with wave.open(str(audio_path), 'rb') as wf:
                frames = wf.getnframes()
                rate = wf.getframerate()
                duration = frames / rate
        except Exception:
            duration = 1.0  # Assume valid

        if duration < min_duration_seconds:
            return 0, "Unknown", 0.0

        # Extract embedding
        embedding = self._extract_embedding(audio_path)

        if embedding is None:
            return 0, "Unknown", 0.0

        # Cleanup old speakers
        self._cleanup_old_speakers()

        # Check max speakers
        if len(self._speakers) >= self._max_speakers:
            speaker, confidence = self._find_matching_speaker(embedding)
            if speaker:
                self._update_speaker(speaker, embedding)
                return speaker.id, speaker.name, confidence
            return 0, "Unknown", 0.0

        # Try to match or create
        speaker, confidence = self._find_matching_speaker(embedding)

        if speaker:
            self._update_speaker(speaker, embedding)
            return speaker.id, speaker.name, confidence

        speaker = self._create_speaker(embedding)
        return speaker.id, speaker.name, 1.0

    def process_segment(
        self,
        text: str,
        audio_data: bytes,
        start_time: float,
        end_time: float,
        sample_rate: int = 16000,
        channels: int = 1,
        sample_width: int = 2
    ) -> SpeakerSegment:
        """
        Process a transcription segment and identify the speaker.

        Args:
            text: Transcribed text
            audio_data: Raw audio bytes for the segment
            start_time: Start time in seconds
            end_time: End time in seconds
            sample_rate: Sample rate
            channels: Number of channels
            sample_width: Bytes per sample

        Returns:
            SpeakerSegment with speaker identification
        """
        speaker_id, speaker_name, confidence = self.identify_speaker(
            audio_data, sample_rate, channels, sample_width
        )

        return SpeakerSegment(
            speaker_id=speaker_id,
            speaker_name=speaker_name,
            text=text,
            start_time=start_time,
            end_time=end_time,
            confidence=confidence
        )

    def rename_speaker(self, speaker_id: int, new_name: str) -> bool:
        """Rename a speaker."""
        speaker = self._speakers.get(speaker_id)
        if speaker:
            speaker.name = new_name
            return True
        return False

    def merge_speakers(self, source_id: int, target_id: int) -> bool:
        """Merge source speaker into target speaker."""
        source = self._speakers.get(source_id)
        target = self._speakers.get(target_id)

        if not source or not target:
            return False

        # Merge embeddings
        target.embeddings.extend(source.embeddings)
        target.segment_count += source.segment_count

        # Limit embeddings
        if len(target.embeddings) > self._max_embeddings_per_speaker:
            target.embeddings = target.embeddings[-self._max_embeddings_per_speaker:]

        # Remove source
        del self._speakers[source_id]

        return True

    def get_session_stats(self) -> Dict:
        """Get statistics about the current diarization session."""
        return {
            "num_speakers": len(self._speakers),
            "session_duration": time.time() - self._session_start_time,
            "speakers": [
                {
                    "id": s.id,
                    "name": s.name,
                    "segment_count": s.segment_count,
                    "last_seen_ago": time.time() - s.last_seen
                }
                for s in self._speakers.values()
            ]
        }


# Singleton instance
_service: Optional[RealtimeDiarizationService] = None


def get_realtime_diarization_service() -> RealtimeDiarizationService:
    """Get singleton realtime diarization service instance."""
    global _service
    if _service is None:
        _service = RealtimeDiarizationService()
    return _service
