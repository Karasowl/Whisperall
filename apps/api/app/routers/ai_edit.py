from fastapi import APIRouter, Depends

from ..schemas import AiEditRequest, AiEditResponse
from ..auth import get_current_user, check_usage, AuthUser
from ..providers import openai_llm
from ..db import get_supabase_or_none

router = APIRouter(prefix="/v1/ai-edit", tags=["ai-edit"])


@router.post("", response_model=AiEditResponse)
async def edit(payload: AiEditRequest, user: AuthUser = Depends(get_current_user)):
    token_est = len(payload.text) // 4  # rough estimate: 4 chars per token
    check_usage(user, "ai_edit_tokens", token_est)

    text = await openai_llm.edit_text(payload.text, payload.mode)

    db = get_supabase_or_none()
    if db:
        db.rpc("increment_usage", {"p_user_id": user.user_id, "p_ai_edit_tokens": token_est}).execute()
        db.table("history").insert({
            "user_id": user.user_id, "module": "ai_edit",
            "input_text": payload.text, "output_text": text,
            "metadata": {"mode": payload.mode},
        }).execute()

    return AiEditResponse(text=text)
