"""
AI Edit service supporting local Ollama and cloud APIs.

Uses unified providers from providers/ai/ with automatic error handling,
retry logic, and structured diagnostics.
"""

from __future__ import annotations

from typing import Optional, Tuple, Dict, Any

from settings_service import settings_service

# Diagnostics
from diagnostics import log_function, error_context, log_info, log_error
from diagnostics.error_codes import ErrorCode

# Unified provider registry
from providers.ai.registry import get_provider, list_providers

# Core exceptions for better error handling
from core.http_client import AuthenticationError, RateLimitError, HTTPError


class AIEditService:
    """
    AI Edit service using unified provider architecture.

    All API providers use BaseAPIProvider with:
    - Automatic retry with exponential backoff
    - Typed exceptions (AuthenticationError, RateLimitError, etc.)
    - Consistent error messages
    - Lazy API key validation
    """

    def _edit_with_provider(self, provider_id: str, text: str, command: str) -> Tuple[str, Dict[str, Any]]:
        """
        Execute edit using a unified provider.

        Args:
            provider_id: Provider ID (openai, claude, deepinfra, etc.)
            text: Text to edit
            command: Edit instruction

        Returns:
            Tuple of (edited_text, metadata)

        Raises:
            AuthenticationError: API key not configured or invalid
            RateLimitError: Rate limit exceeded
            HTTPError: Other API errors
        """
        provider = get_provider(provider_id)
        return provider.edit(text, command)

    @log_function(module="ai_edit", error_code=ErrorCode.AI_EDIT_FAILED)
    def edit(self, text: str, command: str, provider: Optional[str] = None) -> Tuple[str, Dict[str, Any]]:
        """
        Edit text using AI provider.

        Args:
            text: Text to edit
            command: Edit instruction (e.g., "fix grammar", "make formal")
            provider: Provider ID, or None to use default from settings

        Returns:
            Tuple of (edited_text, metadata_dict)
        """
        provider_id = provider or settings_service.get_selected_provider("ai_edit")

        with error_context(provider=provider_id, command=command, text_length=len(text)):
            log_info("ai_edit", "edit", f"Starting AI edit with provider {provider_id}")

            # Check if provider is registered
            available = list_providers()
            if provider_id not in available:
                log_error(
                    "ai_edit", "edit",
                    f"AI provider not supported: {provider_id}. Available: {available}",
                    error_code=ErrorCode.AI_PROVIDER_UNAVAILABLE
                )
                raise RuntimeError(f"AI provider not supported: {provider_id}. Available: {', '.join(available)}")

            try:
                return self._edit_with_provider(provider_id, text, command)
            except AuthenticationError as e:
                # Convert to user-friendly message
                log_error("ai_edit", "edit", str(e), error_code=ErrorCode.AI_API_KEY_INVALID, exception=e)
                raise RuntimeError(str(e)) from e
            except RateLimitError as e:
                log_error("ai_edit", "edit", str(e), error_code=ErrorCode.AI_RATE_LIMITED, exception=e)
                raise RuntimeError(f"Rate limit exceeded for {provider_id}. Please wait and try again.") from e
            except HTTPError as e:
                log_error("ai_edit", "edit", str(e), error_code=ErrorCode.AI_EDIT_FAILED, exception=e)
                raise RuntimeError(f"{provider_id} API error: {e.message}") from e


_service: Optional[AIEditService] = None


def get_ai_edit_service() -> AIEditService:
    global _service
    if _service is None:
        _service = AIEditService()
    return _service
