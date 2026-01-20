"""Ollama AI Provider - Local LLM inference"""

from typing import Optional, Dict, Any, Tuple

import requests

from .base import AIProvider, AIProviderInfo, build_prompt
from ..base import ProviderType, ModelVariant


class OllamaProvider(AIProvider):
    """Local LLM using Ollama"""

    @classmethod
    def get_info(cls) -> AIProviderInfo:
        return AIProviderInfo(
            id="ollama",
            name="Ollama (Local)",
            description="Run LLMs locally with Ollama. Free, private, no internet required.",
            type=ProviderType.LOCAL,
            models=[
                ModelVariant(id="llama3.2", name="Llama 3.2 (3B)", size_gb=2.0, vram_gb=4, description="Fast, good for simple edits"),
                ModelVariant(id="llama3.1", name="Llama 3.1 (8B)", size_gb=4.7, vram_gb=8, description="Balanced quality and speed"),
                ModelVariant(id="mistral", name="Mistral (7B)", size_gb=4.1, vram_gb=8, description="Good for general tasks"),
                ModelVariant(id="gemma2", name="Gemma 2 (9B)", size_gb=5.4, vram_gb=10, description="High quality edits"),
            ],
            default_model="llama3.2",
            supports_streaming=True,
            context_window=8192,
            docs_url="https://ollama.ai",
        )

    def edit(
        self,
        text: str,
        command: str,
        model: Optional[str] = None,
        **kwargs
    ) -> Tuple[str, Dict[str, Any]]:
        from settings_service import settings_service

        base_url = settings_service.get("providers.ai_edit.ollama.base_url", "http://localhost:11434")
        model_name = model or settings_service.get("providers.ai_edit.ollama.model", "llama3.2")

        payload = {
            "model": model_name,
            "prompt": build_prompt(text, command),
            "stream": False,
        }

        resp = requests.post(f"{base_url}/api/generate", json=payload, timeout=120)
        if resp.status_code != 200:
            raise RuntimeError(f"Ollama error: HTTP {resp.status_code}")

        data = resp.json()
        return data.get("response", "").strip(), {
            "provider": "ollama",
            "model": model_name
        }
