from fastapi import APIRouter, Depends, Query

from ..auth import get_current_user, AuthUser
from ..db import get_supabase_or_none

router = APIRouter(prefix="/v1/history", tags=["history"])


@router.get("")
async def list_history(
    limit: int = Query(default=50, le=200),
    user: AuthUser = Depends(get_current_user),
):
    db = get_supabase_or_none()
    if not db:
        return []
    try:
        res = (
            db.table("history")
            .select("id, module, input_text, output_text, audio_url, metadata, created_at")
            .eq("user_id", user.user_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return res.data or []
    except Exception:
        return []
