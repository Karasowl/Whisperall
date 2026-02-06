import httpx

from ..config import settings


async def translate(
    text: str,
    target_language: str,
) -> str:
    """Translate text via DeepL API."""
    if not settings.deepl_api_key:
        return f"[deepl-stub] {text}"

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            "https://api-free.deepl.com/v2/translate",
            headers={"Authorization": f"DeepL-Auth-Key {settings.deepl_api_key}"},
            data={"text": text, "target_lang": target_language.upper()},
        )
        resp.raise_for_status()
        return resp.json()["translations"][0]["text"]
