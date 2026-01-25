"""TTS Provider Registry - Manages available TTS engines"""

from typing import Dict, List, Optional, Type
from .base import TTSProvider, TTSProviderInfo


# Registry of available providers
_PROVIDERS: Dict[str, Type[TTSProvider]] = {}
_INSTANCES: Dict[str, TTSProvider] = {}


def _register_providers():
    """Register all available providers - always register ALL, check deps at runtime"""
    global _PROVIDERS

    # Always register Chatterbox (bundled with app)
    from .chatterbox_provider import ChatterboxProvider
    _PROVIDERS["chatterbox"] = ChatterboxProvider

    # Register F5-TTS provider (deps checked at runtime)
    try:
        from .f5_provider import F5TTSProvider
        _PROVIDERS["f5-tts"] = F5TTSProvider
    except Exception as e:
        print(f"[TTS Registry] Could not load F5TTSProvider: {e}")

    # Register Orpheus provider (deps checked at runtime)
    try:
        from .orpheus_provider import OrpheusProvider
        _PROVIDERS["orpheus"] = OrpheusProvider
    except Exception as e:
        print(f"[TTS Registry] Could not load OrpheusProvider: {e}")

    # Register Kokoro provider (deps checked at runtime)
    try:
        from .kokoro_provider import KokoroProvider
        _PROVIDERS["kokoro"] = KokoroProvider
    except Exception as e:
        print(f"[TTS Registry] Could not load KokoroProvider: {e}")

    # Register Fish-Speech provider (deps checked at runtime)
    try:
        from .fish_speech_provider import FishSpeechProvider
        _PROVIDERS["fish-speech"] = FishSpeechProvider
    except Exception as e:
        print(f"[TTS Registry] Could not load FishSpeechProvider: {e}")

    # Register OpenVoice V2 provider (deps checked at runtime)
    try:
        from .openvoice_provider import OpenVoiceProvider
        _PROVIDERS["openvoice"] = OpenVoiceProvider
    except Exception as e:
        print(f"[TTS Registry] Could not load OpenVoiceProvider: {e}")

    # Register Zonos provider (deps checked at runtime)
    try:
        from .zonos_provider import ZonosProvider
        _PROVIDERS["zonos"] = ZonosProvider
    except Exception as e:
        print(f"[TTS Registry] Could not load ZonosProvider: {e}")

    # Register VibeVoice provider (deps checked at runtime)
    try:
        from .vibevoice_provider import VibeVoiceProvider
        _PROVIDERS["vibevoice"] = VibeVoiceProvider
    except Exception as e:
        print(f"[TTS Registry] Could not load VibeVoiceProvider: {e}")

    # Register VoxCPM provider (deps checked at runtime)
    try:
        from .voxcpm_provider import VoxCPMProvider
        _PROVIDERS["voxcpm"] = VoxCPMProvider
    except Exception as e:
        print(f"[TTS Registry] Could not load VoxCPMProvider: {e}")

    # Register Dia provider (deps checked at runtime)
    try:
        from .dia_provider import DiaProvider
        _PROVIDERS["dia"] = DiaProvider
    except Exception as e:
        print(f"[TTS Registry] Could not load DiaProvider: {e}")

    # ============ API TTS Providers ============

    # Register OpenAI TTS provider (API-based)
    try:
        from .api.openai_tts import OpenAITTSProvider
        _PROVIDERS["openai-tts"] = OpenAITTSProvider
    except Exception as e:
        print(f"[TTS Registry] Could not load OpenAITTSProvider: {e}")

    # Register ElevenLabs provider (API-based)
    try:
        from .api.elevenlabs import ElevenLabsProvider
        _PROVIDERS["elevenlabs"] = ElevenLabsProvider
    except Exception as e:
        print(f"[TTS Registry] Could not load ElevenLabsProvider: {e}")

    # Register Fish Audio provider (API-based)
    try:
        from .api.fishaudio import FishAudioProvider
        _PROVIDERS["fishaudio"] = FishAudioProvider
    except Exception as e:
        print(f"[TTS Registry] Could not load FishAudioProvider: {e}")

    # Register Cartesia provider (API-based)
    try:
        from .api.cartesia import CartesiaProvider
        _PROVIDERS["cartesia"] = CartesiaProvider
    except Exception as e:
        print(f"[TTS Registry] Could not load CartesiaProvider: {e}")

    # Register PlayHT provider (API-based)
    try:
        from .api.playht import PlayHTProvider
        _PROVIDERS["playht"] = PlayHTProvider
    except Exception as e:
        print(f"[TTS Registry] Could not load PlayHTProvider: {e}")

    # Register SiliconFlow provider (API-based)
    try:
        from .api.siliconflow import SiliconFlowProvider
        _PROVIDERS["siliconflow"] = SiliconFlowProvider
    except Exception as e:
        print(f"[TTS Registry] Could not load SiliconFlowProvider: {e}")

    # Register MiniMax TTS provider (API-based)
    try:
        from .api.minimax import MiniMaxTTSProvider
        _PROVIDERS["minimax"] = MiniMaxTTSProvider
    except Exception as e:
        print(f"[TTS Registry] Could not load MiniMaxTTSProvider: {e}")

    # Register Zyphra provider (API-based)
    try:
        from .api.zyphra import ZyphraProvider
        _PROVIDERS["zyphra"] = ZyphraProvider
    except Exception as e:
        print(f"[TTS Registry] Could not load ZyphraProvider: {e}")

    # Register Nari Labs provider (API-based)
    try:
        from .api.narilabs import NariLabsProvider
        _PROVIDERS["narilabs"] = NariLabsProvider
    except Exception as e:
        print(f"[TTS Registry] Could not load NariLabsProvider: {e}")

    # Register DeepInfra TTS provider (API-based)
    try:
        from .api.deepinfra import DeepInfraTTSProvider
        _PROVIDERS["deepinfra-tts"] = DeepInfraTTSProvider
    except Exception as e:
        print(f"[TTS Registry] Could not load DeepInfraTTSProvider: {e}")


