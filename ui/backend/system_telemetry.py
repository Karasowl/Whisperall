"""System telemetry helpers (GPU temps/power via nvidia-smi when available)."""

from __future__ import annotations

import datetime
import shutil
import subprocess
from typing import Any, Dict, List, Optional


def _parse_float(value: str) -> Optional[float]:
    if value is None:
        return None
    text = value.strip()
    if not text or text.lower() == "n/a":
        return None
    try:
        return float(text)
    except ValueError:
        return None


def _parse_flag(value: str) -> Optional[bool]:
    if value is None:
        return None
    text = value.strip().lower()
    if not text or text in {"n/a", "not supported", "unsupported"}:
        return None
    if "not active" in text:
        return False
    if "active" in text:
        return True
    if text.startswith("y"):
        return True
    if text.startswith("n"):
        return False
    return None


def _read_nvidia_smi() -> Optional[List[Dict[str, Any]]]:
    exe = shutil.which("nvidia-smi")
    if not exe:
        return None

    base_query = [
        "index",
        "name",
        "temperature.gpu",
        "temperature.memory",
        "power.draw",
        "utilization.gpu",
    ]
    extra_query = [
        "power.limit",
        "clocks_throttle_reasons.active",
        "clocks_throttle_reasons.thermal",
        "clocks_throttle_reasons.sw_power_cap",
        "clocks_throttle_reasons.hw_slowdown",
    ]

    def run_query(fields: List[str]) -> Optional[List[List[str]]]:
        cmd = [exe, f"--query-gpu={','.join(fields)}", "--format=csv,noheader,nounits"]
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=2)
        except Exception:
            return None
        if result.returncode != 0:
            return None
        rows = []
        for line in result.stdout.splitlines():
            line = line.strip()
            if not line:
                continue
            rows.append([p.strip() for p in line.split(",")])
        return rows or None

    rows = run_query(base_query + extra_query)
    used_fields = base_query + extra_query
    if rows is None:
        rows = run_query(base_query)
        used_fields = base_query
    if rows is None:
        return None

    sensors: List[Dict[str, Any]] = []
    for parts in rows:
        if len(parts) < len(base_query):
            continue

        idx_text = parts[0]
        name = parts[1]
        idx = int(idx_text) if idx_text.isdigit() else None
        temp_gpu = _parse_float(parts[2])
        temp_mem = _parse_float(parts[3])
        power_w = _parse_float(parts[4])
        util = _parse_float(parts[5])

        power_limit = None
        throttle = {}
        if len(used_fields) > len(base_query):
            offset = len(base_query)
            power_limit = _parse_float(parts[offset]) if offset < len(parts) else None
            flags = [
                ("active", offset + 1),
                ("thermal", offset + 2),
                ("sw_power_cap", offset + 3),
                ("hw_slowdown", offset + 4),
            ]
            for key, idx_flag in flags:
                if idx_flag < len(parts):
                    throttle[key] = _parse_flag(parts[idx_flag])

        hotspot = None
        hotspot_source = None
        hotspot_kind = None
        if temp_gpu is not None or temp_mem is not None:
            if temp_mem is not None and (temp_gpu is None or temp_mem >= temp_gpu):
                hotspot = temp_mem
                hotspot_source = "memory"
            else:
                hotspot = temp_gpu
                hotspot_source = "core"
            hotspot_kind = "proxy"

        sensors.append(
            {
                "index": idx,
                "name": name,
                "temperature": {
                    "core_c": temp_gpu,
                    "memory_c": temp_mem,
                    "hotspot_c": hotspot,
                    "hotspot_source": hotspot_source,
                    "hotspot_kind": hotspot_kind,
                },
                "power_w": power_w,
                "power_limit_w": power_limit,
                "utilization": util,
                "throttle": throttle or None,
            }
        )

    return sensors or None


def get_system_telemetry() -> Dict[str, Any]:
    """Return basic GPU telemetry if available."""
    timestamp = datetime.datetime.now().isoformat()
    gpu = {"available": False, "reason": "nvidia-smi not found"}

    sensors = _read_nvidia_smi()
    if sensors:
        gpu = {"available": True, "source": "nvidia-smi", "sensors": sensors}

    return {"timestamp": timestamp, "gpu": gpu}
