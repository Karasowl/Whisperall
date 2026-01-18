"""
Voice snippets storage for STT post-processing.
Stores trigger -> expansion mappings.
"""

from __future__ import annotations

import json
import uuid
from typing import Dict, List

from app_paths import get_data_dir


DATA_DIR = get_data_dir()
SNIPPETS_FILE = DATA_DIR / "snippets.json"


def _load_entries() -> List[Dict]:
    if not SNIPPETS_FILE.exists():
        return []
    try:
        with SNIPPETS_FILE.open("r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, list):
            return data
    except Exception:
        return []
    return []


def _save_entries(entries: List[Dict]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with SNIPPETS_FILE.open("w", encoding="utf-8") as f:
        json.dump(entries, f, indent=2, ensure_ascii=False)


def list_entries() -> List[Dict]:
    return _load_entries()


def add_entry(trigger: str, expansion: str, enabled: bool = True) -> Dict:
    entries = _load_entries()
    entry = {
        "id": str(uuid.uuid4())[:8],
        "trigger": trigger,
        "expansion": expansion,
        "enabled": enabled,
    }
    entries.append(entry)
    _save_entries(entries)
    return entry


def delete_entry(entry_id: str) -> bool:
    entries = _load_entries()
    filtered = [e for e in entries if e.get("id") != entry_id]
    if len(filtered) == len(entries):
        return False
    _save_entries(filtered)
    return True
