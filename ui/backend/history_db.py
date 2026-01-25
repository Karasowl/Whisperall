"""History Database - SQLite storage for all module history entries

Provides persistent storage for generated content across all Whisperall modules.
"""

import sqlite3
import json
import uuid
from pathlib import Path
from datetime import datetime
from typing import Optional, List, Dict, Any
from dataclasses import dataclass, asdict
from contextlib import contextmanager

from app_paths import get_app_data_root


# Database path
def get_db_path() -> Path:
    """Get path to history database"""
    data_dir = get_app_data_root()
    return data_dir / "history.db"


def get_history_files_dir() -> Path:
    """Get directory for storing history-related files (audio, video, etc.)"""
    data_dir = get_app_data_root()
    history_dir = data_dir / "history_files"
    history_dir.mkdir(parents=True, exist_ok=True)
    return history_dir


@dataclass
class HistoryEntry:
    """Represents a single history entry"""
    id: str
    module: str  # 'tts', 'stt', 'transcribe', 'voice-changer', etc.
    provider: str
    model: Optional[str] = None
    created_at: Optional[str] = None

    # Content fields
    input_text: Optional[str] = None
    output_text: Optional[str] = None
    input_audio_path: Optional[str] = None
    output_audio_path: Optional[str] = None
    input_video_path: Optional[str] = None
    output_video_path: Optional[str] = None

    # Metadata (JSON string internally, dict when accessed)
    metadata: Optional[Dict[str, Any]] = None

    # Usage and costs
    duration_seconds: Optional[float] = None
    characters_count: Optional[int] = None
    credits_used: Optional[float] = None
    cost_type: Optional[str] = None  # 'minutes', 'characters', 'credits', 'free'

    # Status
    status: str = "completed"  # 'completed', 'failed', 'processing'
    error_message: Optional[str] = None

    # Organization
    favorite: bool = False
    tags: Optional[List[str]] = None
    notes: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        d = asdict(self)
        # Ensure lists/dicts are serializable
        if d.get('tags') is None:
            d['tags'] = []
        if d.get('metadata') is None:
            d['metadata'] = {}
        return d


