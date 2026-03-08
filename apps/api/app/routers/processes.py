import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator

from ..auth import AuthUser, get_current_user
from ..db import get_supabase_or_none

log = logging.getLogger(__name__)
router = APIRouter(prefix="/v1/processes", tags=["processes"])

VALID_STATUSES = {"queued", "running", "paused", "failed", "completed", "canceled"}


class UpsertProcessReq(BaseModel):
    id: str | None = None
    process_type: str
    title: str
    status: str = "running"
    stage_label_key: str = ""
    done: int = Field(default=0, ge=0)
    total: int = Field(default=1, ge=1)
    pct: int = Field(default=0, ge=0, le=100)
    document_id: str | None = None
    error: str | None = None
    completed_at: datetime | None = None

    @field_validator("status")
    @classmethod
    def _validate_status(cls, value: str) -> str:
        if value not in VALID_STATUSES:
            raise ValueError(f"Invalid status '{value}'")
        return value


class UpdateProcessReq(BaseModel):
    process_type: str | None = None
    title: str | None = None
    status: str | None = None
    stage_label_key: str | None = None
    done: int | None = Field(default=None, ge=0)
    total: int | None = Field(default=None, ge=1)
    pct: int | None = Field(default=None, ge=0, le=100)
    document_id: str | None = None
    error: str | None = None
    completed_at: datetime | None = None

    @field_validator("status")
    @classmethod
    def _validate_status(cls, value: str | None) -> str | None:
        if value is None:
            return value
        if value not in VALID_STATUSES:
            raise ValueError(f"Invalid status '{value}'")
        return value


def _get_db():
    db = get_supabase_or_none()
    if not db:
        raise HTTPException(503, "Database not configured")
    return db


def _is_missing_processes_table(exc: Exception) -> bool:
    msg = str(exc).lower()
    return (
        "pgrst205" in msg
        or "public.processes" in msg
        or "relation \"processes\" does not exist" in msg
        or "relation 'processes' does not exist" in msg
    )


def _raise_processes_unavailable() -> None:
    raise HTTPException(503, "Processes are unavailable until DB migrations are applied")


def _normalize_process_payload(payload: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(payload)
    status = normalized.get("status")
    done = normalized.get("done")
    total = normalized.get("total")

    if done is not None and total is not None and total > 0:
        normalized["pct"] = round(max(0, min(done, total)) / total * 100)

    if status in {"completed", "failed", "canceled"} and not normalized.get("completed_at"):
        normalized["completed_at"] = datetime.now(timezone.utc).isoformat()
    if status in {"queued", "running", "paused"}:
        normalized["completed_at"] = None
    return normalized


@router.get("")
async def list_processes(
    user: AuthUser = Depends(get_current_user),
    status: str | None = Query(default=None),
    process_type: str | None = Query(default=None),
    document_id: str | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=500),
):
    db = get_supabase_or_none()
    if not db:
        return []
    try:
        q = db.table("processes").select("*").eq("user_id", user.user_id)
        if status:
            q = q.eq("status", status)
        if process_type:
            q = q.eq("process_type", process_type)
        if document_id:
            q = q.eq("document_id", document_id)
        res = q.order("updated_at", desc=True).limit(limit).execute()
        return res.data or []
    except Exception as exc:
        if _is_missing_processes_table(exc):
            log.warning("processes list fallback: processes table missing (%s)", exc)
            return []
        log.error("list_processes failed: %s", exc)
        raise HTTPException(500, f"Failed to list processes: {exc}")


@router.get("/{process_id}")
async def get_process(process_id: str, user: AuthUser = Depends(get_current_user)):
    db = _get_db()
    try:
        res = (
            db.table("processes")
            .select("*")
            .eq("id", process_id)
            .eq("user_id", user.user_id)
            .maybe_single()
            .execute()
        )
        if not res.data:
            raise HTTPException(404, "Not found")
        return res.data
    except HTTPException:
        raise
    except Exception as exc:
        if _is_missing_processes_table(exc):
            _raise_processes_unavailable()
        log.error("get_process failed: %s", exc)
        raise HTTPException(500, f"Failed to fetch process: {exc}")


@router.put("/{process_id}")
async def upsert_process(process_id: str, req: UpsertProcessReq, user: AuthUser = Depends(get_current_user)):
    db = _get_db()
    if req.id and req.id != process_id:
        raise HTTPException(400, "Process ID mismatch")

    payload = _normalize_process_payload({
        "process_type": req.process_type,
        "title": req.title,
        "status": req.status,
        "stage_label_key": req.stage_label_key,
        "done": req.done,
        "total": req.total,
        "pct": req.pct,
        "document_id": req.document_id,
        "error": req.error,
        "completed_at": req.completed_at.isoformat() if req.completed_at else None,
    })

    try:
        existing = (
            db.table("processes")
            .select("id")
            .eq("id", process_id)
            .eq("user_id", user.user_id)
            .maybe_single()
            .execute()
        )
        if existing.data:
            res = (
                db.table("processes")
                .update(payload)
                .eq("id", process_id)
                .eq("user_id", user.user_id)
                .execute()
            )
        else:
            res = db.table("processes").insert({
                "id": process_id,
                "user_id": user.user_id,
                **payload,
            }).execute()
        if not res.data:
            raise HTTPException(500, "Failed to save process")
        return res.data[0]
    except HTTPException:
        raise
    except Exception as exc:
        if _is_missing_processes_table(exc):
            _raise_processes_unavailable()
        log.error("upsert_process failed: %s", exc)
        raise HTTPException(500, f"Failed to save process: {exc}")


@router.patch("/{process_id}")
async def update_process(process_id: str, req: UpdateProcessReq, user: AuthUser = Depends(get_current_user)):
    db = _get_db()
    payload = req.model_dump(exclude_unset=True)
    if not payload:
        raise HTTPException(400, "No fields to update")

    if "completed_at" in payload and payload["completed_at"] is not None:
        payload["completed_at"] = payload["completed_at"].isoformat()
    payload = _normalize_process_payload(payload)

    try:
        res = (
            db.table("processes")
            .update(payload)
            .eq("id", process_id)
            .eq("user_id", user.user_id)
            .execute()
        )
        if not res.data:
            raise HTTPException(404, "Not found")
        return res.data[0]
    except HTTPException:
        raise
    except Exception as exc:
        if _is_missing_processes_table(exc):
            _raise_processes_unavailable()
        log.error("update_process failed: %s", exc)
        raise HTTPException(500, f"Failed to update process: {exc}")


@router.delete("/{process_id}")
async def delete_process(process_id: str, user: AuthUser = Depends(get_current_user)):
    db = _get_db()
    try:
        db.table("processes").delete().eq("id", process_id).eq("user_id", user.user_id).execute()
        return {"status": "deleted"}
    except Exception as exc:
        if _is_missing_processes_table(exc):
            _raise_processes_unavailable()
        log.error("delete_process failed: %s", exc)
        raise HTTPException(500, f"Failed to delete process: {exc}")