# Comprehensive dependency map for all providers
# Format: provider_id -> {
#   "type": "local" | "api",
#   "packages": [list of required Python packages],
#   "api_key": api_key_name (for API providers),
#   "helpers": [list of helper packages used in generate()]
# }
PROVIDER_DEPENDENCIES = {
    # === LOCAL TTS PROVIDERS ===
    "chatterbox": {
        "type": "local",
        "packages": [],  # Bundled with app
        "helpers": ["torch", "torchaudio", "numpy"],
    },
    "f5-tts": {
        "type": "local",
        "packages": ["f5_tts"],
        "helpers": ["torch", "torchaudio", "soundfile"],
    },
    "orpheus": {
        "type": "local",
        "packages": ["orpheus_tts"],
        "helpers": ["torch"],
    },
    "kokoro": {
        "type": "local",
        "packages": ["kokoro"],
        "helpers": ["torch", "soundfile"],
    },
    "fish-speech": {
        "type": "local",
        "packages": ["fish_speech"],
        "helpers": ["torch", "librosa"],
    },
    "openvoice": {
        "type": "local",
        "packages": ["openvoice"],
        "helpers": ["torch", "librosa", "soundfile"],
    },
    "zonos": {
        "type": "local",
        "packages": ["zonos"],
        "helpers": ["torch", "torchaudio"],
    },
    "vibevoice": {
        "type": "local",
        "packages": ["vibevoice"],
        "helpers": ["torch", "torchaudio", "librosa"],
    },
    "voxcpm": {
        "type": "local",
        "packages": ["voxcpm"],
        "helpers": ["torch", "torchaudio", "librosa"],
    },
    "dia": {
        "type": "local",
        "packages": ["dia"],
        "helpers": ["torch", "torchaudio", "soundfile"],
    },
    # === API TTS PROVIDERS ===
    "openai-tts": {
        "type": "api",
        "packages": ["openai"],
        "api_key": "openai",
        "helpers": ["soundfile"],
    },
    "elevenlabs": {
        "type": "api",
        "packages": ["elevenlabs"],
        "api_key": "elevenlabs",
        "helpers": ["soundfile"],
    },
    "fishaudio": {
        "type": "api",
        "packages": ["httpx"],
        "api_key": "fishaudio",
        "helpers": ["soundfile"],
    },
    "cartesia": {
        "type": "api",
        "packages": ["cartesia"],
        "api_key": "cartesia",
        "helpers": [],
    },
    "playht": {
        "type": "api",
        "packages": ["pyht"],
        "api_key": "playht",
        "helpers": ["soundfile"],
    },
    "siliconflow": {
        "type": "api",
        "packages": ["httpx"],
        "api_key": "siliconflow",
        "helpers": ["soundfile"],
    },
    "minimax": {
        "type": "api",
        "packages": ["httpx"],
        "api_key": "minimax",
        "helpers": [],
    },
    "zyphra": {
        "type": "api",
        "packages": ["httpx"],
        "api_key": "zyphra",
        "helpers": ["soundfile"],
    },
    "narilabs": {
        "type": "api",
        "packages": ["httpx"],
        "api_key": "narilabs",
        "helpers": ["soundfile"],
    },
    "deepinfra-tts": {
        "type": "api",
        "packages": ["httpx"],
        "api_key": "deepinfra",
        "helpers": ["soundfile"],
    },
}