class HistoryDB:
    """SQLite database for history entries"""

    SCHEMA_VERSION = 1

    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = db_path or get_db_path()
        self._init_db()

    @contextmanager
    def _get_connection(self):
        """Get database connection with context manager"""
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        try:
            yield conn
        finally:
            conn.close()

    def _init_db(self):
        """Initialize database schema"""
        with self._get_connection() as conn:
            cursor = conn.cursor()

            # Create main history table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS history_entries (
                    id TEXT PRIMARY KEY,
                    module TEXT NOT NULL,
                    provider TEXT NOT NULL,
                    model TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

                    -- Content
                    input_text TEXT,
                    output_text TEXT,
                    input_audio_path TEXT,
                    output_audio_path TEXT,
                    input_video_path TEXT,
                    output_video_path TEXT,

                    -- Metadata (JSON)
                    metadata TEXT,

                    -- Usage and costs
                    duration_seconds REAL,
                    characters_count INTEGER,
                    credits_used REAL,
                    cost_type TEXT,

                    -- Status
                    status TEXT DEFAULT 'completed',
                    error_message TEXT,

                    -- Organization
                    favorite BOOLEAN DEFAULT 0,
                    tags TEXT,
                    notes TEXT
                )
            """)

            # Create indexes for common queries
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_history_module
                ON history_entries(module)
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_history_created
                ON history_entries(created_at DESC)
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_history_provider
                ON history_entries(provider)
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_history_status
                ON history_entries(status)
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_history_favorite
                ON history_entries(favorite)
            """)

            # Schema version table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS schema_version (
                    version INTEGER PRIMARY KEY
                )
            """)

            # Check/set schema version
            cursor.execute("SELECT version FROM schema_version")
            row = cursor.fetchone()
            if not row:
                cursor.execute(
                    "INSERT INTO schema_version (version) VALUES (?)",
                    (self.SCHEMA_VERSION,)
                )

            conn.commit()

    def create_entry(self, entry: HistoryEntry) -> str:
        """Create a new history entry"""
        if not entry.id:
            entry.id = str(uuid.uuid4())

        if not entry.created_at:
            entry.created_at = datetime.now().isoformat()

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO history_entries (
                    id, module, provider, model, created_at,
                    input_text, output_text,
                    input_audio_path, output_audio_path,
                    input_video_path, output_video_path,
                    metadata, duration_seconds, characters_count,
                    credits_used, cost_type, status, error_message,
                    favorite, tags, notes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                entry.id,
                entry.module,
                entry.provider,
                entry.model,
                entry.created_at,
                entry.input_text,
                entry.output_text,
                entry.input_audio_path,
                entry.output_audio_path,
                entry.input_video_path,
                entry.output_video_path,
                json.dumps(entry.metadata) if entry.metadata else None,
                entry.duration_seconds,
                entry.characters_count,
                entry.credits_used,
                entry.cost_type,
                entry.status,
                entry.error_message,
                entry.favorite,
                json.dumps(entry.tags) if entry.tags else None,
                entry.notes,
            ))
            conn.commit()

        return entry.id

    def get_entry(self, entry_id: str) -> Optional[HistoryEntry]:
        """Get a single history entry by ID"""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT * FROM history_entries WHERE id = ?",
                (entry_id,)
            )
            row = cursor.fetchone()
            if row:
                return self._row_to_entry(row)
        return None

    def update_entry(self, entry_id: str, updates: Dict[str, Any]) -> bool:
        """Update specific fields of a history entry"""
        allowed_fields = {
            'favorite', 'tags', 'notes', 'status', 'error_message',
            'output_text', 'output_audio_path', 'output_video_path',
            'duration_seconds', 'characters_count', 'credits_used'
        }

        # Filter to allowed fields only
        updates = {k: v for k, v in updates.items() if k in allowed_fields}
        if not updates:
            return False

        # Handle JSON fields
        if 'tags' in updates and isinstance(updates['tags'], list):
            updates['tags'] = json.dumps(updates['tags'])

        set_clause = ", ".join(f"{k} = ?" for k in updates.keys())
        values = list(updates.values()) + [entry_id]

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                f"UPDATE history_entries SET {set_clause} WHERE id = ?",
                values
            )
            conn.commit()
            return cursor.rowcount > 0

    def delete_entry(self, entry_id: str) -> bool:
        """Delete a history entry"""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "DELETE FROM history_entries WHERE id = ?",
                (entry_id,)
            )
            conn.commit()
            return cursor.rowcount > 0

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
        order_by: str = "created_at",
        order_dir: str = "DESC"
    ) -> List[HistoryEntry]:
        """List history entries with filters"""
        conditions = []
        params = []

        if module:
            conditions.append("module = ?")
            params.append(module)

        if provider:
            conditions.append("provider = ?")
            params.append(provider)

        if model:
            conditions.append("model = ?")
            params.append(model)

        if status:
            conditions.append("status = ?")
            params.append(status)

        if favorite is not None:
            conditions.append("favorite = ?")
            params.append(1 if favorite else 0)

        if from_date:
            conditions.append("created_at >= ?")
            params.append(from_date)

        if to_date:
            conditions.append("created_at <= ?")
            params.append(to_date)

        if search:
            conditions.append(
                "(input_text LIKE ? OR output_text LIKE ? OR notes LIKE ?)"
            )
            search_term = f"%{search}%"
            params.extend([search_term, search_term, search_term])

        where_clause = " AND ".join(conditions) if conditions else "1=1"

        # Validate order_by to prevent SQL injection
        valid_order_fields = {'created_at', 'module', 'provider', 'duration_seconds'}
        if order_by not in valid_order_fields:
            order_by = 'created_at'
        order_dir = 'DESC' if order_dir.upper() == 'DESC' else 'ASC'

        query = f"""
            SELECT * FROM history_entries
            WHERE {where_clause}
            ORDER BY {order_by} {order_dir}
            LIMIT ? OFFSET ?
        """
        params.extend([limit, offset])

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(query, params)
            rows = cursor.fetchall()
            return [self._row_to_entry(row) for row in rows]

    def count_entries(
        self,
        module: Optional[str] = None,
        provider: Optional[str] = None,
        status: Optional[str] = None,
        from_date: Optional[str] = None,
        to_date: Optional[str] = None
    ) -> int:
        """Count entries matching filters"""
        conditions = []
        params = []

        if module:
            conditions.append("module = ?")
            params.append(module)

        if provider:
            conditions.append("provider = ?")
            params.append(provider)

        if status:
            conditions.append("status = ?")
            params.append(status)

        if from_date:
            conditions.append("created_at >= ?")
            params.append(from_date)

        if to_date:
            conditions.append("created_at <= ?")
            params.append(to_date)

        where_clause = " AND ".join(conditions) if conditions else "1=1"

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                f"SELECT COUNT(*) FROM history_entries WHERE {where_clause}",
                params
            )
            return cursor.fetchone()[0]

    def get_stats(
        self,
        from_date: Optional[str] = None,
        to_date: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get usage statistics"""
        conditions = ["status = 'completed'"]
        params = []

        if from_date:
            conditions.append("created_at >= ?")
            params.append(from_date)

        if to_date:
            conditions.append("created_at <= ?")
            params.append(to_date)

        where_clause = " AND ".join(conditions)

        with self._get_connection() as conn:
            cursor = conn.cursor()

            # Stats by module
            cursor.execute(f"""
                SELECT
                    module,
                    COUNT(*) as count,
                    SUM(duration_seconds) as total_duration,
                    SUM(characters_count) as total_characters,
                    SUM(credits_used) as total_credits
                FROM history_entries
                WHERE {where_clause}
                GROUP BY module
            """, params)

            by_module = {}
            for row in cursor.fetchall():
                by_module[row['module']] = {
                    'count': row['count'],
                    'total_duration': row['total_duration'] or 0,
                    'total_characters': row['total_characters'] or 0,
                    'total_credits': row['total_credits'] or 0,
                }

            # Stats by provider
            cursor.execute(f"""
                SELECT
                    provider,
                    COUNT(*) as count,
                    SUM(duration_seconds) as total_duration,
                    SUM(credits_used) as total_credits
                FROM history_entries
                WHERE {where_clause}
                GROUP BY provider
            """, params)

            by_provider = {}
            for row in cursor.fetchall():
                by_provider[row['provider']] = {
                    'count': row['count'],
                    'total_duration': row['total_duration'] or 0,
                    'total_credits': row['total_credits'] or 0,
                }

            # Total count
            cursor.execute(
                f"SELECT COUNT(*) FROM history_entries WHERE {where_clause}",
                params
            )
            total_count = cursor.fetchone()[0]

            return {
                'total_entries': total_count,
                'by_module': by_module,
                'by_provider': by_provider,
            }

    def get_monthly_stats(self, year: int, month: int) -> Dict[str, Any]:
        """Get stats for a specific month"""
        from_date = f"{year}-{month:02d}-01"
        if month == 12:
            to_date = f"{year + 1}-01-01"
        else:
            to_date = f"{year}-{month + 1:02d}-01"

        return self.get_stats(from_date=from_date, to_date=to_date)

    def _row_to_entry(self, row: sqlite3.Row) -> HistoryEntry:
        """Convert database row to HistoryEntry"""
        metadata = None
        if row['metadata']:
            try:
                metadata = json.loads(row['metadata'])
            except json.JSONDecodeError:
                metadata = {}

        tags = None
        if row['tags']:
            try:
                tags = json.loads(row['tags'])
            except json.JSONDecodeError:
                tags = []

        return HistoryEntry(
            id=row['id'],
            module=row['module'],
            provider=row['provider'],
            model=row['model'],
            created_at=row['created_at'],
            input_text=row['input_text'],
            output_text=row['output_text'],
            input_audio_path=row['input_audio_path'],
            output_audio_path=row['output_audio_path'],
            input_video_path=row['input_video_path'],
            output_video_path=row['output_video_path'],
            metadata=metadata,
            duration_seconds=row['duration_seconds'],
            characters_count=row['characters_count'],
            credits_used=row['credits_used'],
            cost_type=row['cost_type'],
            status=row['status'],
            error_message=row['error_message'],
            favorite=bool(row['favorite']),
            tags=tags,
            notes=row['notes'],
        )

    def clear_all(self) -> int:
        """Delete all history entries (use with caution)"""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM history_entries")
            count = cursor.rowcount
            conn.commit()
            return count


# Singleton instance
_db: Optional[HistoryDB] = None


def get_history_db() -> HistoryDB:
    """Get the history database singleton"""
    global _db
    if _db is None:
        _db = HistoryDB()
    return _db
