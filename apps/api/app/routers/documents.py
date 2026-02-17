import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..auth import get_current_user, AuthUser, check_usage
from ..db import get_supabase_or_none

log = logging.getLogger(__name__)
router = APIRouter(prefix="/v1/documents", tags=["documents"])


class CreateDocReq(BaseModel):
    title: str
    content: str
    source: str | None = None
    tags: list[str] = []
    folder_id: str | None = None


class UpdateDocReq(BaseModel):
    title: str | None = None
    content: str | None = None
    tags: list[str] | None = None
    folder_id: str | None = None


def _get_db():
    db = get_supabase_or_none()
    if not db:
        raise HTTPException(503, "Database not configured")
    return db


@router.get("")
async def list_documents(user: AuthUser = Depends(get_current_user), folder_id: str | None = None):
    db = get_supabase_or_none()
    if not db:
        return []
    try:
        q = db.table("documents").select("*").eq("user_id", user.user_id)
        if folder_id is not None:
            q = q.eq("folder_id", folder_id)
        res = q.order("updated_at", desc=True).execute()
        return res.data or []
    except Exception as e:
        log.warning("documents list failed (table may not exist): %s", e)
        return []


@router.get("/{doc_id}")
async def get_document(doc_id: str, user: AuthUser = Depends(get_current_user)):
    db = _get_db()
    res = db.table("documents").select("*").eq("id", doc_id).eq("user_id", user.user_id).maybe_single().execute()
    if not res.data:
        raise HTTPException(404, "Not found")
    return res.data


@router.post("")
async def create_document(req: CreateDocReq, user: AuthUser = Depends(get_current_user)):
    db = _get_db()
    check_usage(user, "notes_count", 1)
    try:
        insert_data: dict = {
            "user_id": user.user_id, "title": req.title,
            "content": req.content, "source": req.source, "tags": req.tags,
        }
        if req.folder_id:
            insert_data["folder_id"] = req.folder_id
        res = db.table("documents").insert(insert_data).execute()
        try:
            db.rpc("increment_usage", {"p_user_id": user.user_id, "p_notes_count": 1}).execute()
        except Exception as exc:
            log.warning("notes usage increment failed: %s", exc)
        try:
            db.table("history").insert({
                "user_id": user.user_id, "module": "note",
                "output_text": req.title,
                "metadata": {"source": req.source},
            }).execute()
        except Exception as exc:
            log.warning("history insert failed: %s", exc)
        return res.data[0]
    except Exception as e:
        log.error("create_document failed: %s", e)
        raise HTTPException(500, f"Failed to create document: {e}")


@router.put("/{doc_id}")
async def update_document(doc_id: str, req: UpdateDocReq, user: AuthUser = Depends(get_current_user)):
    db = _get_db()
    dumped = req.model_dump(exclude_unset=True)
    data = {k: v for k, v in dumped.items() if v is not None or k == "folder_id"}
    if not data:
        raise HTTPException(400, "No fields to update")
    try:
        res = db.table("documents").update(data).eq("id", doc_id).eq("user_id", user.user_id).execute()
        if not res.data:
            raise HTTPException(404, "Not found")
        return res.data[0]
    except HTTPException:
        raise
    except Exception as e:
        log.error("update_document failed: %s", e)
        raise HTTPException(500, f"Failed to update document: {e}")


@router.delete("/{doc_id}")
async def delete_document(doc_id: str, user: AuthUser = Depends(get_current_user)):
    db = _get_db()
    try:
        db.table("documents").delete().eq("id", doc_id).eq("user_id", user.user_id).execute()
        return {"status": "deleted"}
    except Exception as e:
        log.error("delete_document failed: %s", e)
        raise HTTPException(500, f"Failed to delete document: {e}")
