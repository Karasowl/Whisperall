import asyncio
import logging
import os
import re
import shutil
import subprocess
import tempfile
import time
import uuid
from collections import Counter

from fastapi import APIRouter, Depends, HTTPException
from pathlib import Path
from urllib.parse import urlparse

log = logging.getLogger(__name__)

# Chunk durations match the file-upload pipeline (stores/transcription.ts):
# diarization wants shorter chunks (2-min) because Deepgram produces better
# diarization with less audio per call; non-diarization uses 10-min chunks
# so we can serve long videos (4 h → ~24 chunks) in a manageable number of
# server-side STT rounds when processed concurrently.
URL_CHUNK_SECONDS_DEFAULT = 600  # 10 minutes — ~4.7 MB at 64 kbps mono, well under Groq's 25 MB cap
URL_CHUNK_SECONDS_DIARIZED = 120  # 2 minutes — Deepgram nova-2 sweet spot
# Compressed audio target — mono, 16 kHz, 64 kbps mp3. Whisper-large-v3-turbo
# is trained for telephony-quality audio, so downsampling here does not hurt
# transcription accuracy. 1 h → ~28 MB total, split across 6 chunks → ~4.7 MB
# each; 4 h → ~112 MB total, split across 24 chunks.
URL_AUDIO_BITRATE = "64k"
URL_AUDIO_SAMPLE_RATE = "16000"
URL_AUDIO_CHANNELS = "1"

# Chunk uploads are SERIALIZED (concurrency=1). supabase-py's storage client
# holds a single `httpx.Client` and that client is not thread-safe — calling
# `.upload()` concurrently from multiple threads shares the same SSL socket,
# and HTTP/2 stream frames from different threads interleave mid-write,
# producing `httpx.WriteError: EOF occurred in violation of protocol` and
# killing the whole batch. Going serial is the cheap, correct fix: 24 chunks
# for a 4 h video upload in ~24 s sequentially which is a rounding error vs.
# the download + STT total. We keep the name (and the semaphore) so future
# work can swap in a properly-async httpx implementation.
URL_UPLOAD_CONCURRENCY = 1
# Number of times a single chunk upload is retried before giving up. Covers
# transient SSL hiccups / 502s from Supabase Storage, which otherwise would
# kill the whole batch after one flaky request.
URL_UPLOAD_RETRIES = 2

# How many chunks `run_job` transcribes in parallel against the STT providers.
# Groq's public rate limits allow ~6 concurrent whisper calls; Deepgram is
# similar on nova-2. Going higher risks rate-limit 429s with no meaningful
# speedup; going lower leaves long-video throughput on the table.
STT_CONCURRENCY = 5


def _ffmpeg_executable() -> str:
    """Return the ffmpeg binary path bundled via `imageio-ffmpeg`. Raises
    RuntimeError if the package isn't available — callers turn that into an
    HTTP 500 with `stage=extract` so the client can surface "ffmpeg missing"
    instead of a generic failure.
    """
    try:
        import imageio_ffmpeg  # type: ignore
    except Exception as e:
        raise RuntimeError(f"imageio-ffmpeg not installed: {e}")
    return imageio_ffmpeg.get_ffmpeg_exe()


def _ffprobe_duration_seconds(ffmpeg_path: str, media_path: str) -> float | None:
    """Read media duration via `ffmpeg -i` stderr parsing. imageio-ffmpeg
    ships ffmpeg but NOT ffprobe, so we shell out to ffmpeg itself (which
    prints duration to stderr on a dry read) and regex-scrape it. Returns
    None on any failure — callers fall back to a per-chunk uniform estimate.
    """
    try:
        result = subprocess.run(
            [ffmpeg_path, "-i", media_path],
            capture_output=True,
            text=True,
            timeout=30,
        )
    except Exception:
        return None
    match = re.search(r"Duration:\s*(\d+):(\d+):(\d+\.\d+)", result.stderr or "")
    if not match:
        return None
    hours, minutes, seconds = match.groups()
    try:
        return int(hours) * 3600 + int(minutes) * 60 + float(seconds)
    except Exception:
        return None


def _ffmpeg_split_audio(
    input_bytes: bytes,
    input_ext_hint: str,
    *,
    chunk_seconds: int,
) -> list[tuple[bytes, float | None]]:
    """Compress the input audio to mono mp3 (16 kHz / 64 kbps) and split into
    segments of `chunk_seconds`. Runs a SINGLE ffmpeg invocation using the
    `segment` muxer, so encoding + splitting happens in one pass — roughly
    2-4× faster than "re-encode full, then -ss/-to per chunk".

    Returns a list of `(chunk_bytes, duration_seconds)` tuples in order.
    Duration is `None` for segments where total-duration probe failed; the
    backend's chunk processor handles that case.
    """
    ffmpeg_path = _ffmpeg_executable()
    tmp_dir = tempfile.mkdtemp(prefix="wa-url-split-")
    safe_ext = (input_ext_hint or "bin").strip(".").lower() or "bin"
    input_path = os.path.join(tmp_dir, f"input.{safe_ext}")
    output_glob = os.path.join(tmp_dir, "chunk_%04d.mp3")
    # Also produce a single concatenated mp3 alongside the chunks in the SAME
    # encoding pass. This becomes the playable `audio_url` in Supabase Storage
    # — without it the note's `<audio>` element tries to load the raw YouTube
    # URL and fails with "Could not load audio". Encoding twice in one ffmpeg
    # call is cheap because the decode only happens once.
    full_audio_path = os.path.join(tmp_dir, "source.mp3")
    log.info("[transcribe.url.split] begin bytes=%d ext=%s tmp=%s", len(input_bytes), safe_ext, tmp_dir)
    try:
        t0 = time.monotonic()
        with open(input_path, "wb") as f:
            f.write(input_bytes)
        log.info("[transcribe.url.split] wrote input_file elapsed=%.2fs", time.monotonic() - t0)

        t0 = time.monotonic()
        total_duration = _ffprobe_duration_seconds(ffmpeg_path, input_path)
        log.info("[transcribe.url.split] ffprobe duration=%ss elapsed=%.2fs", total_duration, time.monotonic() - t0)

        # Two outputs from the same decode: segmented chunks + a single
        # concatenated mp3. ffmpeg automatically re-encodes for each output
        # specifier; `-map 0:a` on both ensures audio-only (video track, if
        # present, is ignored).
        cmd = [
            ffmpeg_path,
            "-nostdin", "-hide_banner", "-loglevel", "error",
            "-y",
            "-i", input_path,
            # Output 1: segmented chunks for STT batching.
            "-map", "0:a", "-vn",
            "-ac", URL_AUDIO_CHANNELS,
            "-ar", URL_AUDIO_SAMPLE_RATE,
            "-b:a", URL_AUDIO_BITRATE,
            "-acodec", "libmp3lame",
            "-f", "segment",
            "-segment_time", str(chunk_seconds),
            "-reset_timestamps", "1",
            output_glob,
            # Output 2: single concatenated mp3 for playback / download.
            "-map", "0:a", "-vn",
            "-ac", URL_AUDIO_CHANNELS,
            "-ar", URL_AUDIO_SAMPLE_RATE,
            "-b:a", URL_AUDIO_BITRATE,
            "-acodec", "libmp3lame",
            full_audio_path,
        ]
        estimated_encode_s = max(60, int((total_duration or 600) * 0.2 + 60))
        log.info("[transcribe.url.split] ffmpeg spawn argv_len=%d chunk_seconds=%d timeout=%ds",
                 len(cmd), chunk_seconds, estimated_encode_s)
        t0 = time.monotonic()
        try:
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=estimated_encode_s)
        except subprocess.TimeoutExpired as te:
            log.error("[transcribe.url.split] ffmpeg TIMEOUT after %.1fs (limit %ds)",
                      time.monotonic() - t0, estimated_encode_s)
            raise RuntimeError(f"ffmpeg timed out after {estimated_encode_s}s: {te}")
        encode_elapsed = time.monotonic() - t0
        log.info("[transcribe.url.split] ffmpeg done rc=%d elapsed=%.1fs", proc.returncode, encode_elapsed)
        if proc.returncode != 0:
            tail = (proc.stderr or "")[-500:]
            log.error("[transcribe.url.split] ffmpeg FAILED rc=%d stderr_tail=%s", proc.returncode, tail)
            raise RuntimeError(f"ffmpeg failed (rc={proc.returncode}): {tail}")

        chunk_files = sorted(
            f for f in os.listdir(tmp_dir)
            if f.startswith("chunk_") and f.endswith(".mp3")
        )
        if not chunk_files:
            raise RuntimeError("ffmpeg produced no chunks")
        log.info("[transcribe.url.split] found chunks=%d", len(chunk_files))

        results: list[tuple[bytes, float | None]] = []
        for idx, name in enumerate(chunk_files):
            chunk_path = os.path.join(tmp_dir, name)
            with open(chunk_path, "rb") as cf:
                data = cf.read()
            if total_duration is not None and idx < len(chunk_files) - 1:
                chunk_dur: float | None = float(chunk_seconds)
            elif total_duration is not None:
                chunk_dur = max(0.0, total_duration - chunk_seconds * (len(chunk_files) - 1))
            else:
                chunk_dur = None
            results.append((data, chunk_dur))

        # Read the concatenated full-audio file too — the caller uploads it
        # as the playable source for the note.
        full_audio_bytes: bytes | None = None
        if os.path.exists(full_audio_path):
            with open(full_audio_path, "rb") as f:
                full_audio_bytes = f.read()
            log.info("[transcribe.url.split] full_audio bytes=%d", len(full_audio_bytes))

        log.info("[transcribe.url.split] read_all_chunks=%d total_bytes=%d",
                 len(results), sum(len(d) for d, _ in results))
        # Stash the full audio for the caller via a module-level handoff.
        # Returning a third value would break every caller's unpack; a closure
        # attribute is uglier but contained — we read it back in the endpoint.
        _ffmpeg_split_audio._last_full_audio = full_audio_bytes  # type: ignore[attr-defined]
        return results
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)

