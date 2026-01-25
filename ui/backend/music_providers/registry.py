"""Music Provider Registry - Manages available music generation engines"""

from typing import Dict, List, Optional, Type
from .base import MusicProvider, MusicProviderInfo


# Registry of available providers
_PROVIDERS: Dict[str, Type[MusicProvider]] = {}
_INSTANCES: Dict[str, MusicProvider] = {}


def _register_providers():
    """Register all available providers"""
    global _PROVIDERS

    # Register DiffRhythm provider
    try:
        from .diffrhythm_provider import DiffRhythmProvider
        _PROVIDERS["diffrhythm"] = DiffRhythmProvider
    except Exception as e:
        print(f"[Music Registry] Could not load DiffRhythmProvider: {e}")


def _check_import(module_name: str) -> bool:
    """Check if a module can be imported"""
    try:
        __import__(module_name)
        return True
    except ImportError:
        return False


def is_provider_ready(provider_id: str) -> bool:
    """Check if a provider's dependencies are installed"""
    dep_checks = {
        "diffrhythm": lambda: _check_import("diffrhythm"),
    }
    check = dep_checks.get(provider_id)
    return check() if check else False


def _ensure_registered():
    """Ensure providers are registered"""
    if not _PROVIDERS:
        _register_providers()


def list_providers() -> List[str]:
    """List all registered provider IDs"""
    _ensure_registered()
    return list(_PROVIDERS.keys())


def get_provider_info(provider_id: str) -> Optional[MusicProviderInfo]:
    """Get info about a specific provider"""
    _ensure_registered()
    provider_class = _PROVIDERS.get(provider_id)
    if provider_class:
        return provider_class.get_info()
    return None


def get_all_provider_info() -> Dict[str, MusicProviderInfo]:
    """Get info about all providers"""
    _ensure_registered()
    return {pid: cls.get_info() for pid, cls in _PROVIDERS.items()}


def get_provider(provider_id: str, device: Optional[str] = None) -> MusicProvider:
    """
    Get a provider instance (creates if needed).
    """
    _ensure_registered()

    if provider_id not in _PROVIDERS:
        raise ValueError(f"Unknown music provider: {provider_id}. Available: {list_providers()}")

    if provider_id in _INSTANCES:
        instance = _INSTANCES[provider_id]
        if device is None or instance.device == device:
            return instance
        instance.unload()
        del _INSTANCES[provider_id]

    provider_class = _PROVIDERS[provider_id]
    instance = provider_class(device=device)
    _INSTANCES[provider_id] = instance
    return instance


def unload_provider(provider_id: str) -> bool:
    """Unload a provider instance to free memory"""
    if provider_id in _INSTANCES:
        _INSTANCES[provider_id].unload()
        del _INSTANCES[provider_id]
        return True
    return False


def unload_all_providers():
    """Unload all provider instances"""
    for provider_id in list(_INSTANCES.keys()):
        unload_provider(provider_id)
