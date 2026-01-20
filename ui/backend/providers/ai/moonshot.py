"""Moonshot AI Provider - OpenAI-compatible Kimi models."""

from typing import Optional, Dict, Any, Tuple

import requests

from .base import AIProvider, AIProviderInfo, build_prompt
from ..base import ProviderType, ModelVariant


class MoonshotProvider(AIProvider):
    """Moonshot (Kimi) models via OpenAI-compatible API."""

    @classmethod
    def get_info(cls) -> AIProviderInfo:
        return AIProviderInfo(
            id="moonshot",
            name="Moonshot (Kimi)",
            description="OpenAI-compatible Kimi LLMs for fast text editing.",
            type=ProviderType.API,
            requires_api_key="moonshot",
            models=[
                ModelVariant(id="kimi-k2-0905", name="Kimi K2 0905", description="Default model"),
            ],
            default_model="kimi-k2-0905",
            supports_streaming=True,
            context_window=200000,
            docs_url="https://platform.moonshot.ai/docs",
            pricing_url="https://platform.moonshot.ai/pricing",
            console_url="https://platform.moonshot.ai/console",
        )

    def edit(
        self,
        text: str,
        command: str,
        model: Optional[str] = None,
        **kwargs
    ) -> Tuple[str, Dict[str, Any]]:
        from settings_service import settings_service

        key = settings_service.get_api_key("moonshot")
        if not key:
            raise RuntimeError("Moonshot API key is not configured")

        base_url = settings_service.get(
            "providers.ai_edit.moonshot.base_url",
            "https://api.moonshot.ai",
        )
        model_name = model or settings_service.get(
            "providers.ai_edit.moonshot.model",
            "kimi-k2-0905",
        )

        payload = {
            "model": model_name,
            "messages": [
                {"role": "system", "content": "You edit text. Return only the edited text."},
                {"role": "user", "content": build_prompt(text, command)},
            ],
            "temperature": 0.2,
        }

        resp = requests.post(
            f"{base_url.rstrip('/')}/v1/chat/completions",
            headers={"Authorization": f"Bearer {key}"},
            json=payload,
            timeout=120,
        )

        if resp.status_code != 200:
            raise RuntimeError(f"Moonshot error: HTTP {resp.status_code}")

        data = resp.json()
        content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        return content.strip(), {"provider": "moonshot", "model": model_name}
