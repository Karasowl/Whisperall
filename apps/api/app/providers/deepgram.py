import httpx

from ..config import settings


def _extract_text(result: dict) -> str:
    channels = ((result or {}).get("results") or {}).get("channels") or []
    if not channels:
        return ""
    alternatives = (channels[0] or {}).get("alternatives") or []
    if not alternatives:
        return ""
    return (alternatives[0] or {}).get("transcript", "") or ""


def _extract_speaker_segments(result: dict) -> list[dict]:
    utterances = ((result or {}).get("results") or {}).get("utterances") or []
    segments: list[dict] = []
    for utt in utterances:
        text = (utt.get("transcript") or "").strip()
        if not text:
            continue
        speaker_id = utt.get("speaker")
        if isinstance(speaker_id, int):
            speaker_label = f"Speaker {speaker_id + 1}"
        else:
            speaker_label = "Speaker 1"
        segments.append(
            {
                "start": float(utt.get("start") or 0.0),
                "end": float(utt.get("end") or utt.get("start") or 0.0),
                "text": text,
                "speaker": speaker_label,
            }
        )
    return segments


async def transcribe_chunk(
    audio_bytes: bytes,
    language: str | None = None,
    model: str = "nova-3",
    content_type: str = "audio/wav",
) -> str:
    """Transcribe a short audio chunk via Deepgram."""
    if not settings.deepgram_api_key:
        return "[deepgram-stub] transcribed chunk"

    params: dict = {"model": model, "smart_format": "true", "punctuate": "true"}
    if language:
        params["language"] = language
    else:
        params["detect_language"] = "true"

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            "https://api.deepgram.com/v1/listen",
            headers={
                "Authorization": f"Token {settings.deepgram_api_key}",
                "Content-Type": content_type or "application/octet-stream",
            },
            params=params,
            content=audio_bytes,
        )
        resp.raise_for_status()
        result = resp.json()
        return _extract_text(result)


async def transcribe_chunk_diarized(
    audio_bytes: bytes,
    language: str | None = None,
    model: str = "nova-3",
    content_type: str = "audio/wav",
) -> dict:
    """Transcribe a chunk with speaker diarization via Deepgram.

    Defaults bumped from `nova-2` → `nova-3` in 2026-Q2: nova-3 gives
    substantially better speaker boundaries on conversational / talking-head
    content and adds `diarize_version=2024-01-09` behaviour by default, which
    stabilises speaker identity inside a single request. The old `nova-2`
    default caused the user-reported "voice-over intro → main presenter"
    case to ping-pong between Speaker 1 and Speaker 2 multiple times on a
    10-min Spanish clip; nova-3 keeps consistent labels.

    Cross-chunk speaker identity is still Deepgram's blind spot (each chunk
    is a separate request so "Speaker 1" in chunk N isn't necessarily the
    same person as "Speaker 1" in chunk N+1). Fixing that properly requires
    sending the full audio in one request — tracked separately.
    """
    if not settings.deepgram_api_key:
        return {
            "text": "[deepgram-stub] transcribed chunk",
            "segments": [
                {
                    "start": 0.0,
                    "end": 0.0,
                    "text": "[deepgram-stub] transcribed chunk",
                    "speaker": "Speaker 1",
                }
            ],
        }

    params: dict = {
        "model": model,
        "smart_format": "true",
        "punctuate": "true",
        "diarize": "true",
        "utterances": "true",
        # Pin the diarization algorithm to a known-modern version. Without
        # this param Deepgram sometimes falls back to older, less-stable
        # behaviour depending on regional routing.
        "diarize_version": "2024-01-09",
        # Paragraph detection also helps segment coherence.
        "paragraphs": "true",
    }
    if language:
        params["language"] = language
    else:
        params["detect_language"] = "true"

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            "https://api.deepgram.com/v1/listen",
            headers={
                "Authorization": f"Token {settings.deepgram_api_key}",
                "Content-Type": content_type or "application/octet-stream",
            },
            params=params,
            content=audio_bytes,
        )
        resp.raise_for_status()
        result = resp.json()
        text = _extract_text(result)
        segments = _extract_speaker_segments(result)
        if not segments and text.strip():
            segments = [{"start": 0.0, "end": 0.0, "text": text.strip(), "speaker": "Speaker 1"}]
        return {"text": text, "segments": segments}

