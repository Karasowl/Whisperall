"""Core infrastructure for unified provider system.

This module provides shared utilities and base classes for all providers:

- Device detection and management (device.py)
- HTTP client with retry and error handling (http_client.py)
- Base classes for API providers (api_provider.py)
- Base classes for local providers (local_provider.py)
- Audio processing utilities (audio.py)
- Generic registry pattern (registry.py)

Usage:
    from core import BaseAPIProvider, APIProviderConfig
    from core import BaseLocalProvider
    from core import resolve_device, clear_gpu_cache
    from core import decode_audio_bytes, normalize_audio
    from core import BaseRegistry
"""

# Device utilities
from .device import (
    DeviceType,
    get_available_devices,
    detect_device,
    get_device_preference,
    resolve_device,
    clear_gpu_cache,
    set_seed,
)

# HTTP client
from .http_client import (
    APIClient,
    APIClientConfig,
    HTTPError,
    AuthenticationError,
    RateLimitError,
    ServerError,
)

# API provider base
from .api_provider import (
    APIProviderConfig,
    BaseAPIProvider,
    OpenAICompatibleProvider,
)

# Local provider base
from .local_provider import (
    BaseLocalProvider,
    BaseLocalTTSProvider,
    BaseLocalSTTProvider,
)

# Audio utilities
from .audio import (
    decode_audio_bytes,
    normalize_audio,
    resample_audio,
    encode_audio_wav,
    save_audio_wav,
    adjust_speed,
    torch_to_numpy,
    concatenate_audio_chunks,
)

# Registry
from .registry import BaseRegistry

__all__ = [
    # Device
    "DeviceType",
    "get_available_devices",
    "detect_device",
    "get_device_preference",
    "resolve_device",
    "clear_gpu_cache",
    "set_seed",
    # HTTP
    "APIClient",
    "APIClientConfig",
    "HTTPError",
    "AuthenticationError",
    "RateLimitError",
    "ServerError",
    # API Provider
    "APIProviderConfig",
    "BaseAPIProvider",
    "OpenAICompatibleProvider",
    # Local Provider
    "BaseLocalProvider",
    "BaseLocalTTSProvider",
    "BaseLocalSTTProvider",
    # Audio
    "decode_audio_bytes",
    "normalize_audio",
    "resample_audio",
    "encode_audio_wav",
    "save_audio_wav",
    "adjust_speed",
    "torch_to_numpy",
    "concatenate_audio_chunks",
    # Registry
    "BaseRegistry",
]
