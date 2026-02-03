#!/usr/bin/env python3
"""
Generate a quick usage report from Whisperall's local History SQLite DB.

This is intentionally lightweight and privacy-friendly: it reports only counts
by module/provider and date ranges (no transcript content).
"""

from __future__ import annotations

import argparse
import os
import sqlite3
from collections import Counter
from datetime import datetime, timedelta
from pathlib import Path
from typing import Iterable, Optional


def _parse_dt(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None

    s = value.strip()

    # Common formats seen in this repo:
    # - 2026-01-23T16:29:02.288229  (datetime.now().isoformat())
    # - 2026-01-23 16:29:02         (SQLite CURRENT_TIMESTAMP)
    try:
        return datetime.fromisoformat(s)
    except ValueError:
        pass

    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue

    return None


def _default_db_candidates() -> list[Path]:
    localappdata = os.environ.get("LOCALAPPDATA") or ""
    base = Path(localappdata) if localappdata else None
    candidates: list[Path] = []
    if base:
        candidates.append(base / "Whisperall" / "history.db")
        candidates.append(base / "ChatterboxUI" / "history.db")  # legacy name
    return candidates


def find_history_db(explicit: Optional[str]) -> Path:
    if explicit:
        return Path(explicit)

    for p in _default_db_candidates():
        if p.exists():
            return p

    raise FileNotFoundError(
        "Could not find history.db. Try passing --db with an explicit path.\n"
        "Expected one of:\n"
        f"- {os.path.join(os.environ.get('LOCALAPPDATA',''), 'Whisperall', 'history.db')}\n"
        f"- {os.path.join(os.environ.get('LOCALAPPDATA',''), 'ChatterboxUI', 'history.db')}\n"
    )


def rows(conn: sqlite3.Connection) -> Iterable[tuple[str, str, str, str]]:
    cur = conn.cursor()
    cur.execute("select created_at, module, provider, status from history_entries")
    yield from cur.fetchall()


def main() -> int:
    ap = argparse.ArgumentParser(description="Whisperall history usage report")
    ap.add_argument("--db", help="Path to history.db (defaults to LOCALAPPDATA candidates)")
    ap.add_argument("--days", type=int, default=30, help="Window for recent usage (default: 30)")
    args = ap.parse_args()

    db_path = find_history_db(args.db)
    if not db_path.exists():
        raise FileNotFoundError(f"history.db not found at: {db_path}")

    conn = sqlite3.connect(str(db_path))
    try:
        cur = conn.cursor()
        cur.execute("select count(*) from history_entries")
        total = int(cur.fetchone()[0])

        cur.execute("select min(created_at), max(created_at) from history_entries")
        min_dt_raw, max_dt_raw = cur.fetchone()

        print(f"History DB: {db_path}")
        print(f"Total entries: {total}")
        print(f"Date range: {min_dt_raw} -> {max_dt_raw}")
        print("")

        # Grouped counts (SQL is fastest and avoids parsing issues)
        cur.execute("select module, count(*) as c from history_entries group by module order by c desc")
        print("By module (all time):")
        for module, c in cur.fetchall():
            print(f"- {module}: {c}")
        print("")

        cur.execute("select provider, count(*) as c from history_entries group by provider order by c desc")
        print("By provider (all time):")
        for provider, c in cur.fetchall():
            print(f"- {provider}: {c}")
        print("")

        # Recent window (parse timestamps to be robust across formats)
        cutoff = datetime.now() - timedelta(days=args.days)
        recent_modules: Counter[str] = Counter()
        recent_providers: Counter[str] = Counter()
        recent_total = 0

        for created_at, module, provider, status in rows(conn):
            dt = _parse_dt(created_at)
            if dt and dt >= cutoff:
                recent_total += 1
                recent_modules[module] += 1
                recent_providers[provider] += 1

        print(f"Last {args.days} days:")
        print(f"- entries: {recent_total}")
        if recent_modules:
            print("- by module:")
            for k, v in recent_modules.most_common():
                print(f"  - {k}: {v}")
        if recent_providers:
            print("- by provider:")
            for k, v in recent_providers.most_common():
                print(f"  - {k}: {v}")

        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())

