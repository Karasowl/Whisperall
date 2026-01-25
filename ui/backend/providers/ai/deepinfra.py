"""DeepInfra AI Provider - OpenAI-compatible API with many open models."""

from typing import Optional, Dict, Any, Tuple

from .base import AIProvider, AIProviderInfo, build_prompt
from ..base import ProviderType, ModelVariant
from core.api_provider import BaseAPIProvider, APIProviderConfig


class DeepInfraProvider(BaseAPIProvider, AIProvider):
    """DeepInfra models via OpenAI-compatible API.

    DeepInfra provides access to many open-source models like Llama, Mistral,
    Qwen, and more at competitive prices with fast inference.
    """

    CONFIG = APIProviderConfig(
        provider_id="deepinfra",
        provider_name="DeepInfra",
        api_key_name="deepinfra",
        base_url="https://api.deepinfra.com/v1/openai"
    )

    def __init__(self):
        BaseAPIProvider.__init__(self)

    @classmethod
    def get_info(cls) -> AIProviderInfo:
        return AIProviderInfo(
            id="deepinfra",
            name="DeepInfra",
            description="Fast inference for 100+ open-source models. Llama, DeepSeek, Mistral, Qwen and more.",
            type=ProviderType.API,
            requires_api_key="deepinfra",
            models=[
                # Llama models
                ModelVariant(id="meta-llama/Meta-Llama-3.1-8B-Instruct", name="Llama 3.1 8B", description="$0.03/M - Fast, good quality"),
                ModelVariant(id="meta-llama/Meta-Llama-3.1-70B-Instruct", name="Llama 3.1 70B", description="$0.23/M - High quality"),
                ModelVariant(id="meta-llama/Meta-Llama-3.1-405B-Instruct", name="Llama 3.1 405B", description="$1.79/M - Best Llama"),
                ModelVariant(id="meta-llama/Llama-3.3-70B-Instruct", name="Llama 3.3 70B", description="$0.23/M - Latest 70B"),
                # DeepSeek models
                ModelVariant(id="deepseek-ai/DeepSeek-V3", name="DeepSeek V3", description="$0.26/M - Top tier reasoning"),
                ModelVariant(id="deepseek-ai/DeepSeek-R1", name="DeepSeek R1", description="$0.50/M - Advanced reasoning"),
                ModelVariant(id="deepseek-ai/DeepSeek-R1-Turbo", name="DeepSeek R1 Turbo", description="Faster R1 variant"),
                # Qwen models
                ModelVariant(id="Qwen/Qwen2.5-7B-Instruct", name="Qwen 2.5 7B", description="$0.05/M - Fast multilingual"),
                ModelVariant(id="Qwen/Qwen2.5-72B-Instruct", name="Qwen 2.5 72B", description="$0.40/M - Excellent multilingual"),
                ModelVariant(id="Qwen/Qwen2.5-Coder-32B-Instruct", name="Qwen 2.5 Coder 32B", description="Best for code"),
                # Mistral models
                ModelVariant(id="mistralai/Mistral-7B-Instruct-v0.3", name="Mistral 7B", description="$0.03/M - Fast and capable"),
                ModelVariant(id="mistralai/Mistral-Small-24B-Instruct-2501", name="Mistral Small 24B", description="$0.05/M - Good balance"),
                # Google Gemma
                ModelVariant(id="google/gemma-2-9b-it", name="Gemma 2 9B", description="$0.05/M - Efficient"),
                ModelVariant(id="google/gemma-2-27b-it", name="Gemma 2 27B", description="$0.15/M - High quality"),
                # NVIDIA
                ModelVariant(id="nvidia/Llama-3.1-Nemotron-70B-Instruct", name="Nemotron 70B", description="NVIDIA optimized"),
            ],
            default_model="meta-llama/Meta-Llama-3.1-8B-Instruct",
            supports_streaming=True,
            context_window=128000,
            docs_url="https://deepinfra.com/docs",
            pricing_url="https://deepinfra.com/pricing",
            console_url="https://deepinfra.com/dash/api_keys",
        )

    def edit(
        self,
        text: str,
        command: str,
        model: Optional[str] = None,
        **kwargs
    ) -> Tuple[str, Dict[str, Any]]:
        from settings_service import settings_service

        model_name = model or settings_service.get(
            "providers.ai_edit.deepinfra.model",
            "meta-llama/Meta-Llama-3.1-8B-Instruct"
        )

        payload = {
            "model": model_name,
            "messages": [
                {"role": "system", "content": "You edit text. Return only the edited text."},
                {"role": "user", "content": build_prompt(text, command)},
            ],
            "temperature": 0.2,
        }

        response = self.client.post("/chat/completions", json=payload)
        data = response.json()

        content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        return content.strip(), {
            "provider": "deepinfra",
            "model": model_name
        }
