"""Audio cache utilities (AppData-backed, hash-addressed, TTL/LRU eviction)."""

from __future__ import annotations

import datetime
import hashlib
import json
import shutil
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from app_paths import get_cache_root
from settings_service import settings_service

DEFAULT_MAX_AGE_DAYS = 30
DEFAULT_MAX_SIZE_GB = 10.0
META_FILENAME = "meta.json"
AUDIO_FILENAME = "audio.wav"


def get_audio_cache_root() -> Path:
    root = get_cache_root() / "audio"
    root.mkdir(parents=True, exist_ok=True)
    return root


def _parse_iso(value: Optional[str]) -> Optional[datetime.datetime]:
    if not value:
        return None
    try:
        return datetime.datetime.fromisoformat(value)
    except Exception:
        return None


def _iso_now() -> str:
    return datetime.datetime.now().isoformat()


def _compute_file_hash(path: Path) -> str:
    hasher = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            chunk = f.read(1024 * 1024)
            if not chunk:
                break
            hasher.update(chunk)
    return hasher.hexdigest()


def _read_meta(path: Path) -> Optional[Dict[str, Any]]:
    if not path.exists():
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def _write_meta(path: Path, meta: Dict[str, Any]) -> None:
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(meta, f, ensure_ascii=False, indent=2)
    except Exception:
        pass


def get_audio_cache_dir(audio_hash: str) -> Path:
    return get_audio_cache_root() / audio_hash


def get_cached_audio_path(audio_hash: str) -> Optional[Path]:
    if not audio_hash:
        return None
    cache_dir = get_audio_cache_dir(audio_hash)
    audio_path = cache_dir / AUDIO_FILENAME
    if audio_path.exists():
        _touch_cache_entry(cache_dir)
        return audio_path
    return None


def _touch_cache_entry(cache_dir: Path) -> None:
    meta_path = cache_dir / META_FILENAME
    meta = _read_meta(meta_path) or {}
    meta["last_accessed_at"] = _iso_now()
    _write_meta(meta_path, meta)


def _get_cache_limits() -> Tuple[int, float]:
    limits = settings_service.get("diarization.cache", {}) or {}
    max_age_days = int(limits.get("max_age_days") or DEFAULT_MAX_AGE_DAYS)
    max_size_gb = float(limits.get("max_size_gb") or DEFAULT_MAX_SIZE_GB)
    return max_age_days, max_size_gb


def ensure_audio_cached(
    audio_path: Path,
    source_path: Optional[Path] = None,
    filename: Optional[str] = None,
    duration: Optional[float] = None,
) -> Optional[Dict[str, Any]]:
    if not audio_path.exists():
        return None

    audio_hash = _compute_file_hash(audio_path)
    cache_dir = get_audio_cache_dir(audio_hash)
    cache_dir.mkdir(parents=True, exist_ok=True)
    cached_audio = cache_dir / AUDIO_FILENAME

    if not cached_audio.exists():
        shutil.copy2(audio_path, cached_audio)

    meta_path = cache_dir / META_FILENAME
    meta = _read_meta(meta_path) or {}
    now = _iso_now()
    meta.update(
        {
            "hash": audio_hash,
            "created_at": meta.get("created_at") or now,
            "last_accessed_at": now,
            "filename": filename,
            "source_path": str(source_path) if source_path else meta.get("source_path"),
            "duration_s": duration,
            "size_bytes": cached_audio.stat().st_size if cached_audio.exists() else None,
        }
    )
    _write_meta(meta_path, meta)

    prune_audio_cache()

    return {
        "hash": audio_hash,
        "path": str(cached_audio),
        "cache_dir": str(cache_dir),
        "size_bytes": meta.get("size_bytes"),
    }


def _collect_cache_entries() -> Tuple[List[Dict[str, Any]], int]:
    root = get_audio_cache_root()
    entries: List[Dict[str, Any]] = []
    total_size = 0
    for entry in root.iterdir():
        if not entry.is_dir():
            continue
        meta_path = entry / META_FILENAME
        meta = _read_meta(meta_path) or {}
        audio_path = entry / AUDIO_FILENAME
        size = 0
        if audio_path.exists():
            size = audio_path.stat().st_size
        else:
            # Fallback: sum directory size if audio missing.
            for child in entry.rglob("*"):
                if child.is_file():
                    size += child.stat().st_size
        total_size += size
        last_accessed = _parse_iso(meta.get("last_accessed_at")) or datetime.datetime.fromtimestamp(
            entry.stat().st_mtime
        )
        entries.append(
            {
                "dir": entry,
                "size": size,
                "last_accessed": last_accessed,
                "created_at": _parse_iso(meta.get("created_at")) or last_accessed,
            }
        )
    return entries, total_size


def prune_audio_cache(
    max_age_days: Optional[int] = None,
    max_size_gb: Optional[float] = None,
) -> Dict[str, Any]:
    max_age_days = max_age_days if max_age_days is not None else _get_cache_limits()[0]
    max_size_gb = max_size_gb if max_size_gb is not None else _get_cache_limits()[1]

    entries, total_size = _collect_cache_entries()
    removed_bytes = 0
    now = datetime.datetime.now()

    for entry in list(entries):
        age_days = (now - entry["last_accessed"]).days
        if max_age_days > 0 and age_days > max_age_days:
            shutil.rmtree(entry["dir"], ignore_errors=True)
            removed_bytes += entry["size"]
            entries.remove(entry)
            total_size -= entry["size"]

    max_size_bytes = int(max_size_gb * 1024 * 1024 * 1024)
    if max_size_bytes > 0 and total_size > max_size_bytes:
        entries.sort(key=lambda item: item["last_accessed"])
        for entry in entries:
            if total_size <= max_size_bytes:
                break
            shutil.rmtree(entry["dir"], ignore_errors=True)
            removed_bytes += entry["size"]
            total_size -= entry["size"]

    return {
        "removed_bytes": removed_bytes,
        "remaining_bytes": total_size,
    }


def clear_audio_cache() -> Dict[str, Any]:
    root = get_audio_cache_root()
    removed_bytes = 0
    for entry in root.iterdir():
        if entry.is_dir():
            for child in entry.rglob("*"):
                if child.is_file():
                    removed_bytes += child.stat().st_size
            shutil.rmtree(entry, ignore_errors=True)
    return {"cleared": True, "removed_bytes": removed_bytes}


def get_audio_cache_status() -> Dict[str, Any]:
    max_age_days, max_size_gb = _get_cache_limits()
    entries, total_size = _collect_cache_entries()
    return {
        "count": len(entries),
        "total_bytes": total_size,
        "total_gb": round(total_size / (1024 * 1024 * 1024), 2),
        "max_age_days": max_age_days,
        "max_size_gb": max_size_gb,
        "path": str(get_audio_cache_root()),
    }
