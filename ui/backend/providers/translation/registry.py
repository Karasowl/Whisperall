"""Translation Provider Registry - Manages available translation engines"""

from typing import Dict, List, Optional, Type

from .base import TranslationProvider, TranslationProviderInfo


# Registry of available providers
_PROVIDERS: Dict[str, Type[TranslationProvider]] = {}


def _register_providers():
    """Register all available translation providers"""
    global _PROVIDERS

    # Local provider - Argos
    try:
        from .argos import ArgosProvider
        _PROVIDERS["argos"] = ArgosProvider
    except ImportError:
        pass

    # API providers
    try:
        from .deepl import DeepLProvider
        _PROVIDERS["deepl"] = DeepLProvider
    except ImportError:
        pass

    try:
        from .google import GoogleProvider
        _PROVIDERS["google"] = GoogleProvider
    except ImportError:
        pass

    try:
        from .deepseek import DeepSeekTranslationProvider
        _PROVIDERS["deepseek"] = DeepSeekTranslationProvider
    except ImportError:
        pass

    try:
        from .zhipu import ZhipuTranslationProvider
        _PROVIDERS["zhipu"] = ZhipuTranslationProvider
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


def get_provider_info(provider_id: str) -> Optional[TranslationProviderInfo]:
    """Get info about a specific provider"""
    _ensure_registered()
    provider_class = _PROVIDERS.get(provider_id)
    if provider_class:
        return provider_class.get_info()
    return None


def get_all_provider_info() -> Dict[str, TranslationProviderInfo]:
    """Get info about all providers"""
    _ensure_registered()
    return {pid: cls.get_info() for pid, cls in _PROVIDERS.items()}


def get_provider(provider_id: str) -> TranslationProvider:
    """Get a provider instance"""
    _ensure_registered()

    if provider_id not in _PROVIDERS:
        raise ValueError(f"Unknown translation provider: {provider_id}. Available: {list_providers()}")

    provider_class = _PROVIDERS[provider_id]
    return provider_class()