# Map provider IDs to model-manager IDs for readiness/auto-install.
# Order matters: first entry is treated as the default download target.
PROVIDER_MODEL_IDS = {
    "chatterbox": ["chatterbox-multilingual", "chatterbox-original", "chatterbox-turbo"],
    "f5-tts": ["f5-tts-base", "f5-tts-spanish", "e2-tts-base"],
    "orpheus": ["orpheus-3b"],
    "kokoro": ["kokoro-82m"],
    "fish-speech": ["fish-speech-1.4", "fish-speech-1.5"],
    "openvoice": ["openvoice-v2"],
    "zonos": ["zonos-hybrid", "zonos-transformer"],
    "vibevoice": ["vibevoice-0.5b"],
    "voxcpm": ["voxcpm-base", "voxcpm-large"],
    "dia": ["dia-1.6b"],
}

# Map provider model variant IDs (from UI) to model-manager IDs.
PROVIDER_VARIANT_MODEL_IDS = {
    "chatterbox": {
        "multilingual": "chatterbox-multilingual",
        "original": "chatterbox-original",
        "turbo": "chatterbox-turbo",
    },
    "f5-tts": {
        "F5TTS_v1_Base": "f5-tts-base",
        "F5-Spanish": "f5-tts-spanish",
        "E2TTS_Base": "e2-tts-base",
    },
}


def is_provider_ready(provider_id: str) -> bool:
    """Check if a provider's dependencies are installed AND model weights are downloaded (or API key configured)"""

    deps = PROVIDER_DEPENDENCIES.get(provider_id)
    if not deps:
        return False

    # Check all required packages
    for pkg in deps.get("packages", []):
        if not _check_import(pkg):
            return False

    # Check helper packages (used in generate())
    for pkg in deps.get("helpers", []):
        if not _check_import(pkg):
            return False

    # API providers: check API key
    if deps["type"] == "api":
        api_key = deps.get("api_key")
        if api_key and not _check_api_key(api_key):
            return False
        return True

    # Local providers: check if model weights are downloaded
    return _check_model_downloaded(provider_id)


def resolve_model_download_id(provider_id: str, model_variant_id: Optional[str] = None) -> Optional[str]:
    """Resolve a UI model variant ID to a model-manager download ID."""
    if model_variant_id:
        mapping = PROVIDER_VARIANT_MODEL_IDS.get(provider_id, {})
        if model_variant_id in mapping:
            return mapping[model_variant_id]
        return model_variant_id

    model_ids = PROVIDER_MODEL_IDS.get(provider_id)
    if model_ids:
        return model_ids[0]
    return None


def is_model_downloaded(provider_id: str, model_variant_id: Optional[str] = None) -> bool:
    """Check if a provider model (or any model) is downloaded."""
    try:
        from model_manager import get_model_manager
        manager = get_model_manager()

        if model_variant_id:
            model_id = resolve_model_download_id(provider_id, model_variant_id)
            return bool(model_id and manager.is_installed(model_id))

        model_ids = PROVIDER_MODEL_IDS.get(provider_id, [])
        for model_id in model_ids:
            if manager.is_installed(model_id):
                return True
        return False
    except Exception as e:
        print(f"[TTS Registry] Error checking model status for {provider_id}: {e}")
        return False


def get_missing_dependencies(provider_id: str, model_variant_id: Optional[str] = None) -> dict:
    """
    Get detailed info about what's missing for a provider.

    Returns: {
        "ready": bool,
        "missing_packages": [list of missing Python packages],
        "missing_api_key": bool,
        "missing_model": bool,
        "error_message": str (human-readable)
    }
    """
    deps = PROVIDER_DEPENDENCIES.get(provider_id)
    if not deps:
        return {
            "ready": False,
            "missing_packages": [],
            "missing_api_key": False,
            "missing_model": False,
            "error_message": f"Unknown provider: {provider_id}"
        }

    missing_packages = []

    # Check main packages
    for pkg in deps.get("packages", []):
        if not _check_import(pkg):
            missing_packages.append(pkg)

    # Check helper packages
    for pkg in deps.get("helpers", []):
        if not _check_import(pkg):
            missing_packages.append(pkg)

    # Check API key for API providers
    missing_api_key = False
    if deps["type"] == "api":
        api_key = deps.get("api_key")
        if api_key and not _check_api_key(api_key):
            missing_api_key = True

    # Check model for local providers
    missing_model = False
    if deps["type"] == "local" and not missing_packages:
        if not is_model_downloaded(provider_id, model_variant_id):
            missing_model = True

    # Build error message
    errors = []
    if missing_packages:
        errors.append(f"Missing packages: {', '.join(missing_packages)}. Run: pip install {' '.join(missing_packages)}")
    if missing_api_key:
        errors.append(f"API key not configured. Set '{deps.get('api_key')}' in Settings.")
    if missing_model:
        errors.append("Model not downloaded. Visit Models page to install.")

    ready = not missing_packages and not missing_api_key and not missing_model

    return {
        "ready": ready,
        "missing_packages": missing_packages,
        "missing_api_key": missing_api_key,
        "missing_model": missing_model,
        "error_message": " ".join(errors) if errors else None
    }


