"""Migrate legacy repo temp files to OS temp and update job paths."""

from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path
from typing import Dict, Tuple

from app_paths import get_temp_dir, get_transcriptions_dir


def _copy_tree(src_root: Path, dest_root: Path, dry_run: bool) -> Tuple[int, int, int]:
    copied = 0
    skipped = 0
    errors = 0

    if not src_root.exists():
        return copied, skipped, errors

    for src_path in src_root.rglob("*"):
        if not src_path.is_file():
            continue
        rel = src_path.relative_to(src_root)
        dest_path = dest_root / rel
        if dest_path.exists():
            try:
                if dest_path.stat().st_size == src_path.stat().st_size:
                    skipped += 1
                    continue
            except Exception:
                pass
        if dry_run:
            copied += 1
            continue
        try:
            dest_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src_path, dest_path)
            copied += 1
        except Exception:
            errors += 1

    return copied, skipped, errors


def _update_transcriptions(
    transcriptions_dir: Path,
    old_temp: Path,
    new_temp: Path,
    dry_run: bool,
) -> Tuple[int, int]:
    updated_files = 0
    updated_paths = 0

    if not transcriptions_dir.exists():
        return updated_files, updated_paths

    for json_path in transcriptions_dir.glob("*.json"):
        try:
            with open(json_path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            continue

        file_path = data.get("file_path")
        if not file_path:
            continue

        try:
            file_path_obj = Path(file_path).resolve()
        except Exception:
            continue

        try:
            relative = file_path_obj.relative_to(old_temp.resolve())
        except Exception:
            continue

        new_path = (new_temp / relative).resolve()
        if new_path.exists():
            data["file_path"] = str(new_path)
            updated_paths += 1
            if not dry_run:
                try:
                    with open(json_path, "w", encoding="utf-8") as f:
                        json.dump(data, f, ensure_ascii=False, indent=2)
                    updated_files += 1
                except Exception:
                    pass

    return updated_files, updated_paths


def main() -> int:
    parser = argparse.ArgumentParser(description="Migrate repo temp to OS temp.")
    parser.add_argument("--dry-run", action="store_true", help="Preview changes only.")
    args = parser.parse_args()

    base_dir = Path(__file__).resolve().parents[2]
    old_temp = base_dir / "temp"
    new_temp = get_temp_dir()
    transcriptions_dir = get_transcriptions_dir()

    if not args.dry_run:
        new_temp.mkdir(parents=True, exist_ok=True)

    copied, skipped, errors = _copy_tree(old_temp, new_temp, args.dry_run)
    updated_files, updated_paths = _update_transcriptions(
        transcriptions_dir, old_temp, new_temp, args.dry_run
    )

    print("Temp migration summary")
    print(f"Source: {old_temp}")
    print(f"Dest:   {new_temp}")
    print(f"Copied: {copied}, Skipped: {skipped}, Errors: {errors}")
    print(f"Updated transcriptions: {updated_paths} paths in {updated_files} files")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
