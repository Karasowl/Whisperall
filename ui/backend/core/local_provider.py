"""Base class for all local model providers.

This module provides a standardized base class for providers that run models
locally (on GPU or CPU). It handles:
- Device detection and selection
- Model loading/unloading lifecycle
- Memory management (GPU cache clearing)
- Seed management for reproducibility
"""

from abc import ABC, abstractmethod
from typing import Optional
import logging

from .device import resolve_device, clear_gpu_cache, set_seed

logger = logging.getLogger(__name__)


class BaseLocalProvider(ABC):
    """
    Abstract base class for local model providers.

    Subclasses must implement:
    - load(): Load model into memory
    - unload(): Unload model and free memory
    - get_info(): Return provider metadata (class method)

    Provides:
    - Automatic device detection (CUDA > MPS > CPU)
    - Model loading state management
    - GPU cache clearing on unload
    - Seed management for reproducibility

    Example:
        class MyTTSProvider(BaseLocalProvider):
            def load(self, model=None):
                model_name = model or "default"
                self._model = load_my_model(model_name, device=self.device)
                self._loaded = True

            def unload(self):
                del self._model
                self._model = None
                self._loaded = False
                self._on_unload()  # Clears GPU cache

            def generate(self, text):
                if not self._loaded:
                    self.load()
                return self._model.generate(text)
    """

    def __init__(self, device: Optional[str] = None):
        """
        Initialize local provider.

        Args:
            device: Device to use ("cuda", "cpu", "mps", or None for auto)
        """
        self.device = resolve_device(device)
        self._loaded = False
        self._model = None
        self._current_model_name: Optional[str] = None

    @abstractmethod
    def load(self, model: Optional[str] = None) -> None:
        """
        Load model into memory.

        Args:
            model: Model variant to load (e.g., "small", "medium", "large")

        Should set self._loaded = True after successful load.
        """
        pass

    @abstractmethod
    def unload(self) -> None:
        """
        Unload model and free memory.

        Should:
        1. Delete model reference
        2. Set self._model = None
        3. Set self._loaded = False
        4. Call self._on_unload() to clear GPU cache
        """
        pass

    @classmethod
    @abstractmethod
    def get_info(cls):
        """Return provider metadata (ProviderInfo or subclass)."""
        pass

    def is_loaded(self) -> bool:
        """Check if model is loaded and ready."""
        return self._loaded

    def _on_unload(self) -> None:
        """
        Cleanup after unloading model.

        Clears GPU cache to free VRAM. Call this at the end of unload().
        """
        clear_gpu_cache()

    def set_seed(self, seed: Optional[int]) -> None:
        """
        Set random seed for reproducibility.

        Args:
            seed: Seed value (None or <= 0 to skip)
        """
        set_seed(seed, self.device)

    def ensure_loaded(self, model: Optional[str] = None) -> None:
        """
        Ensure model is loaded, loading if necessary.

        Args:
            model: Model variant to load
        """
        if not self._loaded:
            self.load(model)
        elif model and model != self._current_model_name:
            # Different model requested, reload
            self.unload()
            self.load(model)

    def _check_installed(self, module_name: str) -> bool:
        """
        Check if a Python module is installed.

        Args:
            module_name: Name of the module to check

        Returns:
            True if module can be imported
        """
        try:
            __import__(module_name)
            return True
        except ImportError:
            return False


class BaseLocalTTSProvider(BaseLocalProvider):
    """
    Base class for local TTS providers.

    Adds TTS-specific functionality like voice handling.
    """

    def __init__(self, device: Optional[str] = None):
        super().__init__(device)
        self._voices_cache: dict = {}

    def get_voices(self) -> list:
        """
        Get available voices.

        Returns:
            List of voice info dicts
        """
        return []

    def get_voice_id(self, voice_name: str) -> Optional[str]:
        """
        Get voice ID from name.

        Args:
            voice_name: Display name of the voice

        Returns:
            Voice ID or None if not found
        """
        voices = self.get_voices()
        for voice in voices:
            if voice.get("name") == voice_name:
                return voice.get("id")
        return None


class BaseLocalSTTProvider(BaseLocalProvider):
    """
    Base class for local STT (speech-to-text) providers.

    Adds STT-specific functionality.
    """

    def __init__(self, device: Optional[str] = None):
        super().__init__(device)

    @abstractmethod
    def transcribe(
        self,
        audio_path,
        language: Optional[str] = None,
        **kwargs
    ):
        """
        Transcribe audio file to text.

        Args:
            audio_path: Path to audio file
            language: Language code (e.g., "en", "es")
            **kwargs: Additional options

        Returns:
            Transcription result
        """
        pass
