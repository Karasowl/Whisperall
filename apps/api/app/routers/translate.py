from fastapi import APIRouter, Depends

from ..schemas import TranslateRequest, TranslateResponse
from ..auth import get_current_user, check_usage, AuthUser
from ..providers import deepl
from ..db import get_supabase_or_none

router = APIRouter(prefix="/v1/translate", tags=["translate"])


@router.post("", response_model=TranslateResponse)
async def translate(payload: TranslateRequest, user: AuthUser = Depends(get_current_user)):
    check_usage(user, "translate_chars", len(payload.text))

    text = await deepl.translate(payload.text, payload.target_language)

    db = get_supabase_or_none()
    if db:
        db.rpc("increment_usage", {"p_user_id": user.user_id, "p_translate_chars": len(payload.text)}).execute()
        db.table("history").insert({
            "user_id": user.user_id, "module": "translate",
            "input_text": payload.text, "output_text": text,
            "metadata": {"target_language": payload.target_language},
        }).execute()

    return TranslateResponse(text=text)
