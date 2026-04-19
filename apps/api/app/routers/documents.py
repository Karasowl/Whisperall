import logging
from collections.abc import Callable
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..auth import get_current_user, AuthUser, check_usage
from ..db import get_supabase_or_none

log = logging.getLogger(__name__)
router = APIRouter(prefix="/v1/documents", tags=["documents"])
OPTIONAL_COMPAT_COLUMNS = ("audio_url", "source_id")
OPTIONAL_TRANSCRIPTION_COMPAT_COLUMNS = ("block_id", "source")
TRANSCRIPTION_HISTORY_LIMIT = 200


class CreateDocReq(BaseModel):
    title: str
    content: str
    source: str | None = None
    source_id: str | None = None
    audio_url: str | None = None
    tags: list[str] = []
    folder_id: str | None = None


class UpdateDocReq(BaseModel):
    title: str | None = None
    content: str | None = None
    source_id: str | None = None
    audio_url: str | None = None
    tags: list[str] | None = None
    folder_id: str | None = None


class CreateTranscriptionEntryReq(BaseModel):
  block_id: str | None = None
  source: str | None = None
  language: str = "auto"
  diarization: bool = False
  text: str
  segments: list[dict] = []
  audio_url: str | None = None


class UpsertDebateStateReq(BaseModel):
  state_json: dict[str, Any] = {}


class DebateWebSearchReq(BaseModel):
  query: str
  limit: int = 6


def _get_db():
    db = get_supabase_or_none()
    if not db:
        raise HTTPException(503, "Database not configured")
    return db


def _error_mentions_missing_column(exc: Exception, column: str) -> bool:
  msg = str(exc).lower()
  return f"'{column}' column" in msg or f"\"{column}\" column" in msg


def _error_mentions_missing_relation(exc: Exception, relation: str) -> bool:
  msg = str(exc).lower()
  rel = relation.lower()
  return (
    f'relation "{rel}" does not exist' in msg
    or f"relation '{rel}' does not exist" in msg
    or f"could not find table '{rel}'" in msg
    or f'could not find table "{rel}"' in msg
  )


def _execute_with_optional_column_fallback(
    *,
    payload: dict[str, Any],
    operation: str,
    run: Callable[[dict[str, Any]], Any],
):
    attempted = dict(payload)
    last_exc: Exception | None = None
    max_attempts = len(OPTIONAL_COMPAT_COLUMNS) + 1
    for _ in range(max_attempts):
        try:
            return run(dict(attempted))
        except Exception as exc:
            missing = [c for c in OPTIONAL_COMPAT_COLUMNS if c in attempted and _error_mentions_missing_column(exc, c)]
            if not missing:
                raise
            last_exc = exc
            for c in missing:
                attempted.pop(c, None)
            log.warning(
                "documents %s retry without missing schema-cache columns: %s",
                operation,
                ", ".join(missing),
            )
            if not attempted:
                return None
    if last_exc:
        raise last_exc
    return None


def _get_document_row(db, *, doc_id: str, user_id: str):
    res = db.table("documents").select("*").eq("id", doc_id).eq("user_id", user_id).maybe_single().execute()
    return res.data


def _assert_document_owner(db, *, doc_id: str, user_id: str):
    row = _get_document_row(db, doc_id=doc_id, user_id=user_id)
    if not row:
        raise HTTPException(404, "Not found")
    return row


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
        if _error_mentions_missing_relation(e, "documents"):
            log.warning("documents list failed (table may not exist): %s", e)
            return []
        log.error("documents list failed: %s", e)
        raise HTTPException(500, f"Failed to list documents: {e}")

@router.get("/{doc_id}")
async def get_document(doc_id: str, user: AuthUser = Depends(get_current_user)):
    db = _get_db()
    row = _get_document_row(db, doc_id=doc_id, user_id=user.user_id)
    if not row:
        raise HTTPException(404, "Not found")
    return row


