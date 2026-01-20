"""
Dataset Manager for Voice Training
Handles audio files and transcriptions for training custom voices
"""

from __future__ import annotations

import json
import uuid
import shutil
from pathlib import Path
from typing import Optional, List, Dict, Any
from dataclasses import dataclass, asdict
import time

from app_paths import get_temp_dir


@dataclass
class DatasetEntry:
    """A single audio file with its transcription"""
    id: str
    filename: str
    audio_path: str
    transcription: str
    duration_seconds: float
    sample_rate: int
    is_valid: bool = True
    error: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "DatasetEntry":
        return cls(**data)


class DatasetManager:
    """Manages datasets for voice training"""

    def __init__(self, dataset_dir: Path):
        self.dataset_dir = Path(dataset_dir)
        self.audio_dir = self.dataset_dir / "audio"
        self.metadata_path = self.dataset_dir / "metadata.json"

        # Create directories
        self.dataset_dir.mkdir(parents=True, exist_ok=True)
        self.audio_dir.mkdir(parents=True, exist_ok=True)

        # Load existing metadata
        self._entries: Dict[str, DatasetEntry] = {}
        self._load_metadata()

    def _load_metadata(self):
        """Load metadata from disk"""
        if self.metadata_path.exists():
            try:
                with open(self.metadata_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    for entry_data in data.get("entries", []):
                        entry = DatasetEntry.from_dict(entry_data)
                        self._entries[entry.id] = entry
            except Exception as e:
                print(f"[DatasetManager] Failed to load metadata: {e}")

    def _save_metadata(self):
        """Save metadata to disk"""
        data = {
            "entries": [entry.to_dict() for entry in self._entries.values()],
            "updated_at": time.time(),
        }
        with open(self.metadata_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

    def add_audio(
        self,
        audio_path: str,
        transcription: str = "",
        filename: Optional[str] = None
    ) -> DatasetEntry:
        """Add an audio file to the dataset"""
        import soundfile as sf

        audio_path = Path(audio_path)
        if not audio_path.exists():
            raise FileNotFoundError(f"Audio file not found: {audio_path}")

        # Generate unique ID
        entry_id = str(uuid.uuid4())[:8]

        # Get audio info
        try:
            info = sf.info(str(audio_path))
            duration = info.duration
            sample_rate = info.samplerate
        except Exception as e:
            raise ValueError(f"Invalid audio file: {e}")

        # Copy file to dataset
        ext = audio_path.suffix or ".wav"
        if filename:
            dest_filename = f"{entry_id}_{filename}"
        else:
            dest_filename = f"{entry_id}{ext}"

        dest_path = self.audio_dir / dest_filename
        shutil.copy2(audio_path, dest_path)

        # Create entry
        entry = DatasetEntry(
            id=entry_id,
            filename=dest_filename,
            audio_path=str(dest_path),
            transcription=transcription,
            duration_seconds=duration,
            sample_rate=sample_rate,
        )

        self._entries[entry_id] = entry
        self._save_metadata()

        return entry

    def update_transcription(self, entry_id: str, transcription: str) -> Optional[DatasetEntry]:
        """Update transcription for an entry"""
        entry = self._entries.get(entry_id)
        if not entry:
            return None

        entry.transcription = transcription
        self._save_metadata()
        return entry

    def remove_entry(self, entry_id: str) -> bool:
        """Remove an entry from the dataset"""
        entry = self._entries.get(entry_id)
        if not entry:
            return False

        # Delete audio file
        audio_path = Path(entry.audio_path)
        if audio_path.exists():
            audio_path.unlink()

        del self._entries[entry_id]
        self._save_metadata()
        return True

    def get_entry(self, entry_id: str) -> Optional[DatasetEntry]:
        """Get an entry by ID"""
        return self._entries.get(entry_id)

    def list_entries(self) -> List[DatasetEntry]:
        """List all entries"""
        return list(self._entries.values())

    def get_stats(self) -> Dict[str, Any]:
        """Get dataset statistics"""
        entries = list(self._entries.values())
        total_duration = sum(e.duration_seconds for e in entries)
        valid_entries = [e for e in entries if e.is_valid]
        entries_with_transcription = [e for e in entries if e.transcription.strip()]

        return {
            "total_entries": len(entries),
            "valid_entries": len(valid_entries),
            "entries_with_transcription": len(entries_with_transcription),
            "total_duration_seconds": total_duration,
            "total_duration_minutes": total_duration / 60,
            "avg_duration_seconds": total_duration / len(entries) if entries else 0,
        }

    def transcribe_with_whisper(
        self,
        entry_id: Optional[str] = None,
        model: str = "base",
        language: str = "auto"
    ) -> Dict[str, str]:
        """
        Transcribe audio files using Whisper.
        If entry_id is None, transcribe all entries without transcription.
        Returns dict of entry_id -> transcription
        """
        try:
            import whisper
        except ImportError:
            raise RuntimeError("Whisper not installed. Install with: pip install openai-whisper")

        # Load Whisper model
        whisper_model = whisper.load_model(model)

        # Get entries to transcribe
        if entry_id:
            entries = [self._entries.get(entry_id)]
            entries = [e for e in entries if e is not None]
        else:
            entries = [e for e in self._entries.values() if not e.transcription.strip()]

        results = {}

        for entry in entries:
            try:
                result = whisper_model.transcribe(
                    entry.audio_path,
                    language=None if language == "auto" else language,
                )
                transcription = result["text"].strip()
                entry.transcription = transcription
                results[entry.id] = transcription
            except Exception as e:
                entry.error = str(e)
                results[entry.id] = f"ERROR: {e}"

        self._save_metadata()
        return results

    def export_for_training(self, output_dir: Path) -> Dict[str, Any]:
        """
        Export dataset in format suitable for StyleTTS2 training.
        Creates train.txt with format: audio_path|transcription
        """
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)

        # Copy audio files
        audio_output_dir = output_dir / "wavs"
        audio_output_dir.mkdir(exist_ok=True)

        train_lines = []
        valid_entries = [e for e in self._entries.values() if e.is_valid and e.transcription.strip()]

        for entry in valid_entries:
            # Copy audio
            src = Path(entry.audio_path)
            dst = audio_output_dir / entry.filename
            shutil.copy2(src, dst)

            # Add to train.txt
            rel_path = f"wavs/{entry.filename}"
            train_lines.append(f"{rel_path}|{entry.transcription}")

        # Write train.txt
        train_path = output_dir / "train.txt"
        with open(train_path, "w", encoding="utf-8") as f:
            f.write("\n".join(train_lines))

        return {
            "num_entries": len(valid_entries),
            "train_file": str(train_path),
            "audio_dir": str(audio_output_dir),
        }
