"""Base class for all API-based providers.

This module provides a standardized base class for providers that communicate
with external APIs. It handles:
- API key retrieval and validation
- HTTP client initialization
- Common authentication patterns
"""

from abc import ABC, abstractmethod
from typing import Optional, Dict, Any
from dataclasses import dataclass
import logging

from .http_client import APIClient, APIClientConfig, AuthenticationError

logger = logging.getLogger(__name__)


@dataclass
class APIProviderConfig:
    """Configuration for an API provider."""
    provider_id: str          # Unique identifier (e.g., "openai")
    provider_name: str        # Display name (e.g., "OpenAI")
    api_key_name: str         # Key name in settings (e.g., "openai")
    base_url: str             # Base API URL
    timeout: int = 120        # Default request timeout
    max_retries: int = 3      # Max retry attempts


class BaseAPIProvider(ABC):
    """
    Abstract base class for API-based providers.

    Subclasses must define a CONFIG class attribute with APIProviderConfig.

    Handles:
    - API key validation and retrieval from settings
    - HTTP client initialization with proper auth headers
    - Lazy client initialization (only created when first used)

    Example:
        class OpenAIProvider(BaseAPIProvider):
            CONFIG = APIProviderConfig(
                provider_id="openai",
                provider_name="OpenAI",
                api_key_name="openai",
                base_url="https://api.openai.com"
            )

            def some_method(self):
                response = self.client.post("/v1/endpoint", json=data)
                return response.json()
    """

    # Subclasses must define this
    CONFIG: APIProviderConfig

    def __init__(self, config: Optional[APIProviderConfig] = None):
        """
        Initialize API provider.

        Args:
            config: Optional override for CONFIG class attribute
        """
        self._config = config or getattr(self.__class__, 'CONFIG', None)
        if not self._config:
            raise ValueError(
                f"{self.__class__.__name__} must define CONFIG class attribute "
                "or pass config to __init__"
            )
        self._client: Optional[APIClient] = None
        self._api_key: Optional[str] = None

    @property
    def config(self) -> APIProviderConfig:
        """Get provider configuration."""
        return self._config

    def _get_api_key(self) -> str:
        """
        Get API key from settings.

        Returns:
            API key string

        Raises:
            AuthenticationError: If API key is not configured
        """
        from settings_service import settings_service

        key = settings_service.get_api_key(self._config.api_key_name)
        if not key:
            raise AuthenticationError(
                self._config.provider_name,
                f"{self._config.provider_name} API key not configured. "
                f"Set '{self._config.api_key_name}' in Settings > API Keys."
            )
        return key

    def _get_auth_header(self, api_key: str) -> Dict[str, str]:
        """
        Build authentication header.

        Override this method for non-Bearer auth schemes.

        Common patterns:
        - Bearer token: {"Authorization": "Bearer {key}"}
        - API key header: {"x-api-key": "{key}"} or {"xi-api-key": "{key}"}
        - Query param: Override the request method instead

        Args:
            api_key: The API key

        Returns:
            Dict of headers to include in requests
        """
        return {"Authorization": f"Bearer {api_key}"}

    def _create_client(self) -> APIClient:
        """
        Create HTTP client instance.

        Override this method to customize client configuration.
        """
        client_config = APIClientConfig(
            base_url=self._config.base_url,
            provider_name=self._config.provider_name,
            timeout=self._config.timeout,
            max_retries=self._config.max_retries
        )
        return APIClient(client_config, self._get_auth_header(self._api_key))

    def _ensure_client(self) -> APIClient:
        """Ensure HTTP client is initialized."""
        if self._client is None:
            self._api_key = self._get_api_key()
            self._client = self._create_client()
        return self._client

    @property
    def client(self) -> APIClient:
        """
        Get initialized HTTP client.

        The client is created lazily on first access, which triggers
        API key validation.
        """
        return self._ensure_client()

    def validate_api_key(self) -> bool:
        """
        Check if API key is configured.

        Returns:
            True if API key exists, False otherwise
        """
        try:
            self._get_api_key()
            return True
        except AuthenticationError:
            return False

    def reset_client(self) -> None:
        """
        Reset client to force re-initialization.

        Useful when API key has been updated in settings.
        """
        self._client = None
        self._api_key = None


class OpenAICompatibleProvider(BaseAPIProvider):
    """
    Base class for OpenAI-compatible API providers.

    Many providers (DeepSeek, Groq, Together, etc.) use OpenAI-compatible
    endpoints. This class provides common functionality for chat completions.
    """

    def _chat_completion(
        self,
        messages: list,
        model: str,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Make a chat completion request.

        Args:
            messages: List of message dicts with role and content
            model: Model identifier
            temperature: Sampling temperature
            max_tokens: Maximum tokens to generate
            **kwargs: Additional parameters for the API

        Returns:
            Parsed response dict
        """
        payload = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            **kwargs
        }

        if max_tokens:
            payload["max_tokens"] = max_tokens

        response = self.client.post("/v1/chat/completions", json=payload)
        return response.json()

    def _extract_content(self, response: Dict[str, Any]) -> str:
        """
        Extract content from chat completion response.

        Args:
            response: API response dict

        Returns:
            Generated text content
        """
        choices = response.get("choices", [])
        if not choices:
            return ""
        return choices[0].get("message", {}).get("content", "")
