"""Media import helpers (download from public URLs via yt-dlp)."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Callable, Dict, Optional
from urllib.parse import urlparse


class DownloadCancelled(RuntimeError):
    """Raised when a download is cancelled by the user."""


def is_http_url(url: str) -> bool:
    parsed = urlparse(url.strip())
    return parsed.scheme in ("http", "https") and bool(parsed.netloc)


def sanitize_filename(text: Optional[str]) -> str:
    cleaned = re.sub(r'[\\/*?:"<>|]+', "", text or "").strip()
    return cleaned or "imported_media"


def _get_ffmpeg_path() -> Optional[str]:
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return None


def _coerce_info(info: Dict[str, Any]) -> Dict[str, Any]:
    entries = info.get("entries")
    if entries:
        for entry in entries:
            if entry:
                return entry
    return info


def download_media_from_url(
    url: str,
    output_dir: Path,
    job_id: str,
    progress_callback: Optional[Callable[[float, str], None]] = None,
    should_cancel: Optional[Callable[[], bool]] = None,
) -> Dict[str, Any]:
    if not is_http_url(url):
        raise ValueError("URL must start with http:// or https://")

    try:
        import yt_dlp
    except ImportError as exc:
        raise RuntimeError(
            "Media download feature is not available. Please reinstall the application to enable link imports."
        ) from exc

    output_dir.mkdir(parents=True, exist_ok=True)
    output_template = str(output_dir / f"import_{job_id}.%(ext)s")

    def progress_hook(data: Dict[str, Any]) -> None:
        if should_cancel and should_cancel():
            raise DownloadCancelled("Download cancelled by user")
        if not progress_callback:
            return
        status = data.get("status")
        if status == "downloading":
            total = data.get("total_bytes") or data.get("total_bytes_estimate")
            downloaded = data.get("downloaded_bytes") or 0
            if total:
                pct = max(0.0, min(100.0, downloaded / total * 100.0))
                progress_callback(pct, "Downloading media...")
            else:
                progress_callback(0.0, "Downloading media...")
        elif status == "finished":
            progress_callback(100.0, "Download complete")

    ydl_opts: Dict[str, Any] = {
        "format": "bestaudio/best",
        "noplaylist": True,
        "outtmpl": output_template,
        "quiet": True,
        "no_warnings": True,
        "progress_hooks": [progress_hook],
    }
    ffmpeg_path = _get_ffmpeg_path()
    if ffmpeg_path:
        ydl_opts["ffmpeg_location"] = ffmpeg_path

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
        info = _coerce_info(info)

        file_path = None
        requested = info.get("requested_downloads") or []
        if requested:
            file_path = requested[0].get("filepath") or requested[0].get("filename")
        file_path = file_path or info.get("_filename") or info.get("filepath")
        if not file_path:
            file_path = ydl.prepare_filename(info)

    candidate = Path(file_path)
    if not candidate.exists():
        matches = sorted(output_dir.glob(f"import_{job_id}*"))
        if matches:
            candidate = matches[0]

    if not candidate.exists():
        raise RuntimeError("Download completed but file was not found")

    return {
        "path": candidate,
        "title": info.get("title"),
        "ext": info.get("ext"),
        "source_url": info.get("webpage_url") or url,
        "duration": info.get("duration"),
        "filesize": info.get("filesize") or candidate.stat().st_size,
    }
