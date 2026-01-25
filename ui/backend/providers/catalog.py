"""Unified Provider Catalog - Single source of truth for all service providers"""

from typing import Dict, List, Optional, Any

from .base import ProviderInfo, ServiceType, ProviderType
from .readiness import get_provider_readiness


def get_providers_for_service(service: str) -> List[Dict[str, Any]]:
    """
    Get all providers for a service type.

    Args:
        service: One of 'tts', 'stt', 'ai_edit', 'translation'

    Returns:
        List of provider info dicts
    """
    providers = []

    if service == "tts":
        # TTS uses existing registry in tts_providers/
        try:
            from tts_providers.registry import get_all_provider_info
            for pid, info in get_all_provider_info().items():
                models = []
                for m in info.models:
                    if isinstance(m, dict):
                        models.append({
                            "id": m.get("id"),
                            "name": m.get("name") or m.get("id"),
                            "size_gb": m.get("size_gb", 0),
                            "vram_gb": m.get("vram_gb", 0),
                            "description": m.get("description"),
                        })
                    elif hasattr(m, "id"):
                        models.append({
                            "id": getattr(m, "id"),
                            "name": getattr(m, "name", getattr(m, "id")),
                            "size_gb": getattr(m, "size_gb", 0),
                            "vram_gb": getattr(m, "vram_gb", 0),
                            "description": getattr(m, "description", None),
                        })
                    else:
                        models.append({"id": m, "name": m})

                preset_voices = []
                for v in getattr(info, "preset_voices", []) or []:
                    preset_voices.append({
                        "id": getattr(v, "id", None),
                        "name": getattr(v, "name", None),
                        "language": getattr(v, "language", None),
                        "gender": getattr(v, "gender", None),
                        "description": getattr(v, "description", None),
                    })

                providers.append({
                    "id": pid,
                    "name": info.name,
                    "description": info.description,
                    "type": "local",  # All TTS providers are local
                    "service": "tts",
                    "requires_api_key": None,
                    "requires_model_download": pid,
                    "supported_languages": info.supported_languages,
                    "models": models,
                    "default_model": info.default_model,
                    "voice_cloning": info.voice_cloning.value if hasattr(info.voice_cloning, 'value') else str(info.voice_cloning),
                    "preset_voices": preset_voices,
                    "extra_params": getattr(info, "extra_params", None),
                })
        except ImportError:
            pass

    elif service == "stt":
        try:
            from .stt.registry import get_all_provider_info
            for pid, info in get_all_provider_info().items():
                providers.append(info.to_dict())
        except ImportError:
            pass

    elif service == "ai_edit":
        try:
            from .ai.registry import get_all_provider_info
            for pid, info in get_all_provider_info().items():
                providers.append(info.to_dict())
        except ImportError:
            pass

    elif service == "translation":
        try:
            from .translation.registry import get_all_provider_info
            for pid, info in get_all_provider_info().items():
                providers.append(info.to_dict())
        except ImportError:
            pass

    # Enrich with readiness status
    for provider in providers:
        readiness = get_provider_readiness(service, provider)
        provider["is_available"] = readiness["ready"]
        provider["is_installed"] = readiness["installed"]
        provider["readiness"] = readiness

    return providers


def get_available_providers(service: str) -> List[Dict[str, Any]]:
    """
    Get only providers that are ready to use.

    For API providers: API key is configured
    For local providers: Model is installed
    """
    all_providers = get_providers_for_service(service)
    return [p for p in all_providers if p.get("is_available", False)]


def get_provider_info(service: str, provider_id: str) -> Optional[Dict[str, Any]]:
    """Get info about a specific provider"""
    providers = get_providers_for_service(service)
    for p in providers:
        if p["id"] == provider_id:
            return p
    return None


def get_all_providers() -> Dict[str, List[Dict[str, Any]]]:
    """Get all providers for all services"""
    return {
        "tts": get_providers_for_service("tts"),
        "stt": get_providers_for_service("stt"),
        "ai_edit": get_providers_for_service("ai_edit"),
        "translation": get_providers_for_service("translation"),
    }


def _check_provider_available(provider: Dict[str, Any]) -> bool:
    """Check if a provider is ready to use"""
    from settings_service import settings_service

    provider_type = provider.get("type", "api")

    if provider_type == "api":
        # API providers need API key
        api_key_id = provider.get("requires_api_key")
        if api_key_id:
            key = settings_service.get_api_key(api_key_id)
            return bool(key)
        return True  # No API key required
    else:
        if provider.get("service") == "ai_edit" and provider.get("id") == "ollama":
            return _check_ollama_running(
                settings_service.get("providers.ai_edit.ollama.base_url", "http://localhost:11434")
            )
        # Local providers need model installed
        return _check_provider_installed(provider)


def _check_provider_installed(provider: Dict[str, Any]) -> bool:
    """Check if a local provider's model is installed"""
    provider_type = provider.get("type", "api")

    if provider_type == "api":
        # API providers are always "installed" (they don't need installation)
        from settings_service import settings_service
        api_key_id = provider.get("requires_api_key")
        if api_key_id:
            return bool(settings_service.get_api_key(api_key_id))
        return True

    # For local providers, check if model is downloaded
    model_id = provider.get("requires_model_download")
    if model_id:
        try:
            from model_manager import get_model_manager
            manager = get_model_manager()
            # Check if any model variant is installed
            if manager.is_installed(model_id):
                return True
            # Also check by provider ID patterns
            service = provider.get("service", "")
            if service == "tts":
                # For TTS, delegate to registry which checks both deps and specific model variants
                try:
                    from tts_providers.registry import is_provider_ready
                    return is_provider_ready(provider["id"])
                except ImportError:
                    pass
                # Fallback to simple name check (legacy)
                return manager.is_installed(f"{model_id}-original") or manager.is_installed(model_id)

            elif service in ["stt", "translation"]:
                # For STT/Translation, check if ANY model variant is installed
                # The provider is usable if at least one model is present
                if manager.is_installed(model_id):
                    return True

                # Check other variants in the model list
                if "models" in provider:
                    for m in provider["models"]:
                        # models list contains dicts or strings
                        mid = m["id"] if isinstance(m, dict) else m
                        if manager.is_installed(mid):
                            return True

                return False

            # Generic fallback
            return False
        except Exception:
            return False

    # No model required
    return True


def _check_ollama_running(base_url: str) -> bool:
    """Check if Ollama server is reachable for local AI edit."""
    try:
        import requests
        resp = requests.get(f"{base_url.rstrip('/')}/api/tags", timeout=2)
        return resp.status_code == 200
    except Exception:
        return False


def get_provider_options_for_frontend(service: str) -> List[Dict[str, Any]]:
    """
    Get provider options formatted for frontend SelectMenu.

    Returns list of {value, label, description?, disabled?}
    """
    providers = get_providers_for_service(service)
    options = []

    for p in providers:
        option = {
            "value": p["id"],
            "label": p["name"],
        }

        # Add type indicator
        if p.get("type") == "api":
            option["description"] = "API"
            if not p.get("is_available"):
                option["description"] += " (configure key)"
        else:
            option["description"] = "Local"
            if not p.get("is_installed"):
                option["description"] += " (install model)"

        options.append(option)

    return options
