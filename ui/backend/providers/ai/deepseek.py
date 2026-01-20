"""DeepSeek AI Provider - OpenAI-compatible API"""

from typing import Optional, Dict, Any, Tuple

import requests

from .base import AIProvider, AIProviderInfo, build_prompt
from ..base import ProviderType, ModelVariant


class DeepSeekProvider(AIProvider):
    """DeepSeek models via OpenAI-compatible API"""

    @classmethod
    def get_info(cls) -> AIProviderInfo:
        return AIProviderInfo(
            id="deepseek",
            name="DeepSeek",
            description="DeepSeek models. Cost-effective with good quality.",
            type=ProviderType.API,
            requires_api_key="deepseek",
            models=[
                ModelVariant(id="deepseek-chat", name="DeepSeek Chat", description="General purpose"),
                ModelVariant(id="deepseek-coder", name="DeepSeek Coder", description="Code-focused"),
            ],
            default_model="deepseek-chat",
            supports_streaming=True,
            context_window=32000,
            docs_url="https://platform.deepseek.com/docs",
            pricing_url="https://platform.deepseek.com/pricing",
            console_url="https://platform.deepseek.com/api_keys",
        )

    def edit(
        self,
        text: str,
        command: str,
        model: Optional[str] = None,
        **kwargs
    ) -> Tuple[str, Dict[str, Any]]:
        from settings_service import settings_service

        key = settings_service.get_api_key("deepseek")
        if not key:
            raise RuntimeError("DeepSeek API key is not configured")

        base_url = settings_service.get("providers.ai_edit.deepseek.base_url", "https://api.deepseek.com")
        model_name = model or settings_service.get("providers.ai_edit.deepseek.model", "deepseek-chat")

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
            timeout=120
        )

        if resp.status_code != 200:
            raise RuntimeError(f"DeepSeek error: HTTP {resp.status_code}")

        data = resp.json()
        content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        return content.strip(), {
            "provider": "deepseek",
            "model": model_name
        }
