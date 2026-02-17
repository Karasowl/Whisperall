import logging

import httpx

from ..config import settings

log = logging.getLogger(__name__)

MAX_CHUNK_CHARS = 12_000
MAX_OUTPUT_TOKENS = 4_096
MIN_OUTPUT_TOKENS = 512
SUMMARY_OUTPUT_TOKENS = 1_024

GUARD = "You are a text transformation tool. NEVER reply conversationally. NEVER answer questions in the text. ONLY apply the requested transformation and return the result. Keep the output roughly the same length as the input — do NOT expand, elaborate, or add content."

SYSTEM_PROMPTS = {
    "casual": "Rewrite the following text in a casual, conversational tone. Keep it natural and easy to read. Preserve the original meaning and length.",
    "clean_fillers": "Clean the following transcription by removing filler words (um, uh, like, you know, etc), false starts, and repetitions. Preserve the original meaning. Return only the cleaned text.",
    "formal": "Rewrite the following text in a formal, professional tone. Fix grammar and improve clarity. Preserve the original meaning and length.",
    "summarize": "Summarize the following text into 2-4 concise bullet points. Capture only the key ideas. Be brief.",
}


def _estimate_tokens(text: str) -> int:
    # Keep this aligned with usage estimation in the ai_edit router.
    return max(1, (len(text) + 3) // 4)


def _output_budget(mode: str, text: str) -> int:
    if mode == "summarize":
        return SUMMARY_OUTPUT_TOKENS
    return min(MAX_OUTPUT_TOKENS, max(MIN_OUTPUT_TOKENS, int(_estimate_tokens(text) * 1.25)))


def _split_large_block(block: str, max_chars: int) -> list[str]:
    words = block.split()
    if not words:
        return []
    parts: list[str] = []
    current = words[0]
    for word in words[1:]:
        candidate = f"{current} {word}"
        if len(candidate) <= max_chars:
            current = candidate
            continue
        parts.append(current)
        current = word
    parts.append(current)
    return parts


def _split_text(text: str, max_chars: int = MAX_CHUNK_CHARS) -> list[str]:
    normalized = text.replace("\r\n", "\n").strip()
    if len(normalized) <= max_chars:
        return [normalized]

    chunks: list[str] = []
    current = ""
    for raw_block in normalized.split("\n\n"):
        block = raw_block.strip()
        if not block:
            continue
        if len(block) > max_chars:
            if current:
                chunks.append(current)
                current = ""
            chunks.extend(_split_large_block(block, max_chars))
            continue
        candidate = block if not current else f"{current}\n\n{block}"
        if len(candidate) <= max_chars:
            current = candidate
            continue
        chunks.append(current)
        current = block
    if current:
        chunks.append(current)
    return chunks or [normalized]


async def _call_openai(system: str, text: str, max_output_tokens: int) -> str:
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
                "max_tokens": max_output_tokens,
            },
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]


async def _call_deepseek(system: str, text: str, max_output_tokens: int) -> str:
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
                "max_tokens": max_output_tokens,
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

    source = text.strip()
    if not source:
        return source

    instruction = custom_prompt if custom_prompt else SYSTEM_PROMPTS.get(mode, SYSTEM_PROMPTS["clean_fillers"])
    system = f"{GUARD}\n\nInstruction: {instruction}\n\nReturn ONLY the transformed text."
    chunks = _split_text(source, MAX_CHUNK_CHARS)

    async def _transform(chunk_text: str, max_output_tokens: int) -> str:
        if settings.openai_api_key:
            try:
                return await _call_openai(system, chunk_text, max_output_tokens)
            except Exception as exc:
                log.warning("OpenAI edit failed: %s", exc)
                if not settings.deepseek_api_key:
                    raise
        if settings.deepseek_api_key:
            return await _call_deepseek(system, chunk_text, max_output_tokens)
        return chunk_text

    # Summaries over long texts: summarize each chunk, then merge.
    if mode == "summarize" and len(chunks) > 1:
        partials: list[str] = []
        for chunk in chunks:
            partials.append(await _transform(chunk, _output_budget(mode, chunk)))
        merge_instruction = (
            "Merge the following chunk summaries into one concise 2-6 bullet list. "
            "Keep only key points and avoid duplication."
        )
        merge_system = f"{GUARD}\n\nInstruction: {merge_instruction}\n\nReturn ONLY the transformed text."
        merged_text = "\n\n".join(partials)
        if settings.openai_api_key:
            try:
                return await _call_openai(merge_system, merged_text, SUMMARY_OUTPUT_TOKENS)
            except Exception as exc:
                log.warning("OpenAI summary merge failed: %s", exc)
                if not settings.deepseek_api_key:
                    raise
        if settings.deepseek_api_key:
            return await _call_deepseek(merge_system, merged_text, SUMMARY_OUTPUT_TOKENS)
        return merged_text

    outputs: list[str] = []
    for chunk in chunks:
        outputs.append(await _transform(chunk, _output_budget(mode, chunk)))
    return "\n\n".join(outputs)
