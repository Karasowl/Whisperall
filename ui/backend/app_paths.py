"""Shared application paths for runtime data storage."""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path
from typing import Optional

APP_NAME = "Whisperall"
LEGACY_APP_NAME = "ChatterboxUI"


def _resolve_base_dir(base: Optional[str]) -> Optional[Path]:
    if not base:
        return None
    try:
        return Path(base)
    except Exception:
        return None


def _get_platform_data_base() -> Path:
    """Return the OS-appropriate base directory for app data."""
    if sys.platform == "win32":
        base = _resolve_base_dir(os.environ.get("LOCALAPPDATA")) or _resolve_base_dir(
            os.environ.get("APPDATA")
        )
        if base:
            return base
    elif sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support"

    base = _resolve_base_dir(os.environ.get("XDG_DATA_HOME"))
    if base:
        return base
    return Path.home() / ".local" / "share"


def get_app_data_root(app_name: str = APP_NAME) -> Path:
    """Return the OS-appropriate data directory for the app."""
    base = _get_platform_data_base()
    target = base / app_name
    if app_name == APP_NAME:
        legacy = base / LEGACY_APP_NAME
        if legacy.exists() and not target.exists():
            return legacy
    return target


def ensure_dir(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


def get_temp_root(app_name: str = APP_NAME) -> Path:
    """Return app temp root (OS temp)."""
    return Path(tempfile.gettempdir()) / app_name


def get_temp_dir() -> Path:
    return ensure_dir(get_temp_root() / "temp")


def get_runtime_dir(name: str) -> Path:
    return ensure_dir(get_app_data_root() / name)


def get_transcriptions_dir() -> Path:
    return get_runtime_dir("transcriptions")


def get_history_dir() -> Path:
    return get_runtime_dir("history")


def get_output_dir() -> Path:
    return get_runtime_dir("output")


def get_voices_dir() -> Path:
    return get_runtime_dir("voices")


def get_presets_dir() -> Path:
    return get_runtime_dir("presets")


def get_logs_dir() -> Path:
    return get_runtime_dir("logs")


def get_models_dir() -> Path:
    return get_runtime_dir("models")


def get_data_dir() -> Path:
    return get_runtime_dir("data")


def get_cache_root() -> Path:
    return get_runtime_dir("cache")


def get_settings_path() -> Path:
    return get_app_data_root() / "settings.json"