from ..auth import get_current_user, check_usage, AuthUser
from ..schemas import TranscribeJobRequest, TranscribeChunkRegister, TranscribeRunRequest, TranscribeUrlRequest, TranscribeJobResponse
from ..db import get_supabase_or_none
from ..providers import groq_stt, deepgram, openai_stt
from ..config import settings
from ..usage_events import record_usage_event

router = APIRouter(prefix="/v1/transcribe", tags=["transcribe"])

EXT_TO_CONTENT_TYPE: dict[str, str] = {
    ".wav": "audio/wav",
    ".mp3": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".mp4": "video/mp4",
    ".aac": "audio/aac",
    ".ogg": "audio/ogg",
    ".oga": "audio/ogg",
    ".webm": "audio/webm",
    ".flac": "audio/flac",
    ".mov": "video/quicktime",
    ".mkv": "video/x-matroska",
}

CONTENT_TYPE_TO_EXT: dict[str, str] = {
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/mpeg": ".mp3",
    "audio/mp3": ".mp3",
    "audio/mp4": ".m4a",
    "audio/aac": ".aac",
    "audio/ogg": ".ogg",
    "audio/webm": ".webm",
    "audio/flac": ".flac",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "video/ogg": ".ogg",
    "video/quicktime": ".mov",
    "video/x-matroska": ".mkv",
}

NON_MEDIA_CONTENT_TYPES: set[str] = {
    "application/json",
    "application/xml",
    "application/xhtml+xml",
}

DEFAULT_URL_FETCH_HEADERS: dict[str, str] = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    )
}

SILENCE_RMS_THRESHOLD = 0.0012
LOW_AUDIO_RMS_THRESHOLD = 0.008
WORD_RE = re.compile(r"[0-9A-Za-zÀ-ÿ']+")


def _guess_audio_meta_from_path(path_or_name: str | None) -> tuple[str, str]:
    suffix = Path(path_or_name or "").suffix.lower()
    content_type = EXT_TO_CONTENT_TYPE.get(suffix, "application/octet-stream")
    filename = f"audio{suffix}" if suffix else "audio.bin"
    return filename, content_type


def _normalize_storage_path(path: str | None) -> str:
    return (path or "").strip().lstrip("/")


def _assert_storage_path_owned_by_user(path: str | None, user_id: str) -> str:
    normalized = _normalize_storage_path(path)
    if not normalized:
        _raise_transcribe_http_error(
            status_code=400,
            detail="Invalid storage path",
            code="TRANSCRIBE_INVALID_STORAGE_PATH",
        )
    expected_prefix = f"{user_id}/"
    if not normalized.startswith(expected_prefix):
        _raise_transcribe_http_error(
            status_code=403,
            detail="Storage path must be scoped to the current user",
            code="TRANSCRIBE_STORAGE_FORBIDDEN",
        )
    return normalized


def _normalize_content_type(raw: str | None) -> str | None:
    if not raw:
        return None
    value = raw.split(";")[0].strip().lower()
    return value or None


def _filename_for_content_type(content_type: str | None, fallback: str) -> str:
    if not content_type:
        return fallback
    ext = CONTENT_TYPE_TO_EXT.get(content_type)
    if not ext:
        return fallback
    return f"audio{ext}"


def _is_likely_non_media_response(content_type: str | None, source_path: str | None) -> bool:
    if not content_type:
        return False
    if content_type.startswith("audio/") or content_type.startswith("video/"):
        return False
    if content_type in {"application/octet-stream", "binary/octet-stream"}:
        return False
    suffix = Path(source_path or "").suffix.lower()
    if suffix in EXT_TO_CONTENT_TYPE:
        return False
    return content_type.startswith("text/") or content_type in NON_MEDIA_CONTENT_TYPES


def _url_not_media_detail(content_type: str | None) -> str:
    observed = f" (content-type: {content_type})" if content_type else ""
    return (
        "The provided URL does not point to downloadable audio/video media"
        f"{observed}. Paste a direct media file URL (mp3, wav, m4a, mp4, webm, ogg, flac), "
        "or download the media and upload it as a file."
    )


def _iter_extraction_candidates(info: dict | None) -> list[dict]:
    if not isinstance(info, dict):
        return []

    if isinstance(info.get("entries"), list):
        first_entry = next((entry for entry in info["entries"] if isinstance(entry, dict)), None)
        if first_entry:
            info = first_entry

    candidates: list[dict] = []

    def collect(candidate: dict | None) -> None:
        if not isinstance(candidate, dict):
            return
        media_url = candidate.get("url")
        if isinstance(media_url, str) and media_url.startswith(("https://", "http://")):
            candidates.append(candidate)

    collect(info)
    for requested in info.get("requested_formats") or []:
        collect(requested)
    for fmt in info.get("formats") or []:
        collect(fmt)

    return candidates


def _candidate_score(candidate: dict) -> tuple[int, float]:
    acodec = str(candidate.get("acodec") or "").lower()
    vcodec = str(candidate.get("vcodec") or "").lower()
    ext = str(candidate.get("ext") or "").lower()

    score = 0
    if acodec and acodec != "none":
        score += 100
    if vcodec == "none":
        score += 60
    if ext in {"m4a", "mp3", "wav", "webm", "ogg", "opus", "flac", "mp4"}:
        score += 20

    bitrate = candidate.get("abr") or candidate.get("tbr") or 0
    try:
        numeric_bitrate = float(bitrate)
    except Exception:
        numeric_bitrate = 0.0

    return score, numeric_bitrate


def _yt_dlp_download_to_bytes(source_url: str) -> tuple[bytes, str | None, str, str | None] | None:
    """Download media via yt-dlp itself (instead of extracting the URL and
    fetching it with httpx).

    Why: yt-dlp has IPv4/IPv6 happy-eyeballs, rotating Google UAs, throttle
    detection, segment-aware retries, and geo/DRM workarounds. httpx has
    none of those and, crucially on Totalplay MX + other Latin-American ISPs,
    takes the broken IPv6 route to `googlevideo.com` and crawls at ~0.2 Mbps
    instead of saturating the user's 500 Mbps fiber. `force_ipv4=True` alone
    on yt-dlp's OWN socket fixes that; using yt-dlp as the downloader end-to-
    end means every future extractor gets the same treatment for free.

    Returns `(audio_bytes, content_type, source_path_hint)` or `None` if the
    extractor couldn't handle the URL at all (caller falls back to the
    "not media" error).
    """
    try:
        import yt_dlp
    except Exception as e:
        log.error("[transcribe.url] yt_dlp import failed — package missing from bundle: %s", e)
        return None

    tmp_dir = tempfile.mkdtemp(prefix="wa-ytdlp-")
    # %(ext)s is replaced by yt-dlp with the real extension after download.
    outtmpl = os.path.join(tmp_dir, "source.%(ext)s")
    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "format": "bestaudio[ext=m4a]/bestaudio/best",
        "outtmpl": {"default": outtmpl},
        # Flip IPv4 ON — Totalplay (and several other MX/LatAm ISPs) have a
        # broken IPv6 route to Google CDN that crawls at dial-up speeds. IPv4
        # is typically fine on the same connection. Browsers use happy-eyeballs
        # to sidestep this; raw httpx does not.
        "force_ipv4": True,
        # Prevent hangs on a dead socket.
        "socket_timeout": 60,
        # yt-dlp's native retry loop. Covers transient 429s, 503s, and
        # Google's "throttled format" rotation.
        "retries": 3,
        "fragment_retries": 3,
        # We write exactly one file (best audio stream). No post-processing
        # needed; ffmpeg will do transcoding downstream.
        "skip_download": False,
        "overwrites": True,
    }

    try:
        t0 = time.monotonic()
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(source_url, download=True)
            downloaded_path = ydl.prepare_filename(info)
        elapsed = time.monotonic() - t0
        # Video/audio title exposed by most extractors (`title` key). Fall
        # back to `fulltitle` (YouTube-specific long form) or None. The
        # endpoint returns this so the client can label the process row and
        # use it as a note title when the user hasn't named the note yet.
        video_title = None
        if isinstance(info, dict):
            raw_title = info.get("title") or info.get("fulltitle")
            if isinstance(raw_title, str):
                video_title = raw_title.strip() or None
        log.info("[transcribe.url] yt_dlp_download done elapsed=%.1fs path=%s title=%s",
                 elapsed, downloaded_path, (video_title or "")[:80])
    except Exception as e:
        log.warning("[transcribe.url] yt_dlp_download failed url=%s err=%s", source_url[:120], e)
        shutil.rmtree(tmp_dir, ignore_errors=True)
        return None

    try:
        if not downloaded_path or not os.path.exists(downloaded_path):
            log.warning("[transcribe.url] yt_dlp reported no output file path=%s", downloaded_path)
            return None
        with open(downloaded_path, "rb") as f:
            data = f.read()
        ext = os.path.splitext(downloaded_path)[1].lstrip(".").lower() or None
        content_type = EXT_TO_CONTENT_TYPE.get(f".{ext}") if ext else None
        source_path_hint = f"/audio.{ext}" if ext else None
        size_mb = len(data) / (1024 * 1024)
        log.info("[transcribe.url] yt_dlp_download bytes=%d (%.1f MB) ct=%s", len(data), size_mb, content_type)
        return data, content_type, source_path_hint or "", video_title
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


