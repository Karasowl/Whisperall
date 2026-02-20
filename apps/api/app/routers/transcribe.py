import asyncio
import re
from collections import Counter

from fastapi import APIRouter, Depends, HTTPException
from pathlib import Path
from urllib.parse import urlparse

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


def _extract_media_download_target(source_url: str) -> tuple[str, str | None] | None:
    try:
        import yt_dlp
    except Exception:
        return None

    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "extract_flat": False,
        "skip_download": True,
        "format": "bestaudio[ext=m4a]/bestaudio/best",
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(source_url, download=False)
    except Exception:
        return None

    candidates = _iter_extraction_candidates(info)
    if not candidates:
        return None

    best = max(candidates, key=_candidate_score)
    media_url = best.get("url")
    if not isinstance(media_url, str) or not media_url:
        return None

    ext = str(best.get("ext") or "").lower()
    source_path_hint = f"/audio.{ext}" if ext else None
    return media_url, source_path_hint


async def _download_url_bytes(
    source_url: str,
    hx,
    *,
    headers: dict[str, str] | None = None,
) -> tuple[bytes, str | None, str]:
    request_headers = dict(DEFAULT_URL_FETCH_HEADERS)
    if headers:
        request_headers.update(headers)

    async with hx.AsyncClient(timeout=120, follow_redirects=True) as client:
        resp = await client.get(source_url, headers=request_headers)
        if resp.status_code != 200:
            _raise_transcribe_http_error(
                status_code=400,
                detail="Could not download audio from URL",
                code="TRANSCRIBE_URL_DOWNLOAD_FAILED",
            )
        content_type = _normalize_content_type(resp.headers.get("content-type"))
        source_path = urlparse(str(resp.url)).path
        return resp.content, content_type, source_path


async def _resolve_media_from_url(source_url: str, hx) -> tuple[bytes, str | None, str]:
    audio_bytes, content_type, source_path = await _download_url_bytes(source_url, hx)
    if not _is_likely_non_media_response(content_type, source_path):
        return audio_bytes, content_type, source_path

    extracted_target = await asyncio.to_thread(_extract_media_download_target, source_url)
    if not extracted_target:
        _raise_transcribe_http_error(
            status_code=400,
            detail=_url_not_media_detail(content_type),
            code="TRANSCRIBE_URL_NOT_MEDIA",
        )

    extracted_url, extracted_path_hint = extracted_target
    extracted_bytes, extracted_content_type, extracted_source_path = await _download_url_bytes(
        extracted_url,
        hx,
        headers={"Referer": source_url},
    )
    final_source_path = extracted_path_hint or extracted_source_path or source_path
    return extracted_bytes, extracted_content_type, final_source_path


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
    headers: dict[str, str] | None = None,
) -> None:
    merged_headers = {"X-Whisperall-Error-Code": code}
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

        for chunk in (chunks.data or []):
            storage_path = chunk["storage_path"]
            file_bytes = db.storage.from_("audio").download(storage_path)
            filename, content_type = _guess_audio_meta_from_path(storage_path)
            chunk_duration = _chunk_duration_meta_seconds(chunk)
            chunk_rms = _chunk_rms_level(chunk)
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
                provider_name = "silence-skip:rms"
            elif enable_diarization:
                diarized = await deepgram.transcribe_chunk_diarized(
                    file_bytes,
                    language=job.get("language"),
                    content_type=content_type,
                )
                deepgram_text = (diarized.get("text") or "").strip()
                # Deepgram gives speaker segments; Groq often yields better plain-text accuracy.
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
            db.table("transcribe_chunks").update({
                "status": "done",
                "result_json": result_json,
                "provider": provider_name,
            }).eq("id", chunk["id"]).execute()
            processed += 1
            if provider_name != "silence-skip:rms":
                total_seconds += _chunk_billable_seconds(chunk)

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


@router.post("/from-url")
async def transcribe_from_url(payload: TranscribeUrlRequest, user: AuthUser = Depends(get_current_user)):
    import httpx as hx
    db = _require_db()
    check_usage(user, "transcribe_seconds", 300)

    audio_bytes, response_content_type, source_path = await _resolve_media_from_url(payload.url, hx)

    lang = payload.language if payload.language and payload.language != "auto" else None
    filename, guessed_content_type = _guess_audio_meta_from_path(source_path)
    content_type = response_content_type or guessed_content_type

    if len(audio_bytes) > 25 * 1024 * 1024:
        _raise_transcribe_http_error(
            status_code=413,
            detail="File too large (>25 MB). Use file upload for large files.",
            code="TRANSCRIBE_FILE_TOO_LARGE",
        )

    filename = _filename_for_content_type(content_type, filename)
    try:
        if payload.enable_diarization:
            if not settings.deepgram_api_key:
                _raise_transcribe_http_error(
                    status_code=400,
                    detail=(
                        "Diarization is enabled but DEEPGRAM_API_KEY is not configured. "
                        "Set a Deepgram key to use speaker diarization (recommended model: nova-2)."
                    ),
                    code="DIARIZATION_NOT_CONFIGURED",
                )
            diarized = await deepgram.transcribe_chunk_diarized(
                audio_bytes,
                language=lang,
                content_type=content_type,
            )
            try:
                quality_text = await groq_stt.transcribe_chunk(
                    audio_bytes,
                    language=lang,
                    filename=filename,
                    content_type=content_type,
                )
            except Exception:
                quality_text = ""
            deepgram_text = (diarized.get("text") or "").strip()
            text, _, low_quality = _pick_best_text_candidate(
                {"groq": quality_text, "deepgram": deepgram_text},
                None,
            )
            if low_quality and settings.openai_api_key:
                try:
                    openai_text = await openai_stt.transcribe(
                        audio_bytes,
                        language=lang,
                        content_type=content_type,
                    )
                except Exception:
                    openai_text = ""
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
            groq_text = await groq_stt.transcribe_chunk(
                audio_bytes,
                language=lang,
                filename=filename,
                content_type=content_type,
            )
            text, _, low_quality = _pick_best_text_candidate({"groq": groq_text}, None)
            deepgram_text = ""
            if low_quality and settings.deepgram_api_key:
                try:
                    deepgram_text = await deepgram.transcribe_chunk(
                        audio_bytes,
                        language=lang,
                        content_type=content_type,
                    )
                except Exception:
                    deepgram_text = ""
                text, _, _ = _pick_best_text_candidate({"deepgram": deepgram_text, "groq": groq_text}, None)
            text = (text or (groq_text or "").strip() or deepgram_text).strip()
            segments = None
    except hx.HTTPStatusError:
        _raise_transcribe_http_error(
            status_code=400,
            detail=(
                "The downloaded URL content was rejected by transcription providers. "
                "Use a direct media file URL (not a webpage) or upload the file directly."
            ),
            code="TRANSCRIBE_URL_PROVIDER_REJECTED",
        )

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
    except Exception:
        pass

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
