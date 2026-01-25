"""History Service - High-level API for managing history entries

Provides module-specific methods for saving and retrieving history,
handling file storage, and computing usage statistics.
"""

import shutil
import uuid
from pathlib import Path
from datetime import datetime
from typing import Optional, List, Dict, Any

from history_db import (
    HistoryDB,
    HistoryEntry,
    get_history_db,
    get_history_files_dir,
)

# Diagnostics
from diagnostics import log_function, error_context, log_info, log_error
from diagnostics.error_codes import ErrorCode


class HistoryService:
    """Service for managing history entries across all modules"""

    def __init__(self, db: Optional[HistoryDB] = None):
        self.db = db or get_history_db()
        self.files_dir = get_history_files_dir()

    def _get_entry_dir(self, module: str, entry_id: str) -> Path:
        """Get directory for storing files for a specific entry"""
        now = datetime.now()
        dir_path = self.files_dir / module / f"{now.year}-{now.month:02d}" / entry_id
        dir_path.mkdir(parents=True, exist_ok=True)
        return dir_path

    def _copy_file_to_history(
        self,
        source_path: str,
        module: str,
        entry_id: str,
        prefix: str = ""
    ) -> Optional[str]:
        """Copy a file to history storage and return the new path"""
        if not source_path:
            return None

        source = Path(source_path)
        if not source.exists():
            log_error("history", "_copy_file_to_history",
                      f"Source file not found: {source_path}", entry_id=entry_id)
            return None

        try:
            entry_dir = self._get_entry_dir(module, entry_id)
            filename = f"{prefix}_{source.name}" if prefix else source.name
            dest = entry_dir / filename

            shutil.copy2(source, dest)
            return str(dest)
        except Exception as e:
            log_error("history", "_copy_file_to_history",
                      f"Failed to copy file: {e}",
                      error_code=ErrorCode.HIST_DISK_FULL, exception=e, entry_id=entry_id)
            raise

    # =========================================================================
    # TTS (Text-to-Speech)
    # =========================================================================

    def save_tts_entry(
        self,
        text: str,
        audio_path: str,
        provider: str,
        model: Optional[str] = None,
        voice_id: Optional[str] = None,
        voice_name: Optional[str] = None,
        settings: Optional[Dict[str, Any]] = None,
        duration_seconds: Optional[float] = None,
        characters_count: Optional[int] = None,
    ) -> str:
        """Save a TTS generation to history"""
        entry_id = str(uuid.uuid4())

        # Copy audio file to history storage
        stored_audio = self._copy_file_to_history(
            audio_path, "tts", entry_id, "output"
        )

        metadata = {
            "voice_id": voice_id,
            "voice_name": voice_name,
            **(settings or {}),
        }

        entry = HistoryEntry(
            id=entry_id,
            module="tts",
            provider=provider,
            model=model,
            input_text=text,
            output_audio_path=stored_audio,
            metadata=metadata,
            duration_seconds=duration_seconds,
            characters_count=characters_count or len(text),
            cost_type="characters",
        )

        self.db.create_entry(entry)
        return entry_id

    # =========================================================================
    # STT / Dictate (Speech-to-Text)
    # =========================================================================

    def save_stt_entry(
        self,
        audio_path: str,
        transcription: str,
        provider: str,
        model: Optional[str] = None,
        language: Optional[str] = None,
        language_detected: Optional[str] = None,
        duration_seconds: Optional[float] = None,
        word_timestamps: bool = False,
        diarization: bool = False,
    ) -> str:
        """Save a speech-to-text result to history"""
        entry_id = str(uuid.uuid4())

        # Copy audio file to history storage
        stored_audio = self._copy_file_to_history(
            audio_path, "stt", entry_id, "input"
        )

        metadata = {
            "language": language,
            "language_detected": language_detected,
            "word_timestamps": word_timestamps,
            "diarization": diarization,
        }

        entry = HistoryEntry(
            id=entry_id,
            module="stt",
            provider=provider,
            model=model,
            input_audio_path=stored_audio,
            output_text=transcription,
            metadata=metadata,
            duration_seconds=duration_seconds,
            cost_type="minutes",
        )

        self.db.create_entry(entry)
        return entry_id

    # =========================================================================
    # Transcribe (File transcription)
    # =========================================================================

    def save_transcribe_entry(
        self,
        audio_path: str,
        transcription: str,
        provider: str,
        model: Optional[str] = None,
        language: Optional[str] = None,
        duration_seconds: Optional[float] = None,
        num_speakers: Optional[int] = None,
        timestamps: Optional[List[Dict]] = None,
    ) -> str:
        """Save a file transcription to history"""
        entry_id = str(uuid.uuid4())

        # Copy audio file to history storage
        stored_audio = self._copy_file_to_history(
            audio_path, "transcribe", entry_id, "input"
        )

        metadata = {
            "language": language,
            "num_speakers": num_speakers,
            "has_timestamps": timestamps is not None,
            "timestamps": timestamps,
        }

        entry = HistoryEntry(
            id=entry_id,
            module="transcribe",
            provider=provider,
            model=model,
            input_audio_path=stored_audio,
            output_text=transcription,
            metadata=metadata,
            duration_seconds=duration_seconds,
            cost_type="minutes",
        )

        self.db.create_entry(entry)
        return entry_id

    # =========================================================================
    # Voice Changer (Speech-to-Speech)
    # =========================================================================

    def save_voice_changer_entry(
        self,
        input_audio_path: str,
        output_audio_path: str,
        provider: str,
        model: Optional[str] = None,
        target_voice_id: Optional[str] = None,
        target_voice_name: Optional[str] = None,
        duration_seconds: Optional[float] = None,
    ) -> str:
        """Save a voice change result to history"""
        entry_id = str(uuid.uuid4())

        # Copy both audio files to history storage
        stored_input = self._copy_file_to_history(
            input_audio_path, "voice-changer", entry_id, "input"
        )
        stored_output = self._copy_file_to_history(
            output_audio_path, "voice-changer", entry_id, "output"
        )

        metadata = {
            "target_voice_id": target_voice_id,
            "target_voice_name": target_voice_name,
        }

        entry = HistoryEntry(
            id=entry_id,
            module="voice-changer",
            provider=provider,
            model=model,
            input_audio_path=stored_input,
            output_audio_path=stored_output,
            metadata=metadata,
            duration_seconds=duration_seconds,
            cost_type="minutes",
        )

        self.db.create_entry(entry)
        return entry_id

    # =========================================================================
    # Voice Isolator
    # =========================================================================

    def save_voice_isolator_entry(
        self,
        input_audio_path: str,
        output_audio_path: str,
        provider: str,
        duration_seconds: Optional[float] = None,
    ) -> str:
        """Save a voice isolation result to history"""
        entry_id = str(uuid.uuid4())

        # Copy both audio files to history storage
        stored_input = self._copy_file_to_history(
            input_audio_path, "voice-isolator", entry_id, "input"
        )
        stored_output = self._copy_file_to_history(
            output_audio_path, "voice-isolator", entry_id, "output"
        )

        entry = HistoryEntry(
            id=entry_id,
            module="voice-isolator",
            provider=provider,
            input_audio_path=stored_input,
            output_audio_path=stored_output,
            duration_seconds=duration_seconds,
            cost_type="minutes",
        )

        self.db.create_entry(entry)
        return entry_id

    # =========================================================================
    # Dubbing
    # =========================================================================

    def save_dubbing_entry(
        self,
        input_path: str,
        output_path: str,
        provider: str,
        source_language: str,
        target_language: str,
        is_video: bool = True,
        duration_seconds: Optional[float] = None,
        num_speakers: Optional[int] = None,
        elevenlabs_project_id: Optional[str] = None,
    ) -> str:
        """Save a dubbing result to history"""
        entry_id = str(uuid.uuid4())

        # Copy media files to history storage
        if is_video:
            stored_input = self._copy_file_to_history(
                input_path, "dubbing", entry_id, "input"
            )
            stored_output = self._copy_file_to_history(
                output_path, "dubbing", entry_id, "output"
            )
            input_video_path = stored_input
            output_video_path = stored_output
            input_audio_path = None
            output_audio_path = None
        else:
            stored_input = self._copy_file_to_history(
                input_path, "dubbing", entry_id, "input"
            )
            stored_output = self._copy_file_to_history(
                output_path, "dubbing", entry_id, "output"
            )
            input_audio_path = stored_input
            output_audio_path = stored_output
            input_video_path = None
            output_video_path = None

        metadata = {
            "source_language": source_language,
            "target_language": target_language,
            "is_video": is_video,
            "num_speakers": num_speakers,
            "elevenlabs_project_id": elevenlabs_project_id,
        }

        entry = HistoryEntry(
            id=entry_id,
            module="dubbing",
            provider=provider,
            input_audio_path=input_audio_path,
            output_audio_path=output_audio_path,
            input_video_path=input_video_path,
            output_video_path=output_video_path,
            metadata=metadata,
            duration_seconds=duration_seconds,
            cost_type="minutes",
        )

        self.db.create_entry(entry)
        return entry_id

    # =========================================================================
    # SFX (Sound Effects)
    # =========================================================================

    def save_sfx_entry(
        self,
        prompt: str,
        audio_path: str,
        provider: str,
        model: Optional[str] = None,
        duration_seconds: Optional[float] = None,
        settings: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Save a sound effect generation to history"""
        entry_id = str(uuid.uuid4())

        # Copy audio file to history storage
        stored_audio = self._copy_file_to_history(
            audio_path, "sfx", entry_id, "output"
        )

        metadata = {
            "prompt": prompt,
            **(settings or {}),
        }

        entry = HistoryEntry(
            id=entry_id,
            module="sfx",
            provider=provider,
            model=model,
            input_text=prompt,
            output_audio_path=stored_audio,
            metadata=metadata,
            duration_seconds=duration_seconds,
            cost_type="credits" if provider != "mmaudio" else "free",
        )

        self.db.create_entry(entry)
        return entry_id

    # =========================================================================
    # Music
    # =========================================================================

    def save_music_entry(
        self,
        prompt: str,
        audio_path: str,
        provider: str,
        model: Optional[str] = None,
        duration_seconds: Optional[float] = None,
        lyrics: Optional[str] = None,
        style: Optional[str] = None,
    ) -> str:
        """Save a music generation to history"""
        entry_id = str(uuid.uuid4())

        # Copy audio file to history storage
        stored_audio = self._copy_file_to_history(
            audio_path, "music", entry_id, "output"
        )

        metadata = {
            "prompt": prompt,
            "lyrics": lyrics,
            "style": style,
        }

        entry = HistoryEntry(
            id=entry_id,
            module="music",
            provider=provider,
            model=model,
            input_text=prompt,
            output_audio_path=stored_audio,
            metadata=metadata,
            duration_seconds=duration_seconds,
            cost_type="free",  # Local models are free
        )

        self.db.create_entry(entry)
        return entry_id

    # =========================================================================
    # Stems (Audio Separation)
    # =========================================================================

    def save_stems_entry(
        self,
        input_audio_path: str,
        output_stems: Dict[str, str],
        provider: str,
        model: Optional[str] = None,
        duration_seconds: Optional[float] = None,
    ) -> str:
        """Save a stem separation result to history"""
        entry_id = str(uuid.uuid4())

        # Copy input audio to history storage
        stored_input = self._copy_file_to_history(
            input_audio_path, "stems", entry_id, "input"
        )

        # Copy all stem outputs
        stored_stems = {}
        for stem_name, stem_path in output_stems.items():
            stored_stem = self._copy_file_to_history(
                stem_path, "stems", entry_id, f"output_{stem_name}"
            )
            if stored_stem:
                stored_stems[stem_name] = stored_stem

        metadata = {
            "stems": list(output_stems.keys()),
            "output_stems": stored_stems,
        }

        # Use the vocals stem as primary output if available
        primary_output = stored_stems.get("vocals") or next(iter(stored_stems.values()), None)

        entry = HistoryEntry(
            id=entry_id,
            module="stems",
            provider=provider,
            model=model,
            input_audio_path=stored_input,
            output_audio_path=primary_output,
            metadata=metadata,
            duration_seconds=duration_seconds,
            cost_type="free",  # Demucs is local/free
        )

        self.db.create_entry(entry)
        return entry_id

    # =========================================================================
    # AI Edit
    # =========================================================================

    def save_ai_edit_entry(
        self,
        original_text: str,
        edited_text: str,
        instruction: str,
        provider: str,
        model: Optional[str] = None,
    ) -> str:
        """Save an AI edit result to history"""
        entry_id = str(uuid.uuid4())

        metadata = {
            "instruction": instruction,
        }

        entry = HistoryEntry(
            id=entry_id,
            module="ai-edit",
            provider=provider,
            model=model,
            input_text=original_text,
            output_text=edited_text,
            metadata=metadata,
            characters_count=len(original_text),
            cost_type="free" if provider == "local" else "credits",
        )

        self.db.create_entry(entry)
        return entry_id

    # =========================================================================
    # Translate
    # =========================================================================

    def save_translate_entry(
        self,
        original_text: str,
        translated_text: str,
        source_language: str,
        target_language: str,
        provider: str,
        model: Optional[str] = None,
    ) -> str:
        """Save a translation to history"""
        entry_id = str(uuid.uuid4())

        metadata = {
            "source_language": source_language,
            "target_language": target_language,
        }

        entry = HistoryEntry(
            id=entry_id,
            module="translate",
            provider=provider,
            model=model,
            input_text=original_text,
            output_text=translated_text,
            metadata=metadata,
            characters_count=len(original_text),
            cost_type="free",  # Argos is local/free
        )

        self.db.create_entry(entry)
        return entry_id

    # =========================================================================
    # Reader
    # =========================================================================

    def save_reader_entry(
        self,
        text: str,
        audio_path: str,
        provider: str,
        voice_id: Optional[str] = None,
        voice_name: Optional[str] = None,
        source_url: Optional[str] = None,
        duration_seconds: Optional[float] = None,
    ) -> str:
        """Save a reader session to history"""
        entry_id = str(uuid.uuid4())

        # Copy audio file to history storage
        stored_audio = self._copy_file_to_history(
            audio_path, "reader", entry_id, "output"
        )

        metadata = {
            "voice_id": voice_id,
            "voice_name": voice_name,
            "source_url": source_url,
        }

        entry = HistoryEntry(
            id=entry_id,
            module="reader",
            provider=provider,
            input_text=text,
            output_audio_path=stored_audio,
            metadata=metadata,
            duration_seconds=duration_seconds,
            characters_count=len(text),
            cost_type="characters",
        )

        self.db.create_entry(entry)
        return entry_id

    # =========================================================================
    # Generic Operations
    # =========================================================================

    def get_entry(self, entry_id: str) -> Optional[HistoryEntry]:
        """Get a history entry by ID"""
        return self.db.get_entry(entry_id)

    def list_entries(
        self,
        module: Optional[str] = None,
        provider: Optional[str] = None,
        model: Optional[str] = None,
        status: Optional[str] = None,
        favorite: Optional[bool] = None,
        from_date: Optional[str] = None,
        to_date: Optional[str] = None,
        search: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> List[HistoryEntry]:
        """List history entries with filters"""
        return self.db.list_entries(
            module=module,
            provider=provider,
            model=model,
            status=status,
            favorite=favorite,
            from_date=from_date,
            to_date=to_date,
            search=search,
            limit=limit,
            offset=offset,
        )

    def count_entries(
        self,
        module: Optional[str] = None,
        provider: Optional[str] = None,
        from_date: Optional[str] = None,
        to_date: Optional[str] = None,
    ) -> int:
        """Count entries matching filters"""
        return self.db.count_entries(
            module=module,
            provider=provider,
            from_date=from_date,
            to_date=to_date,
        )

    def update_entry(self, entry_id: str, updates: Dict[str, Any]) -> bool:
        """Update a history entry"""
        return self.db.update_entry(entry_id, updates)

    @log_function(module="history", error_code=ErrorCode.HIST_ENTRY_NOT_FOUND)
    def delete_entry(self, entry_id: str) -> bool:
        """Delete a history entry and its files"""
        with error_context(entry_id=entry_id):
            entry = self.db.get_entry(entry_id)
            if not entry:
                return False

            # Delete associated files
            for path_field in ['input_audio_path', 'output_audio_path',
                               'input_video_path', 'output_video_path']:
                path = getattr(entry, path_field)
                if path:
                    try:
                        p = Path(path)
                        if p.exists():
                            p.unlink()
                        # Try to remove parent dir if empty
                        if p.parent.exists() and not any(p.parent.iterdir()):
                            p.parent.rmdir()
                    except Exception as e:
                        log_error("history", "delete_entry", f"Failed to delete file {path}: {e}")

            return self.db.delete_entry(entry_id)

    def toggle_favorite(self, entry_id: str) -> bool:
        """Toggle favorite status of an entry"""
        entry = self.db.get_entry(entry_id)
        if not entry:
            return False
        return self.db.update_entry(entry_id, {"favorite": not entry.favorite})

    def get_stats(
        self,
        from_date: Optional[str] = None,
        to_date: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get usage statistics"""
        return self.db.get_stats(from_date=from_date, to_date=to_date)

    def get_monthly_stats(self, year: int, month: int) -> Dict[str, Any]:
        """Get stats for a specific month"""
        return self.db.get_monthly_stats(year, month)


# Singleton instance
_service: Optional[HistoryService] = None


def get_history_service() -> HistoryService:
    """Get the history service singleton"""
    global _service
    if _service is None:
        _service = HistoryService()
    return _service