async def _download_url_bytes(
    source_url: str,
    hx,
    *,
    headers: dict[str, str] | None = None,
) -> tuple[bytes, str | None, str]:
    """Download bytes from a URL with per-chunk progress logging.

    Streams the body chunk-by-chunk so (a) we can emit progress lines every
    few MB, (b) we never access `resp.content` after the client context has
    closed (which caused silent stalls in earlier versions on large bodies),
    and (c) an oversized body can be detected early without buffering the
    whole thing in memory before the size check fires.
    """
    request_headers = dict(DEFAULT_URL_FETCH_HEADERS)
    if headers:
        request_headers.update(headers)

    log.info("[transcribe.url] stage=resolve download begin url=%s", source_url[:120])
    # 600 s end-to-end budget. A 4 h YouTube video is ~200 MB which needs
    # only ~2.7 Mbps sustained to fit in 10 min; fits residential broadband.
    download_timeout = 600
    # Log a heartbeat every ~4 MB read so a stuck stream doesn't look like
    # a stuck process. Heartbeats also tell us the realized throughput.
    heartbeat_bytes = 4 * 1024 * 1024
    try:
        async with hx.AsyncClient(timeout=download_timeout, follow_redirects=True) as client:
            async with client.stream("GET", source_url, headers=request_headers) as resp:
                if resp.status_code != 200:
                    log.warning(
                        "[transcribe.url] stage=resolve download_non_200 status=%d url=%s",
                        resp.status_code, source_url[:120],
                    )
                    _raise_transcribe_http_error(
                        status_code=400,
                        detail=(
                            f"Source returned HTTP {resp.status_code} — the URL may be "
                            "private, geo-blocked, or no longer available."
                        ),
                        code="TRANSCRIBE_URL_DOWNLOAD_FAILED",
                        stage="resolve",
                    )
                # Read body in chunks and log progress so a slow / stuck
                # download is diagnosable BEFORE the 600 s timeout fires.
                chunks: list[bytes] = []
                total = 0
                next_heartbeat = heartbeat_bytes
                started = time.monotonic()
                async for piece in resp.aiter_bytes(chunk_size=262144):
                    chunks.append(piece)
                    total += len(piece)
                    if total >= next_heartbeat:
                        elapsed = max(0.001, time.monotonic() - started)
                        mbps = (total * 8) / (elapsed * 1_000_000)
                        log.info(
                            "[transcribe.url] stage=resolve download progress bytes=%d mb=%.1f elapsed=%.1fs throughput=%.2f Mbps",
                            total, total / (1024 * 1024), elapsed, mbps,
                        )
                        next_heartbeat += heartbeat_bytes
                # Build body after stream closes cleanly.
                body = b"".join(chunks)
                content_type = _normalize_content_type(resp.headers.get("content-type"))
                source_path = urlparse(str(resp.url)).path
                elapsed = max(0.001, time.monotonic() - started)
                log.info(
                    "[transcribe.url] stage=resolve download done bytes=%d ct=%s elapsed=%.1fs",
                    len(body), content_type, elapsed,
                )
                return body, content_type, source_path
    except hx.TimeoutException as e:
        log.warning("[transcribe.url] stage=resolve download_timeout url=%s", source_url[:120])
        _raise_transcribe_http_error(
            status_code=504,
            detail=(
                f"Download timed out after {download_timeout} s. The source is either "
                f"too large for this connection or the server stopped responding: {e}"
            ),
            code="TRANSCRIBE_URL_DOWNLOAD_TIMEOUT",
            stage="resolve",
        )
    except HTTPException:
        raise
    except Exception as e:
        log.exception("[transcribe.url] stage=resolve download_failed url=%s", source_url[:120])
        _raise_transcribe_http_error(
            status_code=502,
            detail=f"Network error while downloading: {e}",
            code="TRANSCRIBE_URL_DOWNLOAD_FAILED",
            stage="resolve",
        )


async def _resolve_media_from_url(source_url: str, hx) -> tuple[bytes, str | None, str, str | None]:
    """Resolve a URL to raw audio bytes.

    Path 1 (direct media URL like `https://cdn.example.com/audio.mp3`):
        httpx downloads it directly.
    Path 2 (webpage — YouTube, Vimeo, etc.):
        Hand off to yt-dlp's own downloader, which handles IPv4-forced
        sockets + throttle/geo workarounds. Previously we extracted the
        URL and then fetched it with httpx, but that inherited httpx's
        broken IPv6-first behaviour on ISPs with bad Google peering
        (Totalplay MX was the reproducer that surfaced this: 500 Mbps
        fiber, but 0.26 Mbps sustained from googlevideo.com via httpx
        because the traffic took the degraded IPv6 route).
    """
    audio_bytes, content_type, source_path = await _download_url_bytes(source_url, hx)
    if not _is_likely_non_media_response(content_type, source_path):
        # Direct media URLs don't carry metadata — no extractor title available.
        return audio_bytes, content_type, source_path, None

    log.info("[transcribe.url] stage=resolve yt_dlp_download begin (initial fetch was non-media)")
    # Hard wall-clock cap on the yt-dlp download so it can never silently hang
    # the whole request. 20 min covers a 4 h video at ~1.5 Mbps (200 MB); if
    # the user is slower than that, the 30-min client timeout catches it and
    # we surface the standard timeout error.
    try:
        extracted = await asyncio.wait_for(
            asyncio.to_thread(_yt_dlp_download_to_bytes, source_url),
            timeout=20 * 60,
        )
    except asyncio.TimeoutError:
        log.warning("[transcribe.url] stage=resolve yt_dlp_download_timeout after 20 min url=%s", source_url[:120])
        _raise_transcribe_http_error(
            status_code=504,
            detail=(
                "yt-dlp download timed out after 20 minutes. The source may be geo-blocked, "
                "age-gated, rate-limited, or the connection too slow."
            ),
            code="TRANSCRIBE_URL_YTDLP_TIMEOUT",
            stage="resolve",
        )
    if not extracted:
        log.warning("[transcribe.url] stage=resolve yt_dlp_download_failed — url is not extractable or network blocked")
        _raise_transcribe_http_error(
            status_code=400,
            detail=_url_not_media_detail(content_type),
            code="TRANSCRIBE_URL_NOT_MEDIA",
            stage="resolve",
        )

    extracted_bytes, extracted_content_type, extracted_source_path, extracted_title = extracted
    log.info(
        "[transcribe.url] stage=resolve yt_dlp_download succeeded bytes=%d ct=%s path=%s title=%s",
        len(extracted_bytes), extracted_content_type, extracted_source_path, (extracted_title or "")[:80],
    )
    final_source_path = extracted_source_path or source_path
    return extracted_bytes, extracted_content_type, final_source_path, extracted_title


def _require_db():
    db = get_supabase_or_none()
    if not db:
        _raise_transcribe_http_error(
            status_code=503,
            detail="Database not configured",
            code="TRANSCRIBE_DB_UNAVAILABLE",
        )
    return db


def _raise_transcribe_http_error(
    *,
    status_code: int,
    detail: str,
    code: str,
    stage: str | None = None,
    headers: dict[str, str] | None = None,
) -> None:
    """Raise an HTTPException with both machine-readable code and optional
    pipeline `stage`. The client surfaces the stage in the UI so the user can
    tell whether the failure happened while resolving the URL, downloading,
    running STT, etc. — instead of a generic "Transcription failed".
    """
    merged_headers = {"X-Whisperall-Error-Code": code}
    if stage:
        merged_headers["X-Whisperall-Error-Stage"] = stage
    if headers:
        merged_headers.update(headers)
    raise HTTPException(status_code=status_code, detail=detail, headers=merged_headers)


def _is_empty_maybe_single_error(exc: Exception) -> bool:
    code = getattr(exc, "code", None)
    details = (getattr(exc, "details", None) or "").lower()
    text = str(exc).lower()
    return (
        str(code) in {"204", "PGRST116"}
        or "result contains 0 rows" in details
        or "'code': '204'" in text
        or '"code": "204"' in text
        or "missing response" in text
    )


