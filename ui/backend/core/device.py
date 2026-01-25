"""Unified device detection for all providers.

This module centralizes device detection logic that was previously duplicated
across multiple provider base classes (providers/base.py, tts_providers/base.py,
sfx_providers/base.py, music_providers/base.py, etc.).
"""

from typing import Literal, Optional, Dict
from functools import lru_cache
import logging

logger = logging.getLogger(__name__)

DeviceType = Literal["cuda", "cpu", "mps", "auto"]


@lru_cache(maxsize=1)
def get_available_devices() -> Dict[str, bool]:
    """
    Detect available compute devices (cached).

    Returns:
        Dict with device availability: {"cpu": True, "cuda": bool, "mps": bool}
    """
    result = {"cpu": True, "cuda": False, "mps": False}
    try:
        import torch
        result["cuda"] = torch.cuda.is_available()
        result["mps"] = hasattr(torch.backends, 'mps') and torch.backends.mps.is_available()
    except ImportError:
        logger.debug("PyTorch not available, defaulting to CPU")
    return result


def detect_device(preference: DeviceType = "auto") -> str:
    """
    Detect best available device based on preference.

    Args:
        preference: Device preference - "auto", "cuda", "cpu", or "mps"

    Returns:
        Device string ("cuda", "cpu", or "mps")
    """
    available = get_available_devices()

    if preference == "cuda":
        return "cuda" if available["cuda"] else "cpu"
    elif preference == "cpu":
        return "cpu"
    elif preference == "mps":
        return "mps" if available["mps"] else "cpu"
    else:  # auto
        if available["cuda"]:
            return "cuda"
        elif available["mps"]:
            return "mps"
        return "cpu"


def get_device_preference() -> DeviceType:
    """
    Get user's device preference from settings.

    Returns:
        Device preference from settings or "auto" as default
    """
    try:
        from settings_service import settings_service
        return settings_service.get("performance.device", "auto")
    except ImportError:
        return "auto"


def resolve_device(device: Optional[str] = None) -> str:
    """
    Resolve device with fallback to user preference.

    This is the main function providers should use to determine
    which device to use for computation.

    Args:
        device: Explicit device or None for auto-detection

    Returns:
        Resolved device string ("cuda", "cpu", or "mps")
    """
    if device and device != "auto":
        return detect_device(device)
    return detect_device(get_device_preference())


def clear_gpu_cache() -> None:
    """
    Clear GPU memory cache.

    Call this after unloading models to free VRAM.
    """
    try:
        import torch
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            logger.debug("CUDA cache cleared")
    except ImportError:
        pass


def set_seed(seed: Optional[int], device: str = "cpu") -> None:
    """
    Set random seed for reproducibility.

    Args:
        seed: Random seed value (None or <= 0 to skip)
        device: Current device ("cuda", "cpu", "mps")
    """
    if seed is None or seed <= 0:
        return

    try:
        import torch
        torch.manual_seed(seed)
        if device == "cuda" and torch.cuda.is_available():
            torch.cuda.manual_seed(seed)
            torch.cuda.manual_seed_all(seed)
        logger.debug(f"Random seed set to {seed}")
    except ImportError:
        pass
