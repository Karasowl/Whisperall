from fastapi import APIRouter, UploadFile, File, Depends, Form

from ..schemas import DictateResponse
from ..auth import get_current_user, check_usage, AuthUser
from ..providers import openai_stt
from ..db import get_supabase_or_none
from ..usage_events import record_usage_event

router = APIRouter(prefix="/v1/dictate", tags=["dictate"])


@router.post("", response_model=DictateResponse)
async def dictate(
    audio: UploadFile = File(...),
    session_id: str | None = Form(default=None),
    is_final: bool = Form(default=False),
    language: str | None = Form(default=None),
    prompt: str | None = Form(default=None),
    user: AuthUser = Depends(get_current_user),
):
    audio_bytes = await audio.read()
    duration_est = max(len(audio_bytes) // 32_000, 1)  # rough estimate: 32KB/s
    check_usage(user, "stt_seconds", duration_est)

    ct = audio.content_type or "audio/webm"
    text = await openai_stt.transcribe(audio_bytes, language=language, prompt=prompt, content_type=ct)
    sid = session_id or "default"

    db = get_supabase_or_none()
    if db:
        try:
            db.rpc("increment_usage", {"p_user_id": user.user_id, "p_stt_seconds": duration_est}).execute()
            record_usage_event(
                db,
                user_id=user.user_id,
                module="dictate",
                provider="openai",
                model="gpt-4o-mini-transcribe",
                resource="stt_seconds",
                units=duration_est,
                metadata={"language": language, "has_prompt": bool(prompt)},
            )
            db.table("history").insert({
                "user_id": user.user_id, "module": "dictate",
                "output_text": text, "metadata": {"language": language, "is_final": is_final},
            }).execute()
        except Exception:
            pass

    return DictateResponse(session_id=sid, text=text, is_final=is_final)
