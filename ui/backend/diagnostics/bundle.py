"""
Diagnostic Bundle Generator

Creates a ZIP file containing all diagnostic information:
- Recent events (structured JSON)
- Configuration
- Version information
- Errors grouped by fingerprint
- System information (GPU, memory, etc.)
"""

from __future__ import annotations

import json
import os
import platform
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

# Lazy imports to avoid circular dependencies
def _get_app_paths():
    from app_paths import get_temp_dir, get_logs_dir, get_app_data_root
    return get_temp_dir, get_logs_dir, get_app_data_root


def _get_event_store():
    from .logger import get_event_store
    return get_event_store()


def _get_settings():
    try:
        import settings_service
        return settings_service.get_all_settings()
    except Exception:
        return {}


def get_recent_events(
    limit: int = 100,
    job_id: Optional[str] = None,
    module: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Get recent events from the event store"""
    store = _get_event_store()
    return store.get_events(limit=limit, job_id=job_id, module=module)


def get_recent_errors(limit: int = 100) -> List[Dict[str, Any]]:
    """Get recent errors from the event store"""
    store = _get_event_store()
    return store.get_errors(limit=limit)


def get_errors_by_fingerprint() -> Dict[str, Dict[str, Any]]:
    """Get errors grouped by fingerprint"""
    store = _get_event_store()
    return store.get_errors_by_fingerprint()


def get_active_config() -> Dict[str, Any]:
    """Get current application configuration (sanitized)"""
    settings = _get_settings()

    # Extract relevant config without sensitive data
    config = {
        "timestamp": datetime.now().isoformat(),
    }

    # Provider settings (without API keys)
    if "providers" in settings:
        providers = settings["providers"]
        config["providers"] = {
            "tts_selected": providers.get("tts", {}).get("selected"),
            "stt_selected": providers.get("stt", {}).get("selected"),
            "ai_edit_selected": providers.get("ai_edit", {}).get("selected"),
            "translation_selected": providers.get("translation", {}).get("selected"),
        }

    # Performance settings
    if "performance" in settings:
        config["performance"] = settings["performance"]

    # Feature flags
    config["features"] = {
        "dev_mode": os.environ.get("DEV_MODE", "false").lower() == "true",
    }

    return config


def get_versions_info() -> Dict[str, Any]:
    """Get version information for the application and dependencies"""
    versions = {
        "timestamp": datetime.now().isoformat(),
        "app": {
            "version": os.environ.get("APP_VERSION", "dev"),
            "build": os.environ.get("BUILD_TIME", "unknown"),
        },
        "python": {
            "version": sys.version,
            "executable": sys.executable,
        },
        "platform": {
            "system": platform.system(),
            "release": platform.release(),
            "machine": platform.machine(),
        },
    }

    # PyTorch version
    try:
        import torch
        versions["torch"] = {
            "version": torch.__version__,
            "cuda_available": torch.cuda.is_available(),
            "cuda_version": torch.version.cuda if torch.cuda.is_available() else None,
        }
    except ImportError:
        versions["torch"] = {"installed": False}

    # Other key dependencies
    deps = [
        "fastapi",
        "loguru",
        "numpy",
        "scipy",
        "torchaudio",
        "faster_whisper",
        "transformers",
    ]

    versions["dependencies"] = {}
    for dep in deps:
        try:
            mod = __import__(dep)
            versions["dependencies"][dep] = getattr(mod, "__version__", "installed")
        except ImportError:
            versions["dependencies"][dep] = "not installed"

    return versions


def get_system_info() -> Dict[str, Any]:
    """Get system information (GPU, memory, etc.)"""
    info = {
        "timestamp": datetime.now().isoformat(),
        "cpu": {
            "count": os.cpu_count(),
        },
    }

    # Memory info
    try:
        import psutil
        mem = psutil.virtual_memory()
        info["memory"] = {
            "total_gb": round(mem.total / (1024**3), 2),
            "available_gb": round(mem.available / (1024**3), 2),
            "percent_used": mem.percent,
        }

        # Disk info
        disk = psutil.disk_usage("/")
        info["disk"] = {
            "total_gb": round(disk.total / (1024**3), 2),
            "free_gb": round(disk.free / (1024**3), 2),
            "percent_used": disk.percent,
        }
    except ImportError:
        info["memory"] = {"error": "psutil not installed"}
        info["disk"] = {"error": "psutil not installed"}

    # GPU info
    try:
        import torch
        if torch.cuda.is_available():
            info["gpu"] = {
                "count": torch.cuda.device_count(),
                "devices": [],
            }
            for i in range(torch.cuda.device_count()):
                props = torch.cuda.get_device_properties(i)
                info["gpu"]["devices"].append({
                    "index": i,
                    "name": props.name,
                    "total_memory_gb": round(props.total_memory / (1024**3), 2),
                    "major": props.major,
                    "minor": props.minor,
                })

            # Current memory usage
            if torch.cuda.device_count() > 0:
                info["gpu"]["memory_allocated_gb"] = round(
                    torch.cuda.memory_allocated() / (1024**3), 2
                )
                info["gpu"]["memory_reserved_gb"] = round(
                    torch.cuda.memory_reserved() / (1024**3), 2
                )
        else:
            info["gpu"] = {"available": False}
    except ImportError:
        info["gpu"] = {"error": "torch not installed"}

    # FFmpeg info
    try:
        result = subprocess.run(
            ["ffmpeg", "-version"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode == 0:
            first_line = result.stdout.split("\n")[0]
            info["ffmpeg"] = {"version": first_line, "available": True}
        else:
            info["ffmpeg"] = {"available": False}
    except Exception:
        info["ffmpeg"] = {"available": False}

    return info


def get_last_error_report() -> Optional[str]:
    """
    Get a formatted bug report for the most recent error.
    Returns None if no errors are available.
    """
    errors = get_recent_errors(limit=1)
    if not errors:
        return None

    error = errors[0]

    lines = [
        f"**Error:** {error.get('error_name', 'Unknown')} ({error.get('error_code', '?')})",
        f"**Module:** {error.get('module', '?')}.{error.get('function', '?')}",
        f"**Fingerprint:** `{error.get('fingerprint', '?')}`",
    ]

    if error.get("provider") or error.get("model"):
        parts = []
        if error.get("provider"):
            parts.append(f"Provider: {error['provider']}")
        if error.get("model"):
            parts.append(f"Model: {error['model']}")
        lines.append(f"**Config:** {', '.join(parts)}")

    if error.get("duration_ms"):
        lines.append(f"**Duration:** {error['duration_ms']}ms")

    lines.append(f"**Message:** {error.get('message', 'No message')}")

    if error.get("timestamp"):
        lines.append(f"**Time:** {error['timestamp']}")

    return "\n".join(lines)


def create_diagnostic_bundle(
    job_id: Optional[str] = None,
    last_n_events: int = 100,
    include_logs_file: bool = True,
) -> Path:
    """
    Create a ZIP file containing diagnostic information.

    Args:
        job_id: Optional job ID to filter events
        last_n_events: Number of recent events to include
        include_logs_file: Whether to include the events.jsonl file

    Returns:
        Path to the created ZIP file
    """
    get_temp_dir, get_logs_dir, _ = _get_app_paths()

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    bundle_name = f"diagnostic_{timestamp}"
    bundle_dir = get_temp_dir() / bundle_name
    bundle_dir.mkdir(parents=True, exist_ok=True)

    try:
        # 1. Recent events
        events = get_recent_events(limit=last_n_events, job_id=job_id)
        (bundle_dir / "events.json").write_text(
            json.dumps(events, indent=2, ensure_ascii=False, default=str)
        )

        # 2. Recent errors
        errors = get_recent_errors(limit=last_n_events)
        (bundle_dir / "errors.json").write_text(
            json.dumps(errors, indent=2, ensure_ascii=False, default=str)
        )

        # 3. Errors grouped by fingerprint
        errors_grouped = get_errors_by_fingerprint()
        (bundle_dir / "errors_grouped.json").write_text(
            json.dumps(
                list(errors_grouped.values()),
                indent=2,
                ensure_ascii=False,
                default=str,
            )
        )

        # 4. Configuration
        config = get_active_config()
        (bundle_dir / "config.json").write_text(
            json.dumps(config, indent=2, ensure_ascii=False, default=str)
        )

        # 5. Version information
        versions = get_versions_info()
        (bundle_dir / "versions.json").write_text(
            json.dumps(versions, indent=2, ensure_ascii=False, default=str)
        )

        # 6. System information
        system = get_system_info()
        (bundle_dir / "system_info.json").write_text(
            json.dumps(system, indent=2, ensure_ascii=False, default=str)
        )

        # 7. Bug report for last error
        bug_report = get_last_error_report()
        if bug_report:
            (bundle_dir / "bug_report.md").write_text(bug_report)

        # 8. Optionally include recent log file
        if include_logs_file:
            logs_dir = get_logs_dir()
            events_log = logs_dir / "events.jsonl"
            if events_log.exists():
                # Copy last 1000 lines
                try:
                    with open(events_log, "r", encoding="utf-8") as f:
                        lines = f.readlines()[-1000:]
                    (bundle_dir / "events_log.jsonl").write_text("".join(lines))
                except Exception:
                    pass

            errors_log = logs_dir / "errors.jsonl"
            if errors_log.exists():
                try:
                    shutil.copy2(errors_log, bundle_dir / "errors_log.jsonl")
                except Exception:
                    pass

        # Create README
        readme = f"""# Whisperall Diagnostic Bundle

Generated: {datetime.now().isoformat()}
Job ID: {job_id or 'N/A'}

## Contents

- `events.json` - Recent {len(events)} events (structured)
- `errors.json` - Recent {len(errors)} errors
- `errors_grouped.json` - Errors grouped by fingerprint ({len(errors_grouped)} unique)
- `config.json` - Current configuration (sanitized)
- `versions.json` - Application and dependency versions
- `system_info.json` - System information (GPU, memory, etc.)
- `bug_report.md` - Formatted report for the last error (if any)
- `events_log.jsonl` - Raw event log file (last 1000 entries)
- `errors_log.jsonl` - Raw error log file

## How to Use

1. Share this bundle when reporting issues
2. Check `errors_grouped.json` to see recurring errors
3. Check `system_info.json` for hardware/environment issues
4. The fingerprint in `bug_report.md` helps identify duplicate issues
"""
        (bundle_dir / "README.md").write_text(readme)

        # Create ZIP
        zip_path = bundle_dir.with_suffix(".zip")
        shutil.make_archive(str(bundle_dir), "zip", bundle_dir)

        # Clean up directory
        shutil.rmtree(bundle_dir)

        return zip_path

    except Exception as e:
        # Clean up on error
        if bundle_dir.exists():
            shutil.rmtree(bundle_dir, ignore_errors=True)
        raise


def cleanup_old_bundles(max_age_days: int = 7) -> int:
    """
    Remove diagnostic bundles older than max_age_days.
    Returns the number of bundles removed.
    """
    get_temp_dir, _, _ = _get_app_paths()
    temp_dir = get_temp_dir()
    removed = 0

    try:
        cutoff = datetime.now().timestamp() - (max_age_days * 24 * 60 * 60)

        for path in temp_dir.glob("diagnostic_*.zip"):
            if path.stat().st_mtime < cutoff:
                path.unlink()
                removed += 1
    except Exception:
        pass

    return removed
