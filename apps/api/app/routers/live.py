import uuid
import json
import asyncio
import logging
import tempfile
import os

from fastapi import APIRouter, UploadFile, File, Depends, Form, HTTPException, WebSocket, WebSocketDisconnect
import websockets

from ..schemas import LiveChunkResponse
from ..auth import get_current_user, check_usage, AuthUser, authenticate_token, PLAN_LIMITS, normalize_plan
from ..config import settings
from ..providers import openai_stt, deepl
from ..db import get_supabase_or_none
from ..usage_events import record_usage_event

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

    # Authenticate (browser WebSocket API cannot set headers; token is passed via query string).
    token = ws.query_params.get("token") or ""
    if not token and not settings.auth_disabled:
        await ws.send_json({"type": "error", "message": "Missing token", "code": "AUTH_REQUIRED"})
        await ws.close(code=1008)
        return
    try:
        user = authenticate_token(token) if token else authenticate_token("")
    except HTTPException as exc:
        await ws.send_json({"type": "error", "message": str(exc.detail), "code": "AUTH_INVALID"})
        await ws.close(code=1008)
        return

    if not settings.deepgram_api_key:
        await ws.send_json({"type": "error", "message": "Deepgram API key not configured", "code": "CONFIG_MISSING"})
        await ws.close(code=1011)
        return

    db = get_supabase_or_none()
    stream_id = str(uuid.uuid4())
    chunk_ms = 500  # default; client may override via meta message
    total_audio_ms = 0
    unflushed_seconds = 0
    flushed_seconds = 0
    used_start = int((user.usage or {}).get("stt_seconds", 0) or 0)
    limits = PLAN_LIMITS.get(normalize_plan(user.plan), PLAN_LIMITS["free"])
    limit_seconds = limits.get("stt_seconds")
    flush_target = 60  # seconds per DB write batch

    headers = {"Authorization": f"Token {settings.deepgram_api_key}"}
    try:
        # websockets<15 uses extra_headers; websockets>=15 uses additional_headers.
        try:
            dg_connect = websockets.connect(DG_URL, additional_headers=headers)
        except TypeError:
            dg_connect = websockets.connect(DG_URL, extra_headers=headers)

        async with dg_connect as dg:
            log.info("[live/stream] connected to Deepgram")
            client_disconnected = asyncio.Event()

            async def flush_seconds(force: bool = False) -> bool:
                """Flush unflushed STT seconds to DB. Returns False if stream should stop."""
                nonlocal unflushed_seconds, flushed_seconds
                if not db:
                    # Still enforce limits, but skip DB writes.
                    if limit_seconds is not None and used_start + flushed_seconds + unflushed_seconds > int(limit_seconds):
                        await ws.send_json({"type": "error", "message": "Plan limit exceeded", "code": "PLAN_LIMIT_EXCEEDED"})
                        try:
                            await ws.close(code=1008)
                        except Exception:
                            pass
                        return False
                    return True

                if unflushed_seconds <= 0:
                    return True

                # Enforce plan limit (best-effort).
                if limit_seconds is not None:
                    remaining = int(limit_seconds) - used_start - flushed_seconds
                    if remaining <= 0:
                        await ws.send_json({"type": "error", "message": "Plan limit exceeded", "code": "PLAN_LIMIT_EXCEEDED"})
                        try:
                            await ws.close(code=1008)
                        except Exception:
                            pass
                        return False
                    if unflushed_seconds > remaining:
                        # Flush what we can, then stop.
                        to_flush = remaining
                        should_stop = True
                    else:
                        to_flush = unflushed_seconds
                        should_stop = False
                else:
                    to_flush = unflushed_seconds
                    should_stop = False

                if to_flush > 0:
                    try:
                        db.rpc("increment_usage", {"p_user_id": user.user_id, "p_stt_seconds": int(to_flush)}).execute()
                    except Exception:
                        pass
                    record_usage_event(
                        db,
                        user_id=user.user_id,
                        module="live_stream",
                        provider="deepgram",
                        model="nova-2",
                        resource="stt_seconds",
                        units=int(to_flush),
                        metadata={"stream_id": stream_id, "chunk_ms": chunk_ms},
                    )
                    flushed_seconds += int(to_flush)
                    unflushed_seconds -= int(to_flush)

                if should_stop:
                    await ws.send_json({"type": "error", "message": "Plan limit exceeded", "code": "PLAN_LIMIT_EXCEEDED"})
                    try:
                        await ws.close(code=1008)
                    except Exception:
                        pass
                    return False
                return True

            async def forward_audio():
                """Client → Deepgram: forward binary audio frames."""
                nonlocal total_audio_ms, unflushed_seconds, chunk_ms
                try:
                    while True:
                        msg = await ws.receive()
                        if msg.get("bytes") is not None:
                            data = msg["bytes"]
                            if data:
                                await dg.send(data)
                            # Account audio time in seconds (chunked by client timeslice).
                            total_audio_ms_delta = int(chunk_ms)
                            if total_audio_ms_delta < 50 or total_audio_ms_delta > 10_000:
                                total_audio_ms_delta = 500
                            total_audio_ms += total_audio_ms_delta
                            whole_seconds = total_audio_ms // 1000
                            already_accounted = flushed_seconds + unflushed_seconds
                            new_seconds = whole_seconds - already_accounted
                            if new_seconds > 0:
                                unflushed_seconds += int(new_seconds)

                            # Stop quickly if over limit (best-effort).
                            if limit_seconds is not None and used_start + flushed_seconds + unflushed_seconds > int(limit_seconds):
                                ok = await flush_seconds(force=True)
                                if not ok:
                                    break

                            if unflushed_seconds >= flush_target:
                                ok = await flush_seconds()
                                if not ok:
                                    break

                        elif msg.get("text") is not None:
                            # Optional metadata message from client
                            try:
                                payload = json.loads(msg["text"])
                                if payload.get("type") == "meta":
                                    next_chunk_ms = int(payload.get("chunk_ms") or 0)
                                    if 50 <= next_chunk_ms <= 10_000:
                                        chunk_ms = next_chunk_ms
                            except Exception:
                                pass
                except WebSocketDisconnect:
                    log.info("[live/stream] client disconnected")
                except Exception:
                    pass
                finally:
                    client_disconnected.set()
                    # Final flush (ceil to avoid undercounting partial seconds).
                    try:
                        final_seconds = (int(total_audio_ms) + 999) // 1000
                        already_accounted = flushed_seconds + unflushed_seconds
                        extra = final_seconds - already_accounted
                        if extra > 0:
                            unflushed_seconds += int(extra)
                        await flush_seconds(force=True)
                    except Exception:
                        pass
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
                        elif data.get("type") == "Error":
                            # Surface Deepgram errors to the client; otherwise the UI looks stuck.
                            message = (
                                data.get("description")
                                or data.get("message")
                                or data.get("error")
                                or "Deepgram error"
                            )
                            await ws.send_json({"type": "error", "message": str(message), "code": "DEEPGRAM_ERROR"})
                            try:
                                await ws.close(code=1011)
                            except Exception:
                                pass
                            return
                except websockets.exceptions.ConnectionClosed:
                    # If Deepgram drops unexpectedly, inform the client.
                    if not client_disconnected.is_set():
                        try:
                            await ws.send_json({"type": "error", "message": "Deepgram disconnected", "code": "DEEPGRAM_DISCONNECTED"})
                            await ws.close(code=1011)
                        except Exception:
                            pass
                except Exception as exc:
                    log.error("[live/stream] transcript relay error: %s", exc)

            await asyncio.gather(forward_audio(), forward_transcripts(), keep_alive())
    except Exception as exc:
        log.error("[live/stream] Deepgram connection failed: %s", exc)
        try:
            await ws.send_json({"type": "error", "message": str(exc), "code": "DEEPGRAM_CONNECT_FAILED"})
            await ws.close(code=1011)
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
            record_usage_event(
                db,
                user_id=user.user_id,
                module="live_chunk",
                provider="openai",
                model="gpt-4o-transcribe-diarize",
                resource="stt_seconds",
                units=duration_est,
                metadata={"session_id": session_id, "chunk_index": chunk_index},
            )
            if translate_to and text:
                record_usage_event(
                    db,
                    user_id=user.user_id,
                    module="live_chunk",
                    provider="deepl",
                    model="deepl",
                    resource="translate_chars",
                    units=len(text),
                    metadata={"target_language": translate_to, "session_id": session_id, "chunk_index": chunk_index},
                )
            db.table("history").insert({
                "user_id": user.user_id, "module": "live",
                "output_text": text,
                "metadata": {"session_id": session_id, "chunk_index": chunk_index},
            }).execute()
        except Exception:
            pass

    return LiveChunkResponse(segment_id=segment_id, text=text, translated_text=translated, segments=[])
