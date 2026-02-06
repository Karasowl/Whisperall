from fastapi import APIRouter, Depends

from ..schemas import TTSRequest, TTSResponse
from ..auth import get_current_user, check_usage, AuthUser
from ..providers import google_tts
from ..db import get_supabase_or_none

router = APIRouter(prefix="/v1/tts", tags=["tts"])


@router.post("", response_model=TTSResponse)
async def tts(payload: TTSRequest, user: AuthUser = Depends(get_current_user)):
    check_usage(user, "tts_chars", len(payload.text))

    url = await google_tts.synthesize(payload.text, payload.voice)

    db = get_supabase_or_none()
    if db:
        db.rpc("increment_usage", {"p_user_id": user.user_id, "p_tts_chars": len(payload.text)}).execute()
        db.table("history").insert({
            "user_id": user.user_id, "module": "tts",
            "input_text": payload.text, "audio_url": url,
            "metadata": {"voice": payload.voice},
        }).execute()

    return TTSResponse(audio_url=url)
