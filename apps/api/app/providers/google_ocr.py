import base64

import httpx

from ..config import settings


def _api_key() -> str | None:
    # Reuse Google TTS key if OCR key isn't explicitly configured.
    return settings.google_ocr_api_key or settings.google_tts_api_key


def _request_payload(image_bytes: bytes, language_hint: str | None) -> dict:
    payload: dict = {
        "image": {"content": base64.b64encode(image_bytes).decode("ascii")},
        "features": [{"type": "DOCUMENT_TEXT_DETECTION"}],
    }
    if language_hint:
        payload["imageContext"] = {"languageHints": [language_hint]}
    return payload


def _extract_response(response: dict) -> dict:
    err = response.get("error")
    if err:
        message = err.get("message") or "Google OCR failed"
        raise RuntimeError(message)

    full = response.get("fullTextAnnotation") or {}
    text = (full.get("text") or "").strip()
    pages = full.get("pages") or []

    blocks: list[dict] = []
    for page_idx, page in enumerate(pages):
        for block in page.get("blocks") or []:
            words: list[str] = []
            for para in block.get("paragraphs") or []:
                for word in para.get("words") or []:
                    token = "".join((sym.get("text") or "") for sym in (word.get("symbols") or []))
                    if token:
                        words.append(token)
            block_text = " ".join(words).strip()
            if block_text:
                blocks.append({"page": page_idx + 1, "text": block_text})

    return {"text": text, "blocks": blocks, "pages": len(pages)}


async def extract_text(
    image_bytes: bytes,
    mime_type: str | None = None,
    language_hint: str | None = None,
    timeout_sec: int = 180,
) -> dict:
    """Extract text from a single image bytes payload via Google Vision."""
    key = _api_key()
    if not key:
        raise RuntimeError("GOOGLE_OCR_API_KEY (or GOOGLE_TTS_API_KEY) is not configured")

    async with httpx.AsyncClient(timeout=timeout_sec) as client:
        resp = await client.post(
            "https://vision.googleapis.com/v1/images:annotate",
            params={"key": key},
            json={"requests": [_request_payload(image_bytes, language_hint)]},
        )
        resp.raise_for_status()
        data = resp.json() or {}

    responses = data.get("responses") or []
    if not responses:
        return {"text": "", "blocks": [], "pages": 0}
    return _extract_response(responses[0] or {})


async def extract_images_text(
    images: list[bytes],
    language_hint: str | None = None,
    timeout_sec: int = 180,
) -> list[dict]:
    """Extract text from multiple images in a single batch request."""
    key = _api_key()
    if not key:
        raise RuntimeError("GOOGLE_OCR_API_KEY (or GOOGLE_TTS_API_KEY) is not configured")

    if not images:
        return []

    requests = [_request_payload(img, language_hint) for img in images]
    async with httpx.AsyncClient(timeout=timeout_sec) as client:
        resp = await client.post(
            "https://vision.googleapis.com/v1/images:annotate",
            params={"key": key},
            json={"requests": requests},
        )
        resp.raise_for_status()
        data = resp.json() or {}

    out: list[dict] = []
    for response in (data.get("responses") or []):
        out.append(_extract_response(response or {}))
    return out