def _load_job_for_user(db, job_id: str, user: AuthUser, columns: str = "*") -> dict:
    try:
        job_res = db.table("transcribe_jobs").select(columns).eq("id", job_id).maybe_single().execute()
    except Exception as exc:
        if _is_empty_maybe_single_error(exc):
            _raise_transcribe_http_error(
                status_code=404,
                detail="Transcription job not found",
                code="TRANSCRIBE_JOB_NOT_FOUND",
            )
        raise
    job_data = job_res.data
    if not job_data:
        _raise_transcribe_http_error(
            status_code=404,
            detail="Transcription job not found",
            code="TRANSCRIBE_JOB_NOT_FOUND",
        )
    if job_data.get("user_id") != user.user_id:
        _raise_transcribe_http_error(
            status_code=403,
            detail="Forbidden",
            code="TRANSCRIBE_FORBIDDEN",
        )
    return job_data


def _latest_chunk_for_index(db, job_id: str, index: int) -> dict | None:
    existing = (
        db.table("transcribe_chunks")
        .select("id,status")
        .eq("job_id", job_id)
        .eq("index", index)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    rows = existing.data or []
    return rows[0] if rows else None


def _chunk_duration_seconds(chunk: dict, default_seconds: float) -> float:
    meta_duration = _chunk_duration_meta_seconds(chunk)
    if meta_duration is not None:
        return meta_duration
    return default_seconds


def _chunk_duration_meta_seconds(chunk: dict) -> float | None:
    result_json = chunk.get("result_json") or {}
    raw_duration = result_json.get("duration_seconds")
    try:
        duration = float(raw_duration)
    except Exception:
        return None
    if duration <= 0:
        return None
    return duration


def _chunk_rms_level(chunk: dict) -> float | None:
    result_json = chunk.get("result_json") or {}
    raw_rms = result_json.get("rms_level")
    try:
        rms = float(raw_rms)
    except Exception:
        return None
    if rms < 0:
        return None
    return rms


def _is_near_silent_chunk(chunk: dict, threshold: float = SILENCE_RMS_THRESHOLD) -> bool:
    rms = _chunk_rms_level(chunk)
    return rms is not None and rms <= threshold


def _chunk_billable_seconds(chunk: dict, default_seconds: float = 300.0) -> int:
    return max(1, int(round(_chunk_duration_seconds(chunk, default_seconds))))


def _merge_chunk_segments(chunks: list[dict], chunk_size_seconds: float = 300.0) -> list[dict]:
    merged: list[dict] = []
    running_offset = 0.0
    sorted_chunks = sorted(chunks, key=lambda c: int(c.get("index", 0)))
    for chunk in sorted_chunks:
        result_json = chunk.get("result_json") or {}
        raw_segments = result_json.get("segments") or []
        offset = running_offset
        for seg in raw_segments:
            text = (seg.get("text") or "").strip()
            if not text:
                continue
            start = float(seg.get("start") or 0.0) + offset
            end = float(seg.get("end") or seg.get("start") or 0.0) + offset
            speaker = seg.get("speaker") or "Speaker 1"
            merged.append(
                {
                    "start": start,
                    "end": end,
                    "text": text,
                    "speaker": speaker,
                }
            )
        running_offset += _chunk_duration_seconds(chunk, chunk_size_seconds)
    merged.sort(key=lambda s: (s.get("start", 0.0), s.get("end", 0.0)))
    return merged


def _segments_to_labeled_text(segments: list[dict]) -> str:
    turns: list[dict[str, str]] = []
    for seg in segments:
        text = " ".join((seg.get("text") or "").split())
        if not text:
            continue
        speaker = (seg.get("speaker") or "Speaker 1").strip() or "Speaker 1"
        if turns and turns[-1]["speaker"] == speaker:
            turns[-1]["text"] = f'{turns[-1]["text"]} {text}'.strip()
            continue
        turns.append({"speaker": speaker, "text": text})

    if not turns:
        return ""
    return "\n\n".join(f'{turn["speaker"]}: {turn["text"]}' for turn in turns).strip()


def _word_count(text: str) -> int:
    return len([part for part in (text or "").split() if part])


def _word_tokens(text: str) -> list[str]:
    return [m.group(0).lower() for m in WORD_RE.finditer(text or "")]


def _text_repetition_stats(text: str) -> dict[str, float]:
    tokens = _word_tokens(text)
    words = len(tokens)
    if words == 0:
        return {
            "word_count": 0.0,
            "unique_ratio": 1.0,
            "top_token_ratio": 0.0,
            "top_bigram_ratio": 0.0,
        }

    token_counts = Counter(tokens)
    top_token_ratio = token_counts.most_common(1)[0][1] / words
    unique_ratio = len(token_counts) / words

    top_bigram_ratio = 0.0
    if words >= 2:
        bigrams = [f"{tokens[i]} {tokens[i + 1]}" for i in range(words - 1)]
        bigram_counts = Counter(bigrams)
        top_bigram_ratio = bigram_counts.most_common(1)[0][1] / max(1, words - 1)

    return {
        "word_count": float(words),
        "unique_ratio": float(unique_ratio),
        "top_token_ratio": float(top_token_ratio),
        "top_bigram_ratio": float(top_bigram_ratio),
    }


def _is_repetitive_text(text: str, rms_level: float | None = None) -> bool:
    stats = _text_repetition_stats(text)
    words = int(stats["word_count"])
    if words < 16:
        return False

    unique_ratio = stats["unique_ratio"]
    top_token_ratio = stats["top_token_ratio"]
    top_bigram_ratio = stats["top_bigram_ratio"]

    repetitive_pattern = (
        (words >= 24 and top_bigram_ratio >= 0.34)
        or (words >= 30 and unique_ratio <= 0.2 and top_token_ratio >= 0.22)
        or (words >= 18 and top_token_ratio >= 0.58)
    )
    if not repetitive_pattern:
        return False

    if rms_level is not None and rms_level <= LOW_AUDIO_RMS_THRESHOLD:
        return True

    return top_bigram_ratio >= 0.44 or unique_ratio <= 0.12 or top_token_ratio >= 0.66


def _chunk_text_quality_score(text: str, rms_level: float | None = None) -> float:
    normalized = " ".join((text or "").split()).strip()
    if not normalized:
        return -1e9

    stats = _text_repetition_stats(normalized)
    words = stats["word_count"]
    unique_ratio = stats["unique_ratio"]
    top_token_ratio = stats["top_token_ratio"]
    top_bigram_ratio = stats["top_bigram_ratio"]

    score = words
    score += unique_ratio * 24.0
    score -= max(0.0, top_token_ratio - 0.34) * words * 2.0
    score -= max(0.0, top_bigram_ratio - 0.22) * words * 2.4
    if rms_level is not None and rms_level <= LOW_AUDIO_RMS_THRESHOLD and words >= 20:
        score -= 10.0
    if _is_repetitive_text(normalized, rms_level):
        score -= max(18.0, words * 0.85)
    return float(score)


def _pick_best_text_candidate(candidates: dict[str, str], rms_level: float | None = None) -> tuple[str, str, bool]:
    best_source = ""
    best_text = ""
    best_score = -1e9

    for source, value in candidates.items():
        text = " ".join((value or "").split()).strip()
        if not text:
            continue
        score = _chunk_text_quality_score(text, rms_level)
        if score > best_score:
            best_score = score
            best_source = source
            best_text = text

    if not best_text:
        return "", "", False
    return best_text, best_source, _is_repetitive_text(best_text, rms_level)


def _should_fallback_to_chunk_text(diarized_text: str, chunk_text: str, chunk_rms: float | None = None) -> bool:
    chunk_words = _word_count(chunk_text)
    if chunk_words == 0:
        return False
    diarized_words = _word_count(diarized_text)
    diarized_repetitive = _is_repetitive_text(diarized_text, chunk_rms)
    chunk_repetitive = _is_repetitive_text(chunk_text, chunk_rms)
    if diarized_repetitive and not chunk_repetitive:
        return True
    if chunk_repetitive and not diarized_repetitive:
        return False
    if diarized_words == 0:
        return True
    # Diarization can return partial utterances; avoid dropping most of the transcript.
    if chunk_words < 30:
        return False
    return diarized_words < max(8, int(chunk_words * 0.35))


@router.post("/jobs", response_model=TranscribeJobResponse)
async def create_job(payload: TranscribeJobRequest, user: AuthUser = Depends(get_current_user)):
    if payload.enable_diarization and not settings.deepgram_api_key:
        _raise_transcribe_http_error(
            status_code=400,
            detail=(
                "Diarization is enabled but DEEPGRAM_API_KEY is not configured. "
                "Set a Deepgram key to use speaker diarization (recommended model: nova-2)."
            ),
            code="DIARIZATION_NOT_CONFIGURED",
        )
    db = _require_db()
    try:
        row = db.table("transcribe_jobs").insert({
            "user_id": user.user_id,
            "language": payload.language,
            "enable_diarization": payload.enable_diarization,
            "enable_translation": payload.enable_translation,
            "target_language": payload.target_language,
            "total_chunks": payload.total_chunks,
        }).execute()
    except Exception as e:
        if "23503" in str(e):
            _raise_transcribe_http_error(
                status_code=400,
                detail="User profile not found. Run migration 005_drop_transcribe_fk.sql or sign in with a real account.",
                code="PROFILE_NOT_FOUND",
            )
        raise
    job = row.data[0]
    return TranscribeJobResponse(
        id=job["id"], status=job["status"],
        processed_chunks=job["processed_chunks"], total_chunks=job["total_chunks"],
    )


@router.post("/jobs/{job_id}/chunks")
async def register_chunk(job_id: str, payload: TranscribeChunkRegister, user: AuthUser = Depends(get_current_user)):
    db = _require_db()
    job = _load_job_for_user(db, job_id, user, columns="id,user_id,total_chunks,status")
    if payload.index >= int(job.get("total_chunks") or 0):
        _raise_transcribe_http_error(
            status_code=400,
            detail="Chunk index out of range for this job",
            code="TRANSCRIBE_CHUNK_INDEX_OUT_OF_RANGE",
        )
    if job.get("status") == "completed":
        _raise_transcribe_http_error(
            status_code=409,
            detail="Cannot register new chunks for a completed job",
            code="TRANSCRIBE_JOB_ALREADY_COMPLETED",
        )

    existing_chunk = _latest_chunk_for_index(db, job_id, payload.index)
    if existing_chunk:
        return {"ok": True, "chunk_id": existing_chunk["id"], "already_registered": True}

    normalized_storage_path = _assert_storage_path_owned_by_user(payload.storage_path, user.user_id)
    chunk_bytes = max(0, int(payload.chunk_bytes or 0))
    if chunk_bytes > 0:
        check_usage(user, "storage_bytes", chunk_bytes)

    try:
        chunk_meta: dict[str, float] = {}
        if payload.duration_seconds is not None and payload.duration_seconds > 0:
            chunk_meta["duration_seconds"] = payload.duration_seconds
        if payload.rms_level is not None and payload.rms_level >= 0:
            chunk_meta["rms_level"] = payload.rms_level
        created = db.table("transcribe_chunks").insert({
            "job_id": job_id,
            "index": payload.index,
            "storage_path": normalized_storage_path,
            "result_json": chunk_meta or None,
        }).execute()
    except Exception as exc:
        # Unique(job_id, index) race condition: return idempotent response.
        if "23505" in str(exc):
            existing_chunk = _latest_chunk_for_index(db, job_id, payload.index)
            return {
                "ok": True,
                "chunk_id": existing_chunk["id"] if existing_chunk else None,
                "already_registered": True,
            }
        raise

    created_rows = created.data or []
    if chunk_bytes > 0:
        try:
            db.rpc("increment_usage", {"p_user_id": user.user_id, "p_storage_bytes": chunk_bytes}).execute()
        except Exception:
            pass
        record_usage_event(
            db,
            user_id=user.user_id,
            module="transcribe_upload",
            provider="supabase-storage",
            model="audio",
            resource="storage_bytes",
            units=chunk_bytes,
            metadata={"job_id": job_id, "chunk_index": payload.index},
        )
    return {
        "ok": True,
        "chunk_id": created_rows[0]["id"] if created_rows else None,
        "already_registered": False,
    }


@router.post("/jobs/{job_id}/run", response_model=TranscribeJobResponse)
async def run_job(job_id: str, payload: TranscribeRunRequest, user: AuthUser = Depends(get_current_user)):
    db = _require_db()
    job = _load_job_for_user(db, job_id, user)
    job_processed_chunks = int(job.get("processed_chunks") or 0)
    job_total_chunks = int(job.get("total_chunks") or 0)
    if job.get("status") == "completed":
        return TranscribeJobResponse(
            id=job_id,
            status="completed",
            processed_chunks=job_processed_chunks,
            total_chunks=job_total_chunks,
        )

    chunks = (
        db.table("transcribe_chunks")
        .select("*")
        .eq("job_id", job_id)
        .eq("status", "pending")
        .order("index")
        .limit(payload.max_chunks)
        .execute()
    )
    pending_chunk_count = len(chunks.data or [])

    if pending_chunk_count == 0:
        if job_processed_chunks >= job_total_chunks:
            db.table("transcribe_jobs").update({"status": "completed", "completed_at": "now()"}).eq("id", job_id).execute()
            return TranscribeJobResponse(
                id=job_id,
                status="completed",
                processed_chunks=job_processed_chunks,
                total_chunks=job_total_chunks,
            )
        next_status = "paused" if job.get("status") == "paused" else "pending"
        db.table("transcribe_jobs").update({"status": next_status}).eq("id", job_id).execute()
        return TranscribeJobResponse(
            id=job_id,
            status=next_status,
            processed_chunks=job_processed_chunks,
            total_chunks=job_total_chunks,
        )

    pending_bill_seconds = sum(
        0 if _is_near_silent_chunk(chunk) else _chunk_billable_seconds(chunk)
        for chunk in (chunks.data or [])
    )
    try:
        if pending_bill_seconds > 0:
            check_usage(user, "transcribe_seconds", pending_bill_seconds)
    except HTTPException as exc:
        if exc.status_code == 429:
            db.table("transcribe_jobs").update({"status": "paused"}).eq("id", job_id).execute()
        raise

    db.table("transcribe_jobs").update({"status": "processing"}).eq("id", job_id).execute()

    try:
        processed = 0
        total_seconds = 0
        enable_diarization = bool(job.get("enable_diarization"))
        if enable_diarization and not settings.deepgram_api_key:
            _raise_transcribe_http_error(
                status_code=400,
                detail=(
                    "This job requires speaker diarization, but DEEPGRAM_API_KEY is not configured. "
                    "Add the key and run again."
                ),
                code="DIARIZATION_NOT_CONFIGURED",
            )

        # Parallelize STT across chunks with a concurrency cap. Each chunk's
        # provider calls are independent; the for-loop's only shared state
        # was the `processed` counter and `total_seconds` accumulator, which
        # we aggregate after gather. This cuts 4 h-video STT time from ~10 min
        # serial to ~2-3 min with STT_CONCURRENCY=5.
        stt_semaphore = asyncio.Semaphore(STT_CONCURRENCY)

        async def _process_one_chunk(chunk: dict) -> tuple[str, dict, str, int, bool]:
            """Transcribe a single chunk. Returns (chunk_id, result_json,
            provider_name, billable_seconds, is_silence_skip). Raises on
            unrecoverable STT failure (the caller will bubble it up through
            asyncio.gather, marking the whole batch failed)."""
            storage_path = chunk["storage_path"]
            filename, content_type = _guess_audio_meta_from_path(storage_path)
            chunk_duration = _chunk_duration_meta_seconds(chunk)
            chunk_rms = _chunk_rms_level(chunk)
            async with stt_semaphore:
                if _is_near_silent_chunk(chunk):
                    result_json = {
                        "text": "",
                        "segments": [] if enable_diarization else None,
                        "silence_skipped": True,
                    }
                    if chunk_duration:
                        result_json["duration_seconds"] = chunk_duration
                    if chunk_rms is not None:
                        result_json["rms_level"] = chunk_rms
                    return chunk["id"], result_json, "silence-skip:rms", 0, True
                # Storage download is sync; off-thread keeps the loop free.
                file_bytes = await asyncio.to_thread(
                    lambda: db.storage.from_("audio").download(storage_path)
                )
                if enable_diarization:
                    diarized = await deepgram.transcribe_chunk_diarized(
                        file_bytes,
                        language=job.get("language"),
                        content_type=content_type,
                    )
                    deepgram_text = (diarized.get("text") or "").strip()
                    try:
                        groq_text = await groq_stt.transcribe_chunk(
                            file_bytes,
                            language=job.get("language"),
                            filename=filename,
                            content_type=content_type,
                        )
                    except Exception:
                        groq_text = ""
                    candidate_text, candidate_source, low_quality = _pick_best_text_candidate(
                        {"groq": groq_text, "deepgram": deepgram_text},
                        chunk_rms,
                    )
                    openai_text = ""
                    if low_quality and settings.openai_api_key:
                        try:
                            openai_text = await openai_stt.transcribe(
                                file_bytes,
                                language=job.get("language"),
                                content_type=content_type,
                            )
                        except Exception:
                            openai_text = ""
                        candidate_text, candidate_source, low_quality = _pick_best_text_candidate(
                            {"openai": openai_text, candidate_source or "primary": candidate_text, "deepgram": deepgram_text},
                            chunk_rms,
                        )
                    text = candidate_text or deepgram_text or (groq_text or "").strip()
                    result_json = {
                        "text": text,
                        "segments": diarized.get("segments") or [],
                    }
                    if candidate_source:
                        result_json["text_source"] = candidate_source
                    if low_quality:
                        result_json["quality_warning"] = "repetitive_text_detected"
                    if chunk_duration:
                        result_json["duration_seconds"] = chunk_duration
                    if chunk_rms is not None:
                        result_json["rms_level"] = chunk_rms
                    provider_parts = ["groq:whisper-large-v3-turbo", "deepgram:nova-2"]
                    if openai_text:
                        provider_parts.append("openai:gpt-4o-mini-transcribe")
                    provider_name = "+".join(provider_parts)
                else:
                    groq_text = await groq_stt.transcribe_chunk(
                        file_bytes,
                        language=job.get("language"),
                        filename=filename,
                        content_type=content_type,
                    )
                    candidate_text, candidate_source, low_quality = _pick_best_text_candidate(
                        {"groq": groq_text},
                        chunk_rms,
                    )
                    deepgram_text = ""
                    openai_text = ""
                    if low_quality and settings.deepgram_api_key:
                        try:
                            deepgram_text = await deepgram.transcribe_chunk(
                                file_bytes,
                                language=job.get("language"),
                                content_type=content_type,
                            )
                        except Exception:
                            deepgram_text = ""
                    if low_quality and settings.openai_api_key:
                        try:
                            openai_text = await openai_stt.transcribe(
                                file_bytes,
                                language=job.get("language"),
                                content_type=content_type,
                            )
                        except Exception:
                            openai_text = ""
                    if deepgram_text or openai_text:
                        candidate_text, candidate_source, low_quality = _pick_best_text_candidate(
                            {
                                "deepgram": deepgram_text,
                                "openai": openai_text,
                                candidate_source or "groq": candidate_text,
                            },
                            chunk_rms,
                        )
                    text = candidate_text or (groq_text or "").strip() or deepgram_text or openai_text
                    result_json = {"text": text}
                    if candidate_source:
                        result_json["text_source"] = candidate_source
                    if low_quality:
                        result_json["quality_warning"] = "repetitive_text_detected"
                    if chunk_duration:
                        result_json["duration_seconds"] = chunk_duration
                    if chunk_rms is not None:
                        result_json["rms_level"] = chunk_rms
                    provider_parts = ["groq:whisper-large-v3-turbo"]
                    if deepgram_text:
                        provider_parts.append("deepgram:nova-2")
                    if openai_text:
                        provider_parts.append("openai:gpt-4o-mini-transcribe")
                    provider_name = "+".join(provider_parts)
                billable = _chunk_billable_seconds(chunk)
                return chunk["id"], result_json, provider_name, billable, False

        log.info("[transcribe.run_job] starting STT on %d chunks (concurrency=%d diarize=%s)",
                 pending_chunk_count, STT_CONCURRENCY, enable_diarization)
        # `return_exceptions=True` so a single bad chunk doesn't blow up the
        # whole batch — we record the partial progress and surface the first
        # error afterwards, matching the serial-loop semantics.
        chunk_results = await asyncio.gather(
            *[_process_one_chunk(c) for c in (chunks.data or [])],
            return_exceptions=True,
        )

        first_exc: BaseException | None = None
        for res in chunk_results:
            if isinstance(res, BaseException):
                if first_exc is None:
                    first_exc = res
                continue
            chunk_id, result_json, provider_name, billable, is_silence = res
            # DB writes stay sequential — supabase-py is sync and concurrent
            # table updates confuse its internal connection pool.
            db.table("transcribe_chunks").update({
                "status": "done",
                "result_json": result_json,
                "provider": provider_name,
            }).eq("id", chunk_id).execute()
            processed += 1
            if not is_silence:
                total_seconds += billable
        if first_exc is not None:
            log.exception("[transcribe.run_job] at least one chunk failed",
                          exc_info=(type(first_exc), first_exc, first_exc.__traceback__))
            raise first_exc

        new_count = job_processed_chunks + processed
        remaining_pending = (
            db.table("transcribe_chunks")
            .select("id")
            .eq("job_id", job_id)
            .eq("status", "pending")
            .limit(1)
            .execute()
        )
        has_remaining_pending = len(remaining_pending.data or []) > 0
        if new_count >= job_total_chunks:
            new_status = "completed"
        elif has_remaining_pending:
            new_status = "processing"
        else:
            new_status = "pending"
        update = {"processed_chunks": new_count, "status": new_status}
        if new_status == "completed":
            update["completed_at"] = "now()"
        db.table("transcribe_jobs").update(update).eq("id", job_id).execute()

        if total_seconds > 0:
            db.rpc("increment_usage", {"p_user_id": user.user_id, "p_transcribe_seconds": total_seconds}).execute()
            record_usage_event(
                db,
                user_id=user.user_id,
                module="transcribe",
                provider="groq",
                model="whisper-large-v3-turbo",
                resource="transcribe_seconds",
                units=total_seconds,
                metadata={"job_id": job_id, "chunks_processed": processed, "enable_diarization": enable_diarization},
            )
            if enable_diarization:
                record_usage_event(
                    db,
                    user_id=user.user_id,
                    module="transcribe",
                    provider="deepgram",
                    model="nova-2",
                    resource="transcribe_seconds",
                    units=total_seconds,
                    metadata={"job_id": job_id, "chunks_processed": processed, "enable_diarization": True},
                )

        if new_status == "completed":
            all_chunks = db.table("transcribe_chunks").select("index,result_json").eq("job_id", job_id).order("index").execute()
            chunk_text = " ".join(
                (c.get("result_json") or {}).get("text", "").strip()
                for c in (all_chunks.data or [])
                if (c.get("result_json") or {}).get("text")
            ).strip()
            merged_segments = _merge_chunk_segments(all_chunks.data or []) if enable_diarization else None
            if enable_diarization:
                labeled_text = _segments_to_labeled_text(merged_segments or [])
                if _should_fallback_to_chunk_text(labeled_text, chunk_text):
                    full_text = chunk_text
                    merged_segments = None
                else:
                    full_text = labeled_text
            else:
                full_text = chunk_text
            if not full_text:
                full_text = chunk_text
            db.table("transcripts").insert({
                "job_id": job_id,
                "plain_text": full_text.strip(),
                "segments": merged_segments,
            }).execute()
            try:
                db.table("history").insert({
                    "user_id": user.user_id, "module": "transcribe",
                    "output_text": full_text[:500],
                    "metadata": {
                        "job_id": job_id,
                        "chunks": new_count,
                        "enable_diarization": enable_diarization,
                        "diarization_provider": "deepgram:nova-2" if enable_diarization else None,
                    },
                }).execute()
            except Exception:
                pass

        return TranscribeJobResponse(id=job_id, status=new_status, processed_chunks=new_count, total_chunks=job_total_chunks)
    except HTTPException as exc:
        failure_status = "paused" if exc.status_code == 429 else "failed"
        db.table("transcribe_jobs").update({"status": failure_status}).eq("id", job_id).execute()
        raise
    except Exception:
        db.table("transcribe_jobs").update({"status": "failed"}).eq("id", job_id).execute()
        raise


@router.post("/from-url-job", response_model=TranscribeJobResponse)
async def transcribe_from_url_as_job(payload: TranscribeUrlRequest, user: AuthUser = Depends(get_current_user)):
    """Create a chunked transcription job from a URL.

    This is the Option B successor to `/from-url`. Where `/from-url` sent the
    whole downloaded audio to the STT provider in one call (25 MB cap, 60 s
    provider timeout, no chunking → long YouTube videos always failed), this
    endpoint:

        1. resolve — download the media (yt-dlp + httpx) just like /from-url.
        2. extract+split — ffmpeg transcodes to mono 16 kHz 64 kbps mp3 and
           segments it into N pieces of `URL_CHUNK_SECONDS_*`. One ffmpeg
           invocation, single encode pass.
        3. upload — push each chunk to Supabase Storage under
           `{user_id}/url-chunks/{job_id}/{index}.mp3`.
        4. register — create `transcribe_jobs` + `transcribe_chunks` rows.
        5. return the job row. The CLIENT then runs the existing
           `/jobs/{id}/run` batch loop (same as file uploads).

    Every stage logs + raises with `X-Whisperall-Error-Stage` so the client
    can tell *which* step broke in a UI card.
    """
    db = _require_db()
    check_usage(user, "transcribe_seconds", 300)
    log.info("[transcribe.urljob] start url=%s diarize=%s lang=%s", payload.url, payload.enable_diarization, payload.language)

    # -- Stage: resolve ---------------------------------------------------
    import httpx as hx
    try:
        audio_bytes, response_content_type, source_path, video_title = await _resolve_media_from_url(payload.url, hx)
    except HTTPException:
        raise
    except Exception as e:
        log.exception("[transcribe.urljob] stage=resolve failed")
        _raise_transcribe_http_error(
            status_code=502,
            detail=f"Could not resolve or download media: {e}",
            code="TRANSCRIBE_URL_RESOLVE_FAILED",
            stage="resolve",
        )
    log.info("[transcribe.urljob] stage=resolve done bytes=%d content_type=%s path=%s title=%s",
             len(audio_bytes), response_content_type, source_path, (video_title or "")[:80])

    # Early reject if the file is suspiciously small (likely an error page
    # disguised as audio — htmx redirect, captcha challenge etc.).
    if len(audio_bytes) < 1024:
        log.warning("[transcribe.urljob] stage=resolve suspicious_tiny bytes=%d", len(audio_bytes))
        _raise_transcribe_http_error(
            status_code=400,
            detail=(
                f"Source returned only {len(audio_bytes)} bytes — probably not real media. "
                "The URL may require auth or the video is unavailable."
            ),
            code="TRANSCRIBE_URL_TOO_SMALL",
            stage="resolve",
        )

    # -- Stage: extract+split --------------------------------------------
    chunk_seconds = URL_CHUNK_SECONDS_DIARIZED if payload.enable_diarization else URL_CHUNK_SECONDS_DEFAULT
    ext_hint = (Path(source_path or "").suffix.lstrip(".") or "bin").lower()
    try:
        chunks = await asyncio.to_thread(
            _ffmpeg_split_audio,
            audio_bytes,
            ext_hint,
            chunk_seconds=chunk_seconds,
        )
    except Exception as e:
        log.exception("[transcribe.urljob] stage=extract failed")
        _raise_transcribe_http_error(
            status_code=500,
            detail=(
                f"Failed to extract and split audio with ffmpeg: {e}. "
                "If this persists, the source format may be unsupported."
            ),
            code="TRANSCRIBE_URL_EXTRACT_FAILED",
            stage="extract",
        )
    if not chunks:
        _raise_transcribe_http_error(
            status_code=500,
            detail="Audio extraction produced no chunks.",
            code="TRANSCRIBE_URL_EXTRACT_EMPTY",
            stage="extract",
        )
    log.info("[transcribe.urljob] stage=extract done chunks=%d", len(chunks))

    # Capture the full-audio bytes produced alongside the chunks. ffmpeg
    # emitted both in the same encoding pass (`source.mp3` next to the
    # chunk_%04d.mp3 files) so this is effectively free. Guard against a
    # MagicMock patch of `_ffmpeg_split_audio` returning an auto-created
    # attribute stub: only accept real, non-empty bytes.
    _raw_full = getattr(_ffmpeg_split_audio, "_last_full_audio", None)
    full_audio_bytes: bytes | None = _raw_full if isinstance(_raw_full, (bytes, bytearray)) and len(_raw_full) > 0 else None
    if full_audio_bytes is not None:
        log.info("[transcribe.urljob] stage=extract full_audio bytes=%d", len(full_audio_bytes))

    # -- Stage: register (create job row) --------------------------------
    if payload.enable_diarization and not settings.deepgram_api_key:
        _raise_transcribe_http_error(
            status_code=400,
            detail=(
                "Diarization is enabled but DEEPGRAM_API_KEY is not configured. "
                "Set a Deepgram key to use speaker diarization (recommended model: nova-2)."
            ),
            code="DIARIZATION_NOT_CONFIGURED",
            stage="register",
        )
    try:
        row = db.table("transcribe_jobs").insert({
            "user_id": user.user_id,
            "language": payload.language,
            "enable_diarization": payload.enable_diarization,
            "enable_translation": False,
            "total_chunks": len(chunks),
        }).execute()
    except Exception as e:
        log.exception("[transcribe.urljob] stage=register job_insert_failed")
        if "23503" in str(e):
            _raise_transcribe_http_error(
                status_code=400,
                detail="User profile not found. Run migration 005_drop_transcribe_fk.sql or sign in with a real account.",
                code="PROFILE_NOT_FOUND",
                stage="register",
            )
        _raise_transcribe_http_error(
            status_code=500,
            detail=f"Could not create transcription job row: {e}",
            code="TRANSCRIBE_JOB_INSERT_FAILED",
            stage="register",
        )
    job = row.data[0]
    job_id = job["id"]
    log.info("[transcribe.urljob] stage=register job=%s chunks=%d", job_id, len(chunks))

    # -- Stage: upload (push each chunk to storage + register chunk row) -
    # Parallelized with a semaphore: 24 chunks for a 4 h video uploaded
    # sequentially takes ~48 s @ 2 s/upload; parallelized at URL_UPLOAD_CONCURRENCY
    # the same work lands in ~8-10 s. Supabase service-role has no practical
    # concurrency limit for uploads. We still keep DB chunk-row inserts
    # sequential after gather so the 23505 (unique) path stays predictable.
    upload_semaphore = asyncio.Semaphore(URL_UPLOAD_CONCURRENCY)
    storage_paths: list[str] = [
        f"{user.user_id}/url-chunks/{job_id}/{i:04d}.mp3" for i in range(len(chunks))
    ]

    async def _upload_one(i: int) -> None:
        async with upload_semaphore:
            # supabase-py storage is sync → run in a worker thread. We keep
            # URL_UPLOAD_CONCURRENCY=1 to guarantee exclusive access to the
            # library's shared httpx client; see the constant's docstring.
            def _do_upload() -> None:
                db.storage.from_("audio").upload(
                    storage_paths[i],
                    chunks[i][0],
                    {"content-type": "audio/mpeg"},
                )
            last_err: Exception | None = None
            for attempt in range(URL_UPLOAD_RETRIES + 1):
                try:
                    await asyncio.to_thread(_do_upload)
                    if attempt > 0:
                        log.info("[transcribe.urljob] stage=upload chunk=%d recovered_after_retries=%d", i, attempt)
                    return
                except Exception as e:
                    last_err = e
                    # Log the specific error class so we can distinguish
                    # transient SSL write issues from permanent 4xx rejections.
                    log.warning(
                        "[transcribe.urljob] stage=upload chunk=%d attempt=%d/%d err_type=%s err=%s",
                        i, attempt + 1, URL_UPLOAD_RETRIES + 1, type(e).__name__, e,
                    )
                    if attempt < URL_UPLOAD_RETRIES:
                        # Small backoff so the server / SSL state has a moment to recover.
                        await asyncio.sleep(0.5 * (attempt + 1))
            assert last_err is not None
            raise last_err

    try:
        await asyncio.gather(*[_upload_one(i) for i in range(len(chunks))])
    except Exception as e:
        log.exception("[transcribe.urljob] stage=upload failed")
        try:
            db.table("transcribe_jobs").update({"status": "failed"}).eq("id", job_id).execute()
        except Exception:
            pass
        _raise_transcribe_http_error(
            status_code=502,
            detail=f"Chunk upload to storage failed: {e}",
            code="TRANSCRIBE_URL_UPLOAD_FAILED",
            stage="upload",
        )

    # Sequential DB inserts — Supabase supports batch insert but the
    # per-row error diagnostics are clearer with one-at-a-time.
    for i, (_, duration_s) in enumerate(chunks):
        try:
            chunk_meta: dict = {}
            if duration_s is not None:
                chunk_meta["duration_seconds"] = float(duration_s)
            db.table("transcribe_chunks").insert({
                "job_id": job_id,
                "index": i,
                "storage_path": storage_paths[i],
                "result_json": chunk_meta or None,
            }).execute()
        except Exception as e:
            log.exception("[transcribe.urljob] stage=register chunk_row=%d failed", i)
            try:
                db.table("transcribe_jobs").update({"status": "failed"}).eq("id", job_id).execute()
            except Exception:
                pass
            _raise_transcribe_http_error(
                status_code=500,
                detail=f"Could not register chunk {i}: {e}",
                code="TRANSCRIBE_URL_CHUNK_REGISTER_FAILED",
                stage="register",
            )
    log.info("[transcribe.urljob] stage=upload done chunks=%d job=%s", len(chunks), job_id)

    # Upload the playable full-audio mp3 so the note's audio player has
    # something to load. YouTube watch URLs can't be played by the browser's
    # <audio> tag (they're webpages, not media), and we already produced this
    # file as a side-output of the chunk-split. Fire-and-forget-ish: if it
    # fails we log and continue — the transcription already succeeded, we
    # just won't have a playable audio attached.
    audio_public_url: str | None = None
    if full_audio_bytes is not None:
        audio_storage_path = f"{user.user_id}/url-media/{job_id}/audio.mp3"
        try:
            def _do_upload_full() -> None:
                db.storage.from_("audio").upload(
                    audio_storage_path,
                    full_audio_bytes,
                    {"content-type": "audio/mpeg"},
                )
            await asyncio.to_thread(_do_upload_full)
            audio_public_url = db.storage.from_("audio").get_public_url(audio_storage_path)
            log.info("[transcribe.urljob] stage=upload full_audio path=%s url=%s",
                     audio_storage_path, audio_public_url[:120] if audio_public_url else "")
        except Exception as e:
            log.warning("[transcribe.urljob] stage=upload full_audio_failed err=%s", e)

    return TranscribeJobResponse(
        id=job_id,
        status=job.get("status") or "pending",
        processed_chunks=int(job.get("processed_chunks") or 0),
        total_chunks=len(chunks),
        title=video_title,
        audio_url=audio_public_url,
    )


@router.post("/from-url")
async def transcribe_from_url(payload: TranscribeUrlRequest, user: AuthUser = Depends(get_current_user)):
    """Transcribe a remote URL. Instrumented per stage so failures carry the
    stage name back to the client (via `X-Whisperall-Error-Stage` header and
    the `stage` field on `ApiError`). Stages, in order:

        resolve       → resolve the URL + download the raw bytes (incl. yt-dlp)
        size_check    → enforce the 25 MB single-blob limit
        diarize       → Deepgram nova-2 pass (only if enable_diarization)
        transcribe    → Groq whisper-large-v3-turbo (primary STT)
        fallback_stt  → OpenAI / Deepgram fallback when primary low-quality
        save          → DB usage increment + history row

    Every stage logs an info line on entry and exits with a clearly-scoped
    error on failure. This replaces the previous catch-all that swallowed
    provider exceptions into the same generic message.
    """
    import httpx as hx
    db = _require_db()
    check_usage(user, "transcribe_seconds", 300)
    log.info("[transcribe.url] start url=%s diarize=%s lang=%s", payload.url, payload.enable_diarization, payload.language)

    # -- Stage: resolve ---------------------------------------------------
    log.info("[transcribe.url] stage=resolve begin")
    try:
        audio_bytes, response_content_type, source_path, _video_title = await _resolve_media_from_url(payload.url, hx)
    except HTTPException:
        # _resolve_media_from_url already raises structured errors via
        # _raise_transcribe_http_error — keep their stage if set, else tag.
        raise
    except Exception as e:
        log.exception("[transcribe.url] stage=resolve failed")
        _raise_transcribe_http_error(
            status_code=502,
            detail=f"Could not resolve or download media: {e}",
            code="TRANSCRIBE_URL_RESOLVE_FAILED",
            stage="resolve",
        )
    log.info("[transcribe.url] stage=resolve done bytes=%d content_type=%s path=%s", len(audio_bytes), response_content_type, source_path)

    lang = payload.language if payload.language and payload.language != "auto" else None
    filename, guessed_content_type = _guess_audio_meta_from_path(source_path)
    content_type = response_content_type or guessed_content_type

    # -- Stage: size_check ------------------------------------------------
    if len(audio_bytes) > 25 * 1024 * 1024:
        size_mb = len(audio_bytes) / (1024 * 1024)
        log.warning("[transcribe.url] stage=size_check rejected bytes=%d (%.1f MB)", len(audio_bytes), size_mb)
        _raise_transcribe_http_error(
            status_code=413,
            detail=(
                f"Audio is {size_mb:.1f} MB; the URL pipeline currently caps at 25 MB. "
                "Use file upload for large files — it splits into chunks automatically."
            ),
            code="TRANSCRIBE_FILE_TOO_LARGE",
            stage="size_check",
        )
    log.info("[transcribe.url] stage=size_check pass bytes=%d", len(audio_bytes))

    filename = _filename_for_content_type(content_type, filename)

    # -- Stage: diarize / transcribe / fallback_stt ----------------------
    if payload.enable_diarization:
        if not settings.deepgram_api_key:
            log.warning("[transcribe.url] stage=diarize misconfigured (no DEEPGRAM_API_KEY)")
            _raise_transcribe_http_error(
                status_code=400,
                detail=(
                    "Diarization is enabled but DEEPGRAM_API_KEY is not configured. "
                    "Set a Deepgram key to use speaker diarization (recommended model: nova-2)."
                ),
                code="DIARIZATION_NOT_CONFIGURED",
                stage="diarize",
            )
        log.info("[transcribe.url] stage=diarize begin (deepgram:nova-2)")
        try:
            diarized = await deepgram.transcribe_chunk_diarized(
                audio_bytes,
                language=lang,
                content_type=content_type,
            )
        except hx.HTTPStatusError as e:
            log.exception("[transcribe.url] stage=diarize http_error status=%s", e.response.status_code if e.response else "?")
            _raise_transcribe_http_error(
                status_code=502,
                detail=f"Deepgram rejected the audio: {e.response.text if e.response else str(e)}",
                code="TRANSCRIBE_DIARIZE_FAILED",
                stage="diarize",
            )
        except Exception as e:
            log.exception("[transcribe.url] stage=diarize failed")
            _raise_transcribe_http_error(
                status_code=502,
                detail=f"Diarization failed: {e}",
                code="TRANSCRIBE_DIARIZE_FAILED",
                stage="diarize",
            )

        log.info("[transcribe.url] stage=transcribe begin (groq:whisper-large-v3-turbo)")
        quality_text = ""
        try:
            quality_text = await groq_stt.transcribe_chunk(
                audio_bytes,
                language=lang,
                filename=filename,
                content_type=content_type,
            )
        except Exception as e:
            # Non-fatal when diarization is the main signal — we'll fall back
            # to deepgram_text below. Log with stacktrace so we see the real
            # provider error instead of silently swallowing it.
            log.warning("[transcribe.url] stage=transcribe groq_failed fallback_to_diarized err=%s", e)

        deepgram_text = (diarized.get("text") or "").strip()
        text, _, low_quality = _pick_best_text_candidate(
            {"groq": quality_text, "deepgram": deepgram_text},
            None,
        )
        if low_quality and settings.openai_api_key:
            log.info("[transcribe.url] stage=fallback_stt begin (openai)")
            openai_text = ""
            try:
                openai_text = await openai_stt.transcribe(
                    audio_bytes,
                    language=lang,
                    content_type=content_type,
                )
            except Exception as e:
                log.warning("[transcribe.url] stage=fallback_stt openai_failed err=%s", e)
            text, _, _ = _pick_best_text_candidate(
                {"openai": openai_text, "deepgram": deepgram_text, "groq": quality_text},
                None,
            )
        text = (text or deepgram_text or (quality_text or "").strip()).strip()
        segments = diarized.get("segments") or None
        labeled = _segments_to_labeled_text(segments or [])
        if labeled and not _should_fallback_to_chunk_text(labeled, text):
            text = labeled
    else:
        log.info("[transcribe.url] stage=transcribe begin (groq:whisper-large-v3-turbo)")
        try:
            groq_text = await groq_stt.transcribe_chunk(
                audio_bytes,
                language=lang,
                filename=filename,
                content_type=content_type,
            )
        except hx.HTTPStatusError as e:
            log.exception("[transcribe.url] stage=transcribe http_error status=%s", e.response.status_code if e.response else "?")
            _raise_transcribe_http_error(
                status_code=502,
                detail=f"Groq rejected the audio: {e.response.text if e.response else str(e)}",
                code="TRANSCRIBE_STT_FAILED",
                stage="transcribe",
            )
        except Exception as e:
            log.exception("[transcribe.url] stage=transcribe failed")
            _raise_transcribe_http_error(
                status_code=502,
                detail=f"Transcription provider failed: {e}",
                code="TRANSCRIBE_STT_FAILED",
                stage="transcribe",
            )
        text, _, low_quality = _pick_best_text_candidate({"groq": groq_text}, None)
        deepgram_text = ""
        if low_quality and settings.deepgram_api_key:
            log.info("[transcribe.url] stage=fallback_stt begin (deepgram)")
            try:
                deepgram_text = await deepgram.transcribe_chunk(
                    audio_bytes,
                    language=lang,
                    content_type=content_type,
                )
            except Exception as e:
                log.warning("[transcribe.url] stage=fallback_stt deepgram_failed err=%s", e)
                deepgram_text = ""
            text, _, _ = _pick_best_text_candidate({"deepgram": deepgram_text, "groq": groq_text}, None)
        text = (text or (groq_text or "").strip() or deepgram_text).strip()
        segments = None
    log.info("[transcribe.url] stage=transcribe done text_len=%d segments=%s", len(text or ""), len(segments) if segments else 0)

    # -- Stage: save ------------------------------------------------------
    log.info("[transcribe.url] stage=save begin")
    try:
        db.rpc("increment_usage", {"p_user_id": user.user_id, "p_transcribe_seconds": 300}).execute()
        record_usage_event(
            db,
            user_id=user.user_id,
            module="transcribe_from_url",
            provider="groq",
            model="whisper-large-v3-turbo",
            resource="transcribe_seconds",
            units=300,
            metadata={"url": payload.url, "enable_diarization": payload.enable_diarization},
        )
        if payload.enable_diarization:
            record_usage_event(
                db,
                user_id=user.user_id,
                module="transcribe_from_url",
                provider="deepgram",
                model="nova-2",
                resource="transcribe_seconds",
                units=300,
                metadata={"url": payload.url, "enable_diarization": True},
            )
        try:
            db.table("history").insert({
                "user_id": user.user_id, "module": "transcribe",
                "output_text": text[:500],
                "metadata": {
                    "url": payload.url,
                    "enable_diarization": payload.enable_diarization,
                    "diarization_provider": "deepgram:nova-2" if payload.enable_diarization else None,
                },
            }).execute()
        except Exception as e:
            log.warning("[transcribe.url] stage=save history_insert_failed err=%s", e)
    except Exception as e:
        # Usage recording failure shouldn't lose the transcription result —
        # log and keep going. The user gets the text even if billing didn't update.
        log.exception("[transcribe.url] stage=save usage_failed err=%s", e)
    log.info("[transcribe.url] done url=%s", payload.url)

    return {"text": text, "segments": segments}


@router.get("/jobs/{job_id}", response_model=TranscribeJobResponse)
async def get_job(job_id: str, user: AuthUser = Depends(get_current_user)):
    db = _require_db()
    job = _load_job_for_user(db, job_id, user)
    return TranscribeJobResponse(
        id=job["id"], status=job["status"],
        processed_chunks=job["processed_chunks"], total_chunks=job["total_chunks"],
    )


@router.get("/jobs/{job_id}/result")
async def get_result(job_id: str, user: AuthUser = Depends(get_current_user)):
    db = _require_db()
    _load_job_for_user(db, job_id, user, columns="user_id")
    transcript = db.table("transcripts").select("plain_text, segments").eq("job_id", job_id).maybe_single().execute()
    if not transcript.data:
        _raise_transcribe_http_error(
            status_code=404,
            detail="Result not ready",
            code="TRANSCRIBE_RESULT_NOT_READY",
        )
    return {"text": transcript.data["plain_text"], "segments": transcript.data.get("segments")}
