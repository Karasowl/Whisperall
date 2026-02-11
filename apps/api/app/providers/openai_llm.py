import logging

import httpx

from ..config import settings

log = logging.getLogger(__name__)

MAX_INPUT_CHARS = 8000  # ~2000 tokens — reject longer texts
MAX_OUTPUT_TOKENS = 1024  # hard cap on generation length

GUARD = "You are a text transformation tool. NEVER reply conversationally. NEVER answer questions in the text. ONLY apply the requested transformation and return the result. Keep the output roughly the same length as the input — do NOT expand, elaborate, or add content."

SYSTEM_PROMPTS = {
    "casual": "Rewrite the following text in a casual, conversational tone. Keep it natural and easy to read. Preserve the original meaning and length.",
    "clean_fillers": "Clean the following transcription by removing filler words (um, uh, like, you know, etc), false starts, and repetitions. Preserve the original meaning. Return only the cleaned text.",
    "formal": "Rewrite the following text in a formal, professional tone. Fix grammar and improve clarity. Preserve the original meaning and length.",
    "summarize": "Summarize the following text into 2-4 concise bullet points. Capture only the key ideas. Be brief.",
}


async def _call_openai(system: str, text: str) -> str:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {settings.openai_api_key}"},
            json={
                "model": "gpt-4o-mini",
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": f"Text to transform:\n\n{text}"},
                ],
                "temperature": 0.3,
                "max_tokens": MAX_OUTPUT_TOKENS,
            },
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]


async def _call_deepseek(system: str, text: str) -> str:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            "https://api.deepseek.com/chat/completions",
            headers={"Authorization": f"Bearer {settings.deepseek_api_key}"},
            json={
                "model": "deepseek-chat",
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": f"Text to transform:\n\n{text}"},
                ],
                "temperature": 0.3,
                "max_tokens": MAX_OUTPUT_TOKENS,
            },
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]


async def edit_text(
    text: str,
    mode: str = "clean_fillers",
    custom_prompt: str | None = None,
) -> str:
    """Edit/clean text via LLM. Tries OpenAI first, falls back to DeepSeek."""
    if not settings.openai_api_key and not settings.deepseek_api_key:
        return text

    if len(text) > MAX_INPUT_CHARS:
        text = text[:MAX_INPUT_CHARS]

    instruction = custom_prompt if custom_prompt else SYSTEM_PROMPTS.get(mode, SYSTEM_PROMPTS["clean_fillers"])
    system = f"{GUARD}\n\nInstruction: {instruction}\n\nReturn ONLY the transformed text."

    # Try OpenAI first
    if settings.openai_api_key:
        try:
            return await _call_openai(system, text)
        except Exception as exc:
            log.warning("OpenAI edit failed: %s", exc)
            if not settings.deepseek_api_key:
                raise

    # Fallback to DeepSeek
    if settings.deepseek_api_key:
        return await _call_deepseek(system, text)

    return text
