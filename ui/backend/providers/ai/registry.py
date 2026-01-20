"""AI Edit Provider Registry - Manages available AI editing engines"""

from typing import Dict, List, Optional, Type

from .base import AIProvider, AIProviderInfo


# Registry of available providers
_PROVIDERS: Dict[str, Type[AIProvider]] = {}


def _register_providers():
    """Register all available AI providers"""
    global _PROVIDERS

    # Local provider - Ollama
    try:
        from .ollama import OllamaProvider
        _PROVIDERS["ollama"] = OllamaProvider
    except ImportError:
        pass

    # API providers
    try:
        from .openai import OpenAIProvider
        _PROVIDERS["openai"] = OpenAIProvider
    except ImportError:
        pass

    try:
        from .claude import ClaudeProvider
        _PROVIDERS["claude"] = ClaudeProvider
    except ImportError:
        pass

    try:
        from .gemini import GeminiProvider
        _PROVIDERS["gemini"] = GeminiProvider
    except ImportError:
        pass

    try:
        from .deepseek import DeepSeekProvider
        _PROVIDERS["deepseek"] = DeepSeekProvider
    except ImportError:
        pass

    try:
        from .moonshot import MoonshotProvider
        _PROVIDERS["moonshot"] = MoonshotProvider
    except ImportError:
        pass

    try:
        from .minimax import MiniMaxProvider
        _PROVIDERS["minimax"] = MiniMaxProvider
    except ImportError:
        pass

    try:
        from .zhipu import ZhipuProvider
        _PROVIDERS["zhipu"] = ZhipuProvider
    except ImportError:
        pass


def _ensure_registered():
    """Ensure providers are registered"""
    if not _PROVIDERS:
        _register_providers()


def list_providers() -> List[str]:
    """List all registered provider IDs"""
    _ensure_registered()
    return list(_PROVIDERS.keys())


def get_provider_info(provider_id: str) -> Optional[AIProviderInfo]:
    """Get info about a specific provider"""
    _ensure_registered()
    provider_class = _PROVIDERS.get(provider_id)
    if provider_class:
        return provider_class.get_info()
    return None


def get_all_provider_info() -> Dict[str, AIProviderInfo]:
    """Get info about all providers"""
    _ensure_registered()
    return {pid: cls.get_info() for pid, cls in _PROVIDERS.items()}


def get_provider(provider_id: str) -> AIProvider:
    """Get a provider instance"""
    _ensure_registered()

    if provider_id not in _PROVIDERS:
        raise ValueError(f"Unknown AI provider: {provider_id}. Available: {list_providers()}")

    provider_class = _PROVIDERS[provider_id]
    return provider_class()
