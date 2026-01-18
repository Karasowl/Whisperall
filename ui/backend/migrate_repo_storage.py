"""Migrate repo runtime storage (transcriptions/output/etc.) to OS app data."""

from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path
from typing import Dict, Iterable, Tuple

from app_paths import (
    get_transcriptions_dir,
    get_history_dir,
    get_output_dir,
    get_voices_dir,
    get_presets_dir,
    get_logs_dir,
    get_models_dir,
    get_data_dir,
    get_settings_path,
    get_temp_dir,
)


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


def _update_transcriptions_dir(
    transcriptions_dir: Path,
    old_temp_roots: Iterable[Path],
    new_temp_root: Path,
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

        new_path = None
        for old_root in old_temp_roots:
            try:
                relative = file_path_obj.relative_to(old_root.resolve())
            except Exception:
                continue
            new_path = (new_temp_root / relative).resolve()
            break

        if not new_path or not new_path.exists():
            continue

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
    parser = argparse.ArgumentParser(description="Migrate repo runtime storage to app data.")
    parser.add_argument("--dry-run", action="store_true", help="Preview changes only.")
    args = parser.parse_args()

    base_dir = Path(__file__).resolve().parents[2]
    old_temp = base_dir / "temp"
    new_temp = get_temp_dir()

    migrations: Dict[str, Tuple[Path, Path]] = {
        "transcriptions": (base_dir / "transcriptions", get_transcriptions_dir()),
        "history": (base_dir / "history", get_history_dir()),
        "output": (base_dir / "output", get_output_dir()),
        "voices": (base_dir / "voices", get_voices_dir()),
        "presets": (base_dir / "presets", get_presets_dir()),
        "logs": (base_dir / "logs", get_logs_dir()),
        "models": (base_dir / "models", get_models_dir()),
        "data": (base_dir / "data", get_data_dir()),
    }

    totals = {"copied": 0, "skipped": 0, "errors": 0}
    for name, (src, dest) in migrations.items():
        if not args.dry_run:
            dest.mkdir(parents=True, exist_ok=True)
        copied, skipped, errors = _copy_tree(src, dest, args.dry_run)
        totals["copied"] += copied
        totals["skipped"] += skipped
        totals["errors"] += errors
        print(f"{name}: copied={copied} skipped={skipped} errors={errors}")

    old_settings = base_dir / "settings.json"
    new_settings = get_settings_path()
    if old_settings.exists():
        if not new_settings.exists():
            if args.dry_run:
                print("settings.json: would copy")
            else:
                new_settings.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(old_settings, new_settings)
                print("settings.json: copied")
        else:
            print("settings.json: already exists in app data")

    updated_files, updated_paths = _update_transcriptions_dir(
        get_transcriptions_dir(),
        [old_temp],
        new_temp,
        args.dry_run,
    )

    print("Temp path update")
    print(f"Updated paths: {updated_paths} in {updated_files} files")
    print(f"Total copied: {totals['copied']}, skipped: {totals['skipped']}, errors: {totals['errors']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
