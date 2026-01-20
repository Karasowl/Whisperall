"""Gemini AI Provider - Google's Gemini models for text editing"""

from typing import Optional, Dict, Any, Tuple

import requests

from .base import AIProvider, AIProviderInfo, build_prompt
from ..base import ProviderType, ModelVariant


class GeminiProvider(AIProvider):
    """Google Gemini models for AI editing"""

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

        key = settings_service.get_api_key("gemini")
        if not key:
            raise RuntimeError("Gemini API key is not configured")

        model_name = model or settings_service.get("providers.ai_edit.gemini.model", "gemini-1.5-flash")

        payload = {
            "contents": [{"parts": [{"text": build_prompt(text, command)}]}],
            "generationConfig": {"temperature": 0.2},
        }

        resp = requests.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={key}",
            json=payload,
            timeout=120
        )

        if resp.status_code != 200:
            raise RuntimeError(f"Gemini error: HTTP {resp.status_code}")

        data = resp.json()
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