@router.post("")
async def create_document(req: CreateDocReq, user: AuthUser = Depends(get_current_user)):
    db = _get_db()
    check_usage(user, "notes_count", 1)
    try:
        insert_data: dict = {
            "user_id": user.user_id, "title": req.title,
            "content": req.content,
            "source": req.source,
            "source_id": req.source_id,
            "audio_url": req.audio_url,
            "tags": req.tags,
        }
        if req.folder_id:
            insert_data["folder_id"] = req.folder_id
        res = _execute_with_optional_column_fallback(
            payload=insert_data,
            operation="create",
            run=lambda payload: db.table("documents").insert(payload).execute(),
        )
        if not res or not getattr(res, "data", None):
            raise HTTPException(500, "Failed to create document")
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
    nullable_update_fields = {"folder_id", "source_id", "audio_url"}
    data = {k: v for k, v in dumped.items() if v is not None or k in nullable_update_fields}
    if not data:
        raise HTTPException(400, "No fields to update")
    try:
        res = _execute_with_optional_column_fallback(
            payload=data,
            operation="update",
            run=lambda payload: db.table("documents").update(payload).eq("id", doc_id).eq("user_id", user.user_id).execute(),
        )
        if not res:
            row = _get_document_row(db, doc_id=doc_id, user_id=user.user_id)
            if not row:
                raise HTTPException(404, "Not found")
            return row
        if not res.data:
            raise HTTPException(404, "Not found")
        return res.data[0]
    except HTTPException:
        raise
    except Exception as e:
        log.error("update_document failed: %s", e)
        raise HTTPException(500, f"Failed to update document: {e}")


@router.get("/{doc_id}/debate-state")
async def get_debate_state(doc_id: str, user: AuthUser = Depends(get_current_user)):
    db = _get_db()
    _assert_document_owner(db, doc_id=doc_id, user_id=user.user_id)
    try:
        res = (
            db.table("document_debate_states")
            .select("state_json")
            .eq("document_id", doc_id)
            .eq("user_id", user.user_id)
            .maybe_single()
            .execute()
        )
        # supabase-py sometimes returns `None` (not an APIResponse) for
        # `maybe_single()` when the row doesn't exist, depending on version.
        # That previously raised `'NoneType' object has no attribute 'data'`
        # and bubbled into a 500 that polluted every backend.log tail. An
        # empty row is the normal, benign case — return a blank state.
        row_data = getattr(res, "data", None) if res is not None else None
        state_json = row_data.get("state_json") if isinstance(row_data, dict) else {}
        if not isinstance(state_json, dict):
            state_json = {}
        return {"state_json": state_json, "persisted": bool(row_data)}
    except Exception as e:
        if _error_mentions_missing_relation(e, "document_debate_states"):
            return {"state_json": {}, "persisted": False}
        log.error("get_debate_state failed: %s", e)
        raise HTTPException(500, f"Failed to load debate state: {e}")


@router.put("/{doc_id}/debate-state")
async def upsert_debate_state(doc_id: str, req: UpsertDebateStateReq, user: AuthUser = Depends(get_current_user)):
    db = _get_db()
    _assert_document_owner(db, doc_id=doc_id, user_id=user.user_id)
    state_json = req.state_json if isinstance(req.state_json, dict) else {}
    try:
        db.table("document_debate_states").upsert(
            {"document_id": doc_id, "user_id": user.user_id, "state_json": state_json},
            on_conflict="document_id",
        ).execute()
        return {"state_json": state_json, "persisted": True}
    except Exception as e:
        if _error_mentions_missing_relation(e, "document_debate_states"):
            return {"state_json": state_json, "persisted": False}
        log.error("upsert_debate_state failed: %s", e)
        raise HTTPException(500, f"Failed to save debate state: {e}")


@router.post("/{doc_id}/debate/web-search")
async def debate_web_search(doc_id: str, req: DebateWebSearchReq, user: AuthUser = Depends(get_current_user)):
    db = _get_db()
    _assert_document_owner(db, doc_id=doc_id, user_id=user.user_id)
    query = (req.query or "").strip()
    if not query:
        return {"query": "", "results": []}
    limit = max(1, min(int(req.limit or 6), 10))
    results: list[dict[str, str]] = []

    def push_result(title: str, url: str, snippet: str):
        if len(results) >= limit:
            return
        t = (title or "").strip()
        u = (url or "").strip()
        s = (snippet or "").strip()
        if not t or not u:
            return
        if any(existing["url"] == u for existing in results):
            return
        results.append({"title": t[:220], "url": u, "snippet": s[:400], "source": "duckduckgo"})

    def walk_related(items: list[dict[str, Any]]):
        for item in items:
            if len(results) >= limit:
                return
            nested = item.get("Topics")
            if isinstance(nested, list):
                walk_related([x for x in nested if isinstance(x, dict)])
                continue
            push_result(
                str(item.get("Text") or "").strip()[:180] or "Result",
                str(item.get("FirstURL") or ""),
                str(item.get("Text") or ""),
            )

    try:
        async with httpx.AsyncClient(timeout=12, follow_redirects=True) as client:
            res = await client.get(
                "https://duckduckgo.com/",
                params={"q": query, "format": "json", "no_redirect": "1", "no_html": "1"},
            )
            body = res.json() if res.status_code < 500 else {}
    except Exception as e:
        log.warning("debate_web_search failed for query '%s': %s", query, e)
        return {"query": query, "results": []}

    if isinstance(body, dict):
        abstract = str(body.get("AbstractText") or "")
        abstract_url = str(body.get("AbstractURL") or "")
        abstract_title = str(body.get("Heading") or "") or query
        if abstract and abstract_url:
            push_result(abstract_title, abstract_url, abstract)
        related = body.get("RelatedTopics")
        if isinstance(related, list):
            walk_related([x for x in related if isinstance(x, dict)])

    return {"query": query, "results": results[:limit]}


