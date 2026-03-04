import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..auth import get_current_user, AuthUser
from ..db import get_supabase_or_none

log = logging.getLogger(__name__)
router = APIRouter(prefix="/v1/folders", tags=["folders"])


class CreateFolderReq(BaseModel):
    name: str = "Untitled"
    parent_id: str | None = None


class UpdateFolderReq(BaseModel):
    name: str | None = None
    parent_id: str | None = None


def _get_db():
    db = get_supabase_or_none()
    if not db:
        raise HTTPException(503, "Database not configured")
    return db


def _is_missing_folders_table(error: Exception) -> bool:
    msg = str(error)
    return (
        "PGRST205" in msg
        or "public.folders" in msg
        or "relation \"folders\" does not exist" in msg
    )


def _raise_table_unavailable() -> None:
    raise HTTPException(503, "Folders are unavailable until DB migrations are applied")


@router.get("")
async def list_folders(user: AuthUser = Depends(get_current_user)):
    db = get_supabase_or_none()
    if not db:
        return []
    try:
        res = db.table("folders").select("*").eq("user_id", user.user_id).order("created_at").execute()
        return res.data or []
    except Exception as e:
        log.warning("folders list failed (table may not exist): %s", e)
        return []


@router.post("")
async def create_folder(req: CreateFolderReq, user: AuthUser = Depends(get_current_user)):
    db = _get_db()
    try:
        row = {"user_id": user.user_id, "name": req.name}
        if req.parent_id:
            row["parent_id"] = req.parent_id
        res = db.table("folders").insert(row).execute()
        return res.data[0]
    except Exception as e:
        if _is_missing_folders_table(e):
            log.warning("create_folder skipped: folders table missing (%s)", e)
            _raise_table_unavailable()
        log.error("create_folder failed: %s", e)
        raise HTTPException(500, f"Failed to create folder: {e}")


@router.put("/{folder_id}")
async def update_folder(folder_id: str, req: UpdateFolderReq, user: AuthUser = Depends(get_current_user)):
    db = _get_db()
    try:
        payload = {}
        if req.name is not None:
            payload["name"] = req.name
        if req.parent_id is not None:
            payload["parent_id"] = req.parent_id
        if not payload:
            raise HTTPException(400, "Nothing to update")
        res = db.table("folders").update(payload).eq("id", folder_id).eq("user_id", user.user_id).execute()
        if not res.data:
            raise HTTPException(404, "Not found")
        return res.data[0]
    except HTTPException:
        raise
    except Exception as e:
        if _is_missing_folders_table(e):
            log.warning("update_folder skipped: folders table missing (%s)", e)
            _raise_table_unavailable()
        log.error("update_folder failed: %s", e)
        raise HTTPException(500, f"Failed to update folder: {e}")


@router.delete("/{folder_id}")
async def delete_folder(folder_id: str, user: AuthUser = Depends(get_current_user)):
    db = _get_db()
    try:
        db.table("folders").delete().eq("id", folder_id).eq("user_id", user.user_id).execute()
        return {"status": "deleted"}
    except Exception as e:
        if _is_missing_folders_table(e):
            log.warning("delete_folder skipped: folders table missing (%s)", e)
            _raise_table_unavailable()
        log.error("delete_folder failed: %s", e)
        raise HTTPException(500, f"Failed to delete folder: {e}")
