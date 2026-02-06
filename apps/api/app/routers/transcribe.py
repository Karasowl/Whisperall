from fastapi import APIRouter, Depends, HTTPException

from ..auth import get_current_user, check_usage, AuthUser
from ..schemas import TranscribeJobRequest, TranscribeChunkRegister, TranscribeRunRequest, TranscribeJobResponse
from ..db import get_supabase_or_none
from ..providers import groq_stt

router = APIRouter(prefix="/v1/transcribe", tags=["transcribe"])


def _require_db():
    db = get_supabase_or_none()
    if not db:
        raise HTTPException(status_code=503, detail="Database not configured")
    return db


@router.post("/jobs", response_model=TranscribeJobResponse)
async def create_job(payload: TranscribeJobRequest, user: AuthUser = Depends(get_current_user)):
    db = _require_db()
    row = db.table("transcribe_jobs").insert({
        "user_id": user.user_id,
        "language": payload.language,
        "enable_diarization": payload.enable_diarization,
        "enable_translation": payload.enable_translation,
        "target_language": payload.target_language,
        "total_chunks": payload.total_chunks,
    }).execute()
    job = row.data[0]
    return TranscribeJobResponse(
        id=job["id"], status=job["status"],
        processed_chunks=job["processed_chunks"], total_chunks=job["total_chunks"],
    )


@router.post("/jobs/{job_id}/chunks")
async def register_chunk(job_id: str, payload: TranscribeChunkRegister, user: AuthUser = Depends(get_current_user)):
    db = _require_db()
    job = db.table("transcribe_jobs").select("user_id").eq("id", job_id).single().execute()
    if job.data["user_id"] != user.user_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    db.table("transcribe_chunks").insert({
        "job_id": job_id,
        "index": payload.index,
        "storage_path": payload.storage_path,
    }).execute()
    return {"ok": True}


@router.post("/jobs/{job_id}/run", response_model=TranscribeJobResponse)
async def run_job(job_id: str, payload: TranscribeRunRequest, user: AuthUser = Depends(get_current_user)):
    db = _require_db()
    job = db.table("transcribe_jobs").select("*").eq("id", job_id).single().execute()
    if job.data["user_id"] != user.user_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    check_usage(user, "transcribe_seconds", 300 * len(
        db.table("transcribe_chunks").select("id").eq("job_id", job_id).eq("status", "pending").limit(payload.max_chunks).execute().data
    ))

    db.table("transcribe_jobs").update({"status": "processing"}).eq("id", job_id).execute()

    chunks = db.table("transcribe_chunks").select("*").eq("job_id", job_id).eq("status", "pending").order("index").limit(payload.max_chunks).execute()
    processed = 0
    total_seconds = 0
    for chunk in chunks.data:
        text = await groq_stt.transcribe_chunk(b"", language=job.data.get("language"))
        db.table("transcribe_chunks").update({
            "status": "done",
            "result_json": {"text": text},
            "provider": "groq",
        }).eq("id", chunk["id"]).execute()
        processed += 1
        total_seconds += 300  # 5-min chunks

    new_count = job.data["processed_chunks"] + processed
    new_status = "completed" if new_count >= job.data["total_chunks"] else "processing"
    update = {"processed_chunks": new_count, "status": new_status}
    if new_status == "completed":
        update["completed_at"] = "now()"
    db.table("transcribe_jobs").update(update).eq("id", job_id).execute()

    if total_seconds > 0:
        db.rpc("increment_usage", {"p_user_id": user.user_id, "p_transcribe_seconds": total_seconds}).execute()

    if new_status == "completed":
        all_chunks = db.table("transcribe_chunks").select("result_json").eq("job_id", job_id).order("index").execute()
        full_text = " ".join(c["result_json"]["text"] for c in all_chunks.data if c.get("result_json"))
        db.table("transcripts").insert({"job_id": job_id, "plain_text": full_text.strip()}).execute()

    return TranscribeJobResponse(id=job_id, status=new_status, processed_chunks=new_count, total_chunks=job.data["total_chunks"])


@router.get("/jobs/{job_id}", response_model=TranscribeJobResponse)
async def get_job(job_id: str, user: AuthUser = Depends(get_current_user)):
    db = _require_db()
    job = db.table("transcribe_jobs").select("*").eq("id", job_id).single().execute()
    if job.data["user_id"] != user.user_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    return TranscribeJobResponse(
        id=job.data["id"], status=job.data["status"],
        processed_chunks=job.data["processed_chunks"], total_chunks=job.data["total_chunks"],
    )


@router.get("/jobs/{job_id}/result")
async def get_result(job_id: str, user: AuthUser = Depends(get_current_user)):
    db = _require_db()
    job = db.table("transcribe_jobs").select("user_id").eq("id", job_id).single().execute()
    if job.data["user_id"] != user.user_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    transcript = db.table("transcripts").select("plain_text, segments").eq("job_id", job_id).maybe_single().execute()
    if not transcript.data:
        raise HTTPException(status_code=404, detail="Result not ready")
    return {"text": transcript.data["plain_text"], "segments": transcript.data.get("segments")}
