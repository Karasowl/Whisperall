"""Shared provider readiness checks and install helpers."""

from __future__ import annotations

from typing import Any, Dict, List, Optional


PIP_PACKAGE_OVERRIDES = {
    "faster_whisper": "faster-whisper",
    "f5_tts": "f5-tts",
    "fish_speech": "fish-speech",
    "orpheus_tts": "orpheus-tts",
}

SERVICE_DEPENDENCIES: Dict[str, Dict[str, Dict[str, List[str]]]] = {
    "stt": {
        "faster-whisper": {"packages": ["faster_whisper"]},
    },
    "translation": {
        "argos": {"packages": ["argostranslate"]},
    },
    "ai_edit": {},
}


def resolve_pip_package(module_name: str) -> str:
    """Map import/module name to pip package name."""
    if module_name in PIP_PACKAGE_OVERRIDES:
        return PIP_PACKAGE_OVERRIDES[module_name]
    return module_name.replace("_", "-")


def _check_import(module_name: str) -> bool:
    try:
        __import__(module_name)
        return True
    except ImportError:
        return False


def _check_api_key(key_name: str) -> bool:
    try:
        from settings_service import settings_service
        return bool(settings_service.get_api_key(key_name))
    except Exception:
        return False


def _check_ollama_running(base_url: str) -> bool:
    try:
        import requests
        resp = requests.get(f"{base_url.rstrip('/')}/api/tags", timeout=2)
        return resp.status_code == 200
    except Exception:
        return False


def _resolve_model_id(provider: Dict[str, Any], preferred_model_id: Optional[str]) -> Optional[str]:
    if preferred_model_id:
        return preferred_model_id
    if provider.get("requires_model_download"):
        return provider.get("requires_model_download")
    models = provider.get("models") or []
    for model in models:
        if isinstance(model, dict) and model.get("id"):
            return model["id"]
    return None


def _is_model_installed(model_id: Optional[str]) -> bool:
    if not model_id:
        return False
    try:
        from model_manager import get_model_manager
        manager = get_model_manager()
        return manager.is_installed(model_id)
    except Exception:
        return False


def get_provider_readiness(
    service: str,
    provider: Dict[str, Any],
    preferred_model_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Return readiness info for a provider across services."""
    provider_id = provider.get("id")
    provider_type = provider.get("type", "api")

    missing_packages: List[str] = []
    missing_api_key = False
    missing_model = False
    missing_service = False

    if service == "tts":
        from tts_providers.registry import get_missing_dependencies, resolve_model_download_id, is_model_downloaded

        model_variant_id = preferred_model_id
        missing = get_missing_dependencies(provider_id, model_variant_id=model_variant_id)
        missing_packages = missing.get("missing_packages", [])
        missing_api_key = bool(missing.get("missing_api_key"))
        missing_model = bool(missing.get("missing_model"))
        install_model_id = resolve_model_download_id(provider_id, model_variant_id)
        installed = is_model_downloaded(provider_id, model_variant_id=model_variant_id) if provider_type == "local" else not missing_api_key
    else:
        deps = SERVICE_DEPENDENCIES.get(service, {}).get(provider_id, {})
        for pkg in deps.get("packages", []):
            if not _check_import(pkg):
                missing_packages.append(pkg)

        if provider_type == "api":
            api_key_id = provider.get("requires_api_key")
            if api_key_id and not _check_api_key(api_key_id):
                missing_api_key = True
            installed = not missing_api_key
            install_model_id = None
        else:
            if provider_id == "ollama":
                from settings_service import settings_service
                base_url = settings_service.get("providers.ai_edit.ollama.base_url", "http://localhost:11434")
                missing_service = not _check_ollama_running(base_url)
                installed = not missing_service
                install_model_id = None
            else:
                model_id = _resolve_model_id(provider, preferred_model_id)
                installed = _is_model_installed(model_id)
                missing_model = not installed if model_id else False
                install_model_id = model_id

    ready = not missing_packages and not missing_api_key and not missing_model and not missing_service

    error_parts: List[str] = []
    if missing_packages:
        error_parts.append(f"Missing packages: {', '.join(missing_packages)}")
    if missing_api_key:
        error_parts.append("Missing API key")
    if missing_model:
        error_parts.append("Missing model files")
    if missing_service:
        error_parts.append("Local service not running")

    return {
        "ready": ready,
        "installed": installed,
        "missing_packages": missing_packages,
        "missing_api_key": missing_api_key,
        "missing_model": missing_model,
        "missing_service": missing_service,
        "install_model_id": install_model_id,
        "error_message": "; ".join(error_parts) if error_parts else None,
    }
