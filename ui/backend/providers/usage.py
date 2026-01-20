"""Helper utilities for provider usage / quota reporting."""

from __future__ import annotations

from typing import Any, Dict, Optional


class ProviderUsageError(Exception):
    """Raised when usage metadata cannot be fetched."""

    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.status_code = status_code


def resolve_tts_provider_usage(provider_id: str) -> Optional[Dict[str, Any]]:
    """Return usage data for supported TTS providers."""
    provider_id = provider_id.lower()
    if provider_id == "elevenlabs":
        return _get_elevenlabs_usage()
    return None


def _get_elevenlabs_usage() -> Dict[str, Any]:
    """Query ElevenLabs user/subscription data."""
    try:
        from settings_service import settings_service
    except ImportError as exc:  # pragma: no cover - rare
        raise ProviderUsageError(f"Could not load settings: {exc}", status_code=500)

    api_key = settings_service.get_api_key("elevenlabs")
    if not api_key:
        raise ProviderUsageError("ElevenLabs API key not configured", status_code=400)

    try:
        from elevenlabs import ElevenLabs
    except ImportError:
        raise ProviderUsageError("ElevenLabs SDK not installed. Run: pip install elevenlabs", status_code=500)

    try:
        client = ElevenLabs(api_key=api_key)
        user = client.user.get()
    except Exception as exc:
        raise ProviderUsageError(f"Failed to fetch ElevenLabs usage: {exc}", status_code=500)

    subscription = getattr(user, "subscription", None)
    if not subscription:
        raise ProviderUsageError("ElevenLabs response missing subscription info", status_code=500)

    character_limit = getattr(subscription, "character_limit", None)
    character_count = getattr(subscription, "character_count", None)
    remaining = _calculate_remaining(character_limit, character_count)

    return {
        "tier": getattr(subscription, "tier", None),
        "status": getattr(subscription, "status", None),
        "currency": getattr(subscription, "currency", None),
        "billing_period": getattr(subscription, "billing_period", None),
        "character_refresh_period": getattr(subscription, "character_refresh_period", None),
        "character_count": character_count,
        "character_limit": character_limit,
        "characters_remaining": remaining,
        "next_character_count_reset_unix": getattr(subscription, "next_character_count_reset_unix", None),
        "voice_slots_used": getattr(subscription, "voice_slots_used", None),
        "voice_limit": getattr(subscription, "voice_limit", None),
        "voice_add_edit_counter": getattr(subscription, "voice_add_edit_counter", None),
        "can_use_instant_voice_cloning": getattr(subscription, "can_use_instant_voice_cloning", None),
        "can_use_professional_voice_cloning": getattr(subscription, "can_use_professional_voice_cloning", None),
    }


def _calculate_remaining(limit: Optional[int], used: Optional[int]) -> Optional[int]:
    if limit is None or used is None:
        return None
    try:
        return max(limit - used, 0)
    except TypeError:
        return None
