import httpx

from ..config import settings

SYSTEM_PROMPTS = {
    "clean_fillers": "Clean the following transcription by removing filler words (um, uh, like, you know, etc), false starts, and repetitions. Preserve the original meaning. Return only the cleaned text.",
}


async def edit_text(
    text: str,
    mode: str = "clean_fillers",
) -> str:
    """Edit/clean text via OpenAI chat completion."""
    if not settings.openai_api_key:
        return text

    system = SYSTEM_PROMPTS.get(mode, f"Edit the text according to mode: {mode}. Return only the result.")

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {settings.openai_api_key}"},
            json={
                "model": "gpt-4o-mini",
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": text},
                ],
                "temperature": 0.3,
            },
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]
