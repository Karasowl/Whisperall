"""STT Provider Registry - Manages available STT engines"""

from typing import Dict, List, Optional, Type

from .base import STTProvider, STTProviderInfo


# Registry of available providers
_PROVIDERS: Dict[str, Type[STTProvider]] = {}
_INSTANCES: Dict[str, STTProvider] = {}


def _register_providers():
    """Register all available STT providers"""
    global _PROVIDERS

    # Always register Faster-Whisper (local, bundled)
    try:
        from .faster_whisper import FasterWhisperProvider
        _PROVIDERS["faster-whisper"] = FasterWhisperProvider
    except ImportError:
        pass

    # API providers - always register, they'll check for keys at runtime
    try:
        from .openai import OpenAIWhisperProvider
        _PROVIDERS["openai"] = OpenAIWhisperProvider
    except ImportError:
        pass

    try:
        from .groq import GroqWhisperProvider
        _PROVIDERS["groq"] = GroqWhisperProvider
    except ImportError:
        pass

    try:
        from .deepgram import DeepgramProvider
        _PROVIDERS["deepgram"] = DeepgramProvider
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


def get_provider_info(provider_id: str) -> Optional[STTProviderInfo]:
    """Get info about a specific provider"""
    _ensure_registered()
    provider_class = _PROVIDERS.get(provider_id)
    if provider_class:
        return provider_class.get_info()
    return None


def get_all_provider_info() -> Dict[str, STTProviderInfo]:
    """Get info about all providers"""
    _ensure_registered()
    return {pid: cls.get_info() for pid, cls in _PROVIDERS.items()}


def get_provider(provider_id: str, device: Optional[str] = None) -> STTProvider:
    """
    Get a provider instance (creates if needed).

    Instances are cached per provider ID.
    """
    _ensure_registered()

    # Handle legacy provider IDs like "faster-whisper-base"
    base_provider_id = provider_id
    if provider_id.startswith("faster-whisper-"):
        base_provider_id = "faster-whisper"

    if base_provider_id not in _PROVIDERS:
        raise ValueError(f"Unknown STT provider: {provider_id}. Available: {list_providers()}")

    # Check if we have a cached instance with the right device
    cache_key = f"{base_provider_id}_{device or 'default'}"
    if cache_key in _INSTANCES:
        return _INSTANCES[cache_key]

    # Create new instance
    provider_class = _PROVIDERS[base_provider_id]
    instance = provider_class(device=device)
    _INSTANCES[cache_key] = instance
    return instance


def unload_provider(provider_id: str) -> bool:
    """Unload a provider instance to free memory"""
    keys_to_remove = [k for k in _INSTANCES.keys() if k.startswith(provider_id)]
    for key in keys_to_remove:
        if hasattr(_INSTANCES[key], 'unload'):
            _INSTANCES[key].unload()
        del _INSTANCES[key]
    return bool(keys_to_remove)


def unload_all_providers():
    """Unload all provider instances"""
    for provider_id in list(_INSTANCES.keys()):
        if hasattr(_INSTANCES[provider_id], 'unload'):
            _INSTANCES[provider_id].unload()
    _INSTANCES.clear()