def _check_api_key(key_name: str) -> bool:
    """Check if an API key is configured"""
    try:
        from settings_service import settings_service
        api_key = settings_service.get_api_key(key_name)
        return bool(api_key and len(api_key) > 0)
    except Exception as e:
        print(f"[TTS Registry] Error checking API key {key_name}: {e}")
        return False


def _check_import(module_name: str) -> bool:
    """Check if a module can be imported"""
    try:
        __import__(module_name)
        return True
    except ImportError:
        return False


def _check_model_downloaded(provider_id: str) -> bool:
    """Check if any model weights for a provider are downloaded"""
    return is_model_downloaded(provider_id)


def _ensure_registered():
    """Ensure providers are registered"""
    if not _PROVIDERS:
        _register_providers()


def list_providers() -> List[str]:
    """List all registered provider IDs"""
    _ensure_registered()
    return list(_PROVIDERS.keys())


def get_provider_info(provider_id: str) -> Optional[TTSProviderInfo]:
    """Get info about a specific provider"""
    _ensure_registered()
    provider_class = _PROVIDERS.get(provider_id)
    if provider_class:
        return provider_class.get_info()
    return None


def get_all_provider_info() -> Dict[str, TTSProviderInfo]:
    """Get info about all providers"""
    _ensure_registered()
    return {pid: cls.get_info() for pid, cls in _PROVIDERS.items()}


def get_provider(provider_id: str, device: Optional[str] = None) -> TTSProvider:
    """
    Get a provider instance (creates if needed).

    Instances are cached per provider ID.
    """
    _ensure_registered()

    if provider_id not in _PROVIDERS:
        raise ValueError(f"Unknown TTS provider: {provider_id}. Available: {list_providers()}")

    # Check if we have a cached instance with the right device
    if provider_id in _INSTANCES:
        instance = _INSTANCES[provider_id]
        if device is None or instance.device == device:
            return instance
        # Device mismatch - need to recreate
        instance.unload()
        del _INSTANCES[provider_id]

    # Create new instance
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


def get_providers_for_language(language: str) -> List[str]:
    """Get list of providers that support a given language"""
    _ensure_registered()
    result = []
    for pid, cls in _PROVIDERS.items():
        info = cls.get_info()
        # Normalize language code (e.g., "en-us" -> "en" for comparison)
        lang_base = language.split("-")[0] if "-" in language else language
        supported = [l.split("-")[0] if "-" in l else l for l in info.supported_languages]
        if lang_base in supported or language in info.supported_languages:
            result.append(pid)
    return result


def get_best_provider_for_language(language: str) -> Optional[str]:
    """
    Get the recommended provider for a given language.

    Priority:
    1. F5-TTS for Spanish (best quality)
    2. Chatterbox for English
    3. First available provider that supports the language
    """
    providers = get_providers_for_language(language)

    if not providers:
        return None

    lang_base = language.split("-")[0] if "-" in language else language

    # Spanish: prefer F5-TTS
    if lang_base == "es" and "f5-tts" in providers:
        return "f5-tts"

    # English: prefer Chatterbox
    if lang_base == "en" and "chatterbox" in providers:
        return "chatterbox"

    # Default to first available
    return providers[0]


def check_provider_available(provider_id: str) -> Dict:
    """
    Check if a provider is available and get its status.

    Returns dict with:
    - available: bool
    - installed: bool
    - error: Optional[str]
    """
    _ensure_registered()

    if provider_id not in _PROVIDERS:
        return {
            "available": False,
            "installed": False,
            "error": f"Unknown provider: {provider_id}"
        }

    # Provider class exists, so the package structure is there
    provider_class = _PROVIDERS[provider_id]

    # Try to check if dependencies are met
    try:
        # Check if the provider can provide info (basic test)
        info = provider_class.get_info()
        return {
            "available": True,
            "installed": True,
            "error": None,
            "info": {
                "name": info.name,
                "description": info.description,
                "vram_gb": info.vram_requirement_gb,
            }
        }
    except Exception as e:
        return {
            "available": False,
            "installed": True,
            "error": str(e)
        }