@router.get("/{doc_id}/transcriptions")
async def list_transcription_history(doc_id: str, user: AuthUser = Depends(get_current_user), block_id: str | None = None):
    db = _get_db()
    _assert_document_owner(db, doc_id=doc_id, user_id=user.user_id)
    try:
        q = (
            db.table("document_transcriptions")
            .select("*")
            .eq("document_id", doc_id)
            .eq("user_id", user.user_id)
        )
        if block_id:
            q = q.eq("block_id", block_id)
        try:
            res = q.order("created_at", desc=True).limit(TRANSCRIPTION_HISTORY_LIMIT).execute()
        except Exception as exc:
            if block_id and _error_mentions_missing_column(exc, "block_id"):
                # Backward compatibility for instances where migration adding block_id is pending.
                res = (
                    db.table("document_transcriptions")
                    .select("*")
                    .eq("document_id", doc_id)
                    .eq("user_id", user.user_id)
                    .order("created_at", desc=True)
                    .limit(TRANSCRIPTION_HISTORY_LIMIT)
                    .execute()
                )
            else:
                raise
        return res.data or []
    except Exception as e:
        log.error("list_transcription_history failed: %s", e)
        raise HTTPException(500, f"Failed to list transcription history: {e}")


@router.post("/{doc_id}/transcriptions")
async def create_transcription_entry(doc_id: str, req: CreateTranscriptionEntryReq, user: AuthUser = Depends(get_current_user)):
    db = _get_db()
    _assert_document_owner(db, doc_id=doc_id, user_id=user.user_id)
    try:
        payload = {
            "user_id": user.user_id,
            "document_id": doc_id,
            "block_id": req.block_id,
            "source": req.source,
            "language": req.language or "auto",
            "diarization": bool(req.diarization),
            "text": req.text or "",
            "segments": req.segments or [],
            "audio_url": req.audio_url,
        }
        attempted = dict(payload)
        while True:
            try:
                res = db.table("document_transcriptions").insert(dict(attempted)).execute()
                break
            except Exception as exc:
                missing = [c for c in OPTIONAL_TRANSCRIPTION_COMPAT_COLUMNS if c in attempted and _error_mentions_missing_column(exc, c)]
                if not missing:
                    raise
                for c in missing:
                    attempted.pop(c, None)
                log.warning(
                    "documents create_transcription retry without missing schema-cache columns: %s",
                    ", ".join(missing),
                )
                if not attempted:
                    raise
        if not res.data:
            raise HTTPException(500, "Failed to create transcription entry")
        return res.data[0]
    except HTTPException:
        raise
    except Exception as e:
        log.error("create_transcription_entry failed: %s", e)
        raise HTTPException(500, f"Failed to create transcription entry: {e}")


@router.delete("/{doc_id}/transcriptions/{entry_id}")
async def delete_transcription_entry(doc_id: str, entry_id: str, user: AuthUser = Depends(get_current_user)):
    db = _get_db()
    _assert_document_owner(db, doc_id=doc_id, user_id=user.user_id)
    try:
        res = (
            db.table("document_transcriptions")
            .delete()
            .eq("id", entry_id)
            .eq("document_id", doc_id)
            .eq("user_id", user.user_id)
            .execute()
        )
        if isinstance(res.data, list) and len(res.data) == 0:
            raise HTTPException(404, "Not found")
        return {"status": "deleted"}
    except HTTPException:
        raise
    except Exception as e:
        log.error("delete_transcription_entry failed: %s", e)
        raise HTTPException(500, f"Failed to delete transcription entry: {e}")


@router.delete("/{doc_id}")
async def delete_document(doc_id: str, user: AuthUser = Depends(get_current_user)):
    db = _get_db()
    try:
        db.table("documents").delete().eq("id", doc_id).eq("user_id", user.user_id).execute()
        return {"status": "deleted"}
    except Exception as e:
        log.error("delete_document failed: %s", e)
        raise HTTPException(500, f"Failed to delete document: {e}")
