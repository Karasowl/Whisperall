from fastapi import APIRouter, Depends

from ..schemas import TranslateRequest, TranslateResponse
from ..auth import get_current_user, check_usage, AuthUser
from ..providers import deepl
from ..db import get_supabase_or_none
from ..usage_events import record_usage_event

router = APIRouter(prefix="/v1/translate", tags=["translate"])


@router.post("", response_model=TranslateResponse)
async def translate(payload: TranslateRequest, user: AuthUser = Depends(get_current_user)):
    check_usage(user, "translate_chars", len(payload.text))

    text = await deepl.translate(payload.text, payload.target_language)

    db = get_supabase_or_none()
    if db:
        try:
            db.rpc("increment_usage", {"p_user_id": user.user_id, "p_translate_chars": len(payload.text)}).execute()
            record_usage_event(
                db,
                user_id=user.user_id,
                module="translate",
                provider="deepl",
                model="deepl",
                resource="translate_chars",
                units=len(payload.text),
                metadata={"target_language": payload.target_language},
            )
            db.table("history").insert({
                "user_id": user.user_id, "module": "translate",
                "input_text": payload.text, "output_text": text,
                "metadata": {"target_language": payload.target_language},
            }).execute()
        except Exception:
            pass

    return TranslateResponse(text=text)
