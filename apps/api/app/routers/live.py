import uuid
import json
import asyncio
import logging
import tempfile
import os

from fastapi import APIRouter, UploadFile, File, Depends, Form, HTTPException, WebSocket, WebSocketDisconnect
import websockets

from ..schemas import LiveChunkResponse
from ..auth import get_current_user, check_usage, AuthUser
from ..config import settings
from ..providers import openai_stt, deepl
from ..db import get_supabase_or_none

log = logging.getLogger(__name__)

_DEBUG_DIR = os.path.join(tempfile.gettempdir(), "whisperall_debug")
os.makedirs(_DEBUG_DIR, exist_ok=True)

router = APIRouter(prefix="/v1/live", tags=["live"])


# ── WebSocket streaming endpoint (Deepgram proxy) ────────

DG_URL = (
    "wss://api.deepgram.com/v1/listen"
    "?model=nova-2&language=multi&smart_format=true&punctuate=true"
    "&interim_results=true&utterance_end_ms=1500&vad_events=true"
)


@router.websocket("/stream")
async def live_stream(ws: WebSocket):
    """Proxy audio from client to Deepgram and return real-time transcripts."""
    await ws.accept()

    if not settings.deepgram_api_key:
        await ws.send_json({"type": "error", "message": "Deepgram API key not configured"})
        await ws.close()
        return

    headers = {"Authorization": f"Token {settings.deepgram_api_key}"}
    try:
        async with websockets.connect(DG_URL, additional_headers=headers) as dg:
            log.info("[live/stream] connected to Deepgram")

            async def forward_audio():
                """Client → Deepgram: forward binary audio frames."""
                try:
                    while True:
                        data = await ws.receive_bytes()
                        await dg.send(data)
                except WebSocketDisconnect:
                    log.info("[live/stream] client disconnected")
                except Exception:
                    pass
                finally:
                    try:
                        await dg.send(json.dumps({"type": "CloseStream"}))
                    except Exception:
                        pass

            async def keep_alive():
                """Send KeepAlive every 8s to prevent Deepgram timeout."""
                try:
                    while True:
                        await asyncio.sleep(8)
                        await dg.send(json.dumps({"type": "KeepAlive"}))
                except Exception:
                    pass

            async def forward_transcripts():
                """Deepgram → Client: forward transcript results."""
                try:
                    async for msg in dg:
                        data = json.loads(msg)
                        if data.get("type") == "Results":
                            alt = data["channel"]["alternatives"][0]
                            transcript = alt.get("transcript", "")
                            is_final = data.get("is_final", False)
                            speech_final = data.get("speech_final", False)
                            if transcript:
                                await ws.send_json({
                                    "type": "transcript",
                                    "text": transcript,
                                    "is_final": is_final,
                                    "speech_final": speech_final,
                                })
                        elif data.get("type") == "UtteranceEnd":
                            await ws.send_json({"type": "utterance_end"})
                except websockets.exceptions.ConnectionClosed:
                    pass
                except Exception as exc:
                    log.error("[live/stream] transcript relay error: %s", exc)

            await asyncio.gather(forward_audio(), forward_transcripts(), keep_alive())
    except Exception as exc:
        log.error("[live/stream] Deepgram connection failed: %s", exc)
        try:
            await ws.send_json({"type": "error", "message": str(exc)})
            await ws.close()
        except Exception:
            pass


# ── Existing REST chunk endpoint (kept as fallback) ──────

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

    debug_path = os.path.join(_DEBUG_DIR, f"chunk_{chunk_index}.webm")
    if chunk_index < 3:
        with open(debug_path, "wb") as f:
            f.write(audio_bytes)

    ct = audio.content_type or "audio/webm"
    try:
        text = await openai_stt.diarize(audio_bytes, content_type=ct)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"STT provider error: {exc}") from exc

    translated = None
    if translate_to and text:
        check_usage(user, "translate_chars", len(text))
        translated = await deepl.translate(text, translate_to)

    segment_id = str(uuid.uuid4())

    db = get_supabase_or_none()
    if db:
        try:
            db.table("live_segments").insert({
                "id": segment_id, "user_id": user.user_id,
                "text": text, "translated_text": translated,
            }).execute()
            db.rpc("increment_usage", {
                "p_user_id": user.user_id,
                "p_stt_seconds": duration_est,
                "p_translate_chars": len(text) if translate_to else 0,
            }).execute()
            db.table("history").insert({
                "user_id": user.user_id, "module": "live",
                "output_text": text,
                "metadata": {"session_id": session_id, "chunk_index": chunk_index},
            }).execute()
        except Exception:
            pass

    return LiveChunkResponse(segment_id=segment_id, text=text, translated_text=translated, segments=[])
