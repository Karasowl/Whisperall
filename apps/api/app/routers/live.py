import uuid

from fastapi import APIRouter, UploadFile, File, Depends, Form

from ..schemas import LiveChunkResponse
from ..auth import get_current_user, check_usage, AuthUser
from ..providers import deepgram, deepl
from ..db import get_supabase_or_none

router = APIRouter(prefix="/v1/live", tags=["live"])


@router.post("/chunk", response_model=LiveChunkResponse)
async def live_chunk(
    audio: UploadFile = File(...),
    session_id: str | None = Form(default=None),
    chunk_index: int = Form(default=0),
    translate_to: str | None = Form(default=None),
    user: AuthUser = Depends(get_current_user),
):
    audio_bytes = await audio.read()
    duration_est = max(len(audio_bytes) // 32_000, 1)
    check_usage(user, "stt_seconds", duration_est)

    text = await deepgram.transcribe_chunk(audio_bytes)
    translated = None
    if translate_to:
        check_usage(user, "translate_chars", len(text))
        translated = await deepl.translate(text, translate_to)

    segment_id = str(uuid.uuid4())
    db = get_supabase_or_none()
    if db:
        db.table("live_segments").insert({
            "id": segment_id, "user_id": user.user_id,
            "text": text, "translated_text": translated,
        }).execute()
        db.rpc("increment_usage", {
            "p_user_id": user.user_id,
            "p_stt_seconds": duration_est,
            "p_translate_chars": len(text) if translate_to else 0,
        }).execute()

    return LiveChunkResponse(segment_id=segment_id, text=text, translated_text=translated)
