"""Generic registry factory for provider management.

This module provides a reusable registry pattern that was previously
duplicated across providers/ai/registry.py, providers/stt/registry.py,
tts_providers/registry.py, sfx_providers/registry.py, etc.
"""

from typing import Dict, List, Optional, Type, TypeVar, Generic, Callable, Any
from abc import ABC
import logging

logger = logging.getLogger(__name__)

T = TypeVar('T')  # Provider base type
I = TypeVar('I')  # Provider info type


class BaseRegistry(Generic[T, I]):
    """
    Generic provider registry with caching.

    Features:
    - Lazy provider registration (only loaded when first accessed)
    - Instance caching (reuses provider instances)
    - Device-aware instance management (separate cache per device)
    - Safe import handling (gracefully handles missing dependencies)

    Example:
        class TTSRegistry(BaseRegistry[TTSProvider, TTSProviderInfo]):
            def __init__(self):
                super().__init__("tts")

            def _register_providers(self):
                self._try_register("chatterbox", "tts_providers.chatterbox", "ChatterboxProvider")
                self._try_register("kokoro", "tts_providers.kokoro", "KokoroProvider")

        tts_registry = TTSRegistry()
        provider = tts_registry.get_provider("chatterbox", device="cuda")
    """

    def __init__(self, service_name: str):
        """
        Initialize registry.

        Args:
            service_name: Name of the service (for logging)
        """
        self.service_name = service_name
        self._providers: Dict[str, Type[T]] = {}
        self._instances: Dict[str, T] = {}
        self._registered = False

    def _try_register(
        self,
        provider_id: str,
        module_path: str,
        class_name: str
    ) -> bool:
        """
        Try to register a provider by import path.

        Silently fails if import fails (e.g., missing dependencies).

        Args:
            provider_id: Unique identifier for the provider
            module_path: Full module path (e.g., "providers.ai.openai")
            class_name: Class name to import

        Returns:
            True if registration succeeded
        """
        try:
            module = __import__(module_path, fromlist=[class_name])
            provider_class = getattr(module, class_name)
            self._providers[provider_id] = provider_class
            logger.debug(f"[{self.service_name}] Registered {provider_id}")
            return True
        except ImportError as e:
            logger.debug(f"[{self.service_name}] Could not load {provider_id}: {e}")
            return False
        except Exception as e:
            logger.warning(f"[{self.service_name}] Error loading {provider_id}: {e}")
            return False

    def register(self, provider_id: str, provider_class: Type[T]) -> None:
        """
        Register a provider class directly.

        Args:
            provider_id: Unique identifier
            provider_class: Provider class
        """
        self._providers[provider_id] = provider_class
        logger.debug(f"[{self.service_name}] Registered {provider_id}")

    def _register_providers(self) -> None:
        """
        Register all providers.

        Override this in subclasses to register service-specific providers.
        """
        pass

    def _ensure_registered(self) -> None:
        """Ensure providers are registered (call before any access)."""
        if not self._registered:
            self._register_providers()
            self._registered = True

    def list_providers(self) -> List[str]:
        """
        List all registered provider IDs.

        Returns:
            List of provider IDs
        """
        self._ensure_registered()
        return list(self._providers.keys())

    def has_provider(self, provider_id: str) -> bool:
        """
        Check if a provider is registered.

        Args:
            provider_id: Provider ID to check

        Returns:
            True if provider exists
        """
        self._ensure_registered()
        return provider_id in self._providers

    def get_provider_class(self, provider_id: str) -> Optional[Type[T]]:
        """
        Get provider class without instantiating.

        Args:
            provider_id: Provider ID

        Returns:
            Provider class or None
        """
        self._ensure_registered()
        return self._providers.get(provider_id)

    def get_provider_info(self, provider_id: str) -> Optional[I]:
        """
        Get provider metadata without instantiating.

        Args:
            provider_id: Provider ID

        Returns:
            ProviderInfo or None
        """
        self._ensure_registered()
        provider_class = self._providers.get(provider_id)
        if provider_class and hasattr(provider_class, 'get_info'):
            try:
                return provider_class.get_info()
            except Exception as e:
                logger.warning(f"[{self.service_name}] Error getting info for {provider_id}: {e}")
        return None

    def get_all_provider_info(self) -> Dict[str, I]:
        """
        Get metadata for all providers.

        Returns:
            Dict mapping provider_id to ProviderInfo
        """
        self._ensure_registered()
        result = {}
        for provider_id, provider_class in self._providers.items():
            if hasattr(provider_class, 'get_info'):
                try:
                    result[provider_id] = provider_class.get_info()
                except Exception as e:
                    logger.warning(f"[{self.service_name}] Error getting info for {provider_id}: {e}")
        return result

    def _get_cache_key(self, provider_id: str, device: Optional[str]) -> str:
        """Generate cache key for instance."""
        return f"{provider_id}_{device or 'default'}"

    def get_provider(
        self,
        provider_id: str,
        device: Optional[str] = None,
        **kwargs
    ) -> T:
        """
        Get or create a provider instance.

        Instances are cached by (provider_id, device) tuple.

        Args:
            provider_id: Provider ID
            device: Device to use (for local providers)
            **kwargs: Additional constructor arguments

        Returns:
            Provider instance

        Raises:
            ValueError: If provider_id is not registered
        """
        self._ensure_registered()

        if provider_id not in self._providers:
            available = self.list_providers()
            raise ValueError(
                f"Unknown {self.service_name} provider: '{provider_id}'. "
                f"Available: {available}"
            )

        cache_key = self._get_cache_key(provider_id, device)

        # Return cached instance if available
        if cache_key in self._instances:
            return self._instances[cache_key]

        # Create new instance
        provider_class = self._providers[provider_id]

        try:
            # Try with device parameter
            instance = provider_class(device=device, **kwargs)
        except TypeError:
            # Fall back to no device parameter (API providers)
            try:
                instance = provider_class(**kwargs)
            except TypeError:
                # No arguments
                instance = provider_class()

        self._instances[cache_key] = instance
        logger.debug(f"[{self.service_name}] Created instance: {cache_key}")
        return instance

    def unload_provider(self, provider_id: str) -> bool:
        """
        Unload a provider instance.

        Args:
            provider_id: Provider ID

        Returns:
            True if instance was found and unloaded
        """
        keys_to_remove = [
            k for k in self._instances.keys()
            if k.startswith(f"{provider_id}_")
        ]

        for key in keys_to_remove:
            instance = self._instances[key]
            if hasattr(instance, 'unload'):
                try:
                    instance.unload()
                except Exception as e:
                    logger.warning(f"[{self.service_name}] Error unloading {key}: {e}")
            del self._instances[key]
            logger.debug(f"[{self.service_name}] Unloaded: {key}")

        return bool(keys_to_remove)

    def unload_all(self) -> None:
        """Unload all provider instances."""
        for key, instance in list(self._instances.items()):
            if hasattr(instance, 'unload'):
                try:
                    instance.unload()
                except Exception as e:
                    logger.warning(f"[{self.service_name}] Error unloading {key}: {e}")
            logger.debug(f"[{self.service_name}] Unloaded: {key}")
        self._instances.clear()

    def get_loaded_providers(self) -> List[str]:
        """
        Get list of currently loaded provider instances.

        Returns:
            List of cache keys for loaded instances
        """
        return list(self._instances.keys())
