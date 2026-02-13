import logging

from fastapi import APIRouter, Depends, HTTPException

from ..schemas import AiEditRequest, AiEditResponse
from ..auth import get_current_user, check_usage, AuthUser
from ..providers import openai_llm
from ..db import get_supabase_or_none
from ..usage_events import record_usage_event
from ..config import settings

log = logging.getLogger(__name__)
router = APIRouter(prefix="/v1/ai-edit", tags=["ai-edit"])

MAX_INPUT_CHARS = 8000


@router.post("", response_model=AiEditResponse)
async def edit(payload: AiEditRequest, user: AuthUser = Depends(get_current_user)):
    if len(payload.text) > MAX_INPUT_CHARS:
        raise HTTPException(400, f"Text too long ({len(payload.text)} chars). Max {MAX_INPUT_CHARS}.")

    # Count input + estimated output tokens (output ≈ input for transformations)
    input_tokens = len(payload.text) // 4
    token_est = input_tokens * 2  # input + output
    check_usage(user, "ai_edit_tokens", token_est)

    try:
        text = await openai_llm.edit_text(payload.text, payload.mode, payload.prompt)
    except HTTPException:
        raise
    except Exception as exc:
        log.error("AI edit failed: %s", exc)
        raise HTTPException(500, "AI editing failed") from exc

    db = get_supabase_or_none()
    if db:
        try:
            db.rpc("increment_usage", {"p_user_id": user.user_id, "p_ai_edit_tokens": token_est}).execute()
            provider = "openai" if settings.openai_api_key else ("deepseek" if settings.deepseek_api_key else "unknown")
            model = "gpt-4o-mini" if provider == "openai" else ("deepseek-chat" if provider == "deepseek" else None)
            record_usage_event(
                db,
                user_id=user.user_id,
                module="ai_edit",
                provider=provider,
                model=model,
                resource="ai_edit_tokens",
                units=token_est,
                metadata={"mode": payload.mode, "has_custom_prompt": bool(payload.prompt)},
            )
            db.table("history").insert({
                "user_id": user.user_id, "module": "ai_edit",
                "input_text": payload.text[:500], "output_text": text[:500],
                "metadata": {"mode": payload.mode, "tokens": token_est},
            }).execute()
        except Exception:
            pass

    return AiEditResponse(text=text)
