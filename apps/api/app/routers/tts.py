import logging

from fastapi import APIRouter, Depends, HTTPException

from ..schemas import TTSRequest, TTSResponse
from ..auth import get_current_user, check_usage, AuthUser
from ..providers import google_tts
from ..db import get_supabase_or_none
from ..usage_events import record_usage_event

log = logging.getLogger(__name__)
router = APIRouter(prefix="/v1/tts", tags=["tts"])


@router.post("", response_model=TTSResponse)
async def tts(payload: TTSRequest, user: AuthUser = Depends(get_current_user)):
    check_usage(user, "tts_chars", len(payload.text))

    try:
        url = await google_tts.synthesize(payload.text, payload.voice, payload.language)
    except Exception as exc:
        log.error("TTS synthesis failed: %s", exc)
        raise HTTPException(500, "Text-to-speech synthesis failed") from exc

    db = get_supabase_or_none()
    if db:
        try:
            db.rpc("increment_usage", {"p_user_id": user.user_id, "p_tts_chars": len(payload.text)}).execute()
            record_usage_event(
                db,
                user_id=user.user_id,
                module="tts",
                provider="google",
                model=payload.voice or "wavenet",
                resource="tts_chars",
                units=len(payload.text),
                metadata={"voice": payload.voice, "language": payload.language},
            )
            db.table("history").insert({
                "user_id": user.user_id, "module": "tts",
                "input_text": payload.text, "audio_url": url,
                "metadata": {"voice": payload.voice},
            }).execute()
        except Exception:
            pass

    return TTSResponse(audio_url=url)
