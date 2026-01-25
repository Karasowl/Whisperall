"""Gemini AI Provider - Google's Gemini models for text editing"""

from typing import Optional, Dict, Any, Tuple

from .base import AIProvider, AIProviderInfo, build_prompt
from ..base import ProviderType, ModelVariant
from core.api_provider import BaseAPIProvider, APIProviderConfig


class GeminiProvider(BaseAPIProvider, AIProvider):
    """Google Gemini models for AI editing"""

    CONFIG = APIProviderConfig(
        provider_id="gemini",
        provider_name="Gemini",
        api_key_name="gemini",
        base_url="https://generativelanguage.googleapis.com"
    )

    def __init__(self):
        BaseAPIProvider.__init__(self)

    def _get_auth_header(self, api_key: str) -> Dict[str, str]:
        """Gemini uses key in query param, not header. Return empty dict."""
        return {}

    @classmethod
    def get_info(cls) -> AIProviderInfo:
        return AIProviderInfo(
            id="gemini",
            name="Gemini",
            description="Google's Gemini models. Fast and capable.",
            type=ProviderType.API,
            requires_api_key="gemini",
            models=[
                ModelVariant(id="gemini-1.5-flash", name="Gemini 1.5 Flash", description="Fast, cost-effective"),
                ModelVariant(id="gemini-1.5-pro", name="Gemini 1.5 Pro", description="Best quality"),
            ],
            default_model="gemini-1.5-flash",
            supports_streaming=True,
            context_window=1000000,
            docs_url="https://ai.google.dev/docs",
            pricing_url="https://ai.google.dev/pricing",
            console_url="https://aistudio.google.com/app/apikey",
        )

    def edit(
        self,
        text: str,
        command: str,
        model: Optional[str] = None,
        **kwargs
    ) -> Tuple[str, Dict[str, Any]]:
        from settings_service import settings_service

        model_name = model or settings_service.get("providers.ai_edit.gemini.model", "gemini-1.5-flash")

        payload = {
            "contents": [{"parts": [{"text": build_prompt(text, command)}]}],
            "generationConfig": {"temperature": 0.2},
        }

        # Gemini uses API key as query parameter
        response = self.client.post(
            f"/v1beta/models/{model_name}:generateContent",
            json=payload,
            params={"key": self._api_key}
        )
        data = response.json()

        content = ""
        candidates = data.get("candidates") or []
        if candidates:
            parts = candidates[0].get("content", {}).get("parts") or []
            if parts:
                content = parts[0].get("text", "")
        return content.strip(), {
            "provider": "gemini",
            "model": model_name
        }
