"""Zhipu AI Provider - OpenAI-compatible GLM models."""

from typing import Optional, Dict, Any, Tuple

import requests

from .base import AIProvider, AIProviderInfo, build_prompt
from ..base import ProviderType, ModelVariant


class ZhipuProvider(AIProvider):
    """Zhipu (GLM) models via OpenAI-compatible API."""

    @classmethod
    def get_info(cls) -> AIProviderInfo:
        return AIProviderInfo(
            id="zhipu",
            name="GLM (Zhipu AI)",
            description="GLM models for high quality edits and summaries.",
            type=ProviderType.API,
            requires_api_key="zhipu",
            models=[
                ModelVariant(id="glm-4-plus", name="GLM-4 Plus", description="Default model"),
            ],
            default_model="glm-4-plus",
            supports_streaming=True,
            context_window=200000,
            docs_url="https://open.bigmodel.cn/dev/api",
            pricing_url="https://open.bigmodel.cn/pricing",
            console_url="https://open.bigmodel.cn/usercenter/apikeys",
        )

    def edit(
        self,
        text: str,
        command: str,
        model: Optional[str] = None,
        **kwargs
    ) -> Tuple[str, Dict[str, Any]]:
        from settings_service import settings_service

        key = settings_service.get_api_key("zhipu")
        if not key:
            raise RuntimeError("Zhipu (GLM) API key is not configured")

        base_url = settings_service.get(
            "providers.ai_edit.zhipu.base_url",
            "https://open.bigmodel.cn/api/paas",
        )
        model_name = model or settings_service.get(
            "providers.ai_edit.zhipu.model",
            "glm-4-plus",
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
            raise RuntimeError(f"Zhipu error: HTTP {resp.status_code}")

        data = resp.json()
        content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        return content.strip(), {"provider": "zhipu", "model": model_name}
