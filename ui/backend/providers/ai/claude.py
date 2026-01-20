"""Claude AI Provider - Anthropic's Claude models for text editing"""

from typing import Optional, Dict, Any, Tuple

import requests

from .base import AIProvider, AIProviderInfo, build_prompt
from ..base import ProviderType, ModelVariant


class ClaudeProvider(AIProvider):
    """Anthropic Claude models for AI editing"""

    @classmethod
    def get_info(cls) -> AIProviderInfo:
        return AIProviderInfo(
            id="claude",
            name="Claude",
            description="Anthropic's Claude models. Excellent at nuanced text editing.",
            type=ProviderType.API,
            requires_api_key="claude",
            models=[
                ModelVariant(id="claude-3-haiku-20240307", name="Claude 3 Haiku", description="Fast, cost-effective"),
                ModelVariant(id="claude-3-5-sonnet-20241022", name="Claude 3.5 Sonnet", description="Best balance of quality and speed"),
                ModelVariant(id="claude-3-opus-20240229", name="Claude 3 Opus", description="Highest quality"),
            ],
            default_model="claude-3-haiku-20240307",
            supports_streaming=True,
            context_window=200000,
            docs_url="https://docs.anthropic.com",
            pricing_url="https://anthropic.com/pricing",
            console_url="https://console.anthropic.com/settings/keys",
        )

    def edit(
        self,
        text: str,
        command: str,
        model: Optional[str] = None,
        **kwargs
    ) -> Tuple[str, Dict[str, Any]]:
        from settings_service import settings_service

        key = settings_service.get_api_key("claude")
        if not key:
            raise RuntimeError("Claude API key is not configured")

        model_name = model or settings_service.get("providers.ai_edit.claude.model", "claude-3-haiku-20240307")

        payload = {
            "model": model_name,
            "max_tokens": 4096,
            "temperature": 0.2,
            "messages": [{"role": "user", "content": build_prompt(text, command)}],
        }

        resp = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": key, "anthropic-version": "2023-06-01"},
            json=payload,
            timeout=120
        )

        if resp.status_code != 200:
            raise RuntimeError(f"Claude error: HTTP {resp.status_code}")

        data = resp.json()
        content = ""
        if data.get("content"):
            content = data["content"][0].get("text", "")
        return content.strip(), {
            "provider": "claude",
            "model": model_name
        }
