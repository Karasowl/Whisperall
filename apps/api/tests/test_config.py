from unittest.mock import patch

import pytest

from app.config import settings


def test_get_cors_origins_defaults_for_dev():
    with patch.object(settings, "env", "dev"), patch.object(settings, "cors_origins", None):
        origins = settings.get_cors_origins()
    assert "http://localhost:5173" in origins
    assert "http://127.0.0.1:5173" in origins
    assert "https://whisperall.com" in origins


def test_get_cors_origins_defaults_for_prod():
    with patch.object(settings, "env", "prod"), patch.object(settings, "cors_origins", None):
        origins = settings.get_cors_origins()
    assert origins == ["https://whisperall.com", "https://www.whisperall.com"]


def test_get_cors_origins_parses_and_deduplicates_csv():
    with patch.object(settings, "env", "dev"), patch.object(
        settings,
        "cors_origins",
        "https://a.example.com/, https://b.example.com, https://a.example.com ",
    ):
        origins = settings.get_cors_origins()
    assert origins == ["https://a.example.com", "https://b.example.com"]


def test_get_cors_origin_regex_defaults_for_dev():
    with patch.object(settings, "env", "dev"), patch.object(settings, "cors_origin_regex", None):
        regex = settings.get_cors_origin_regex()
    assert regex is not None
    assert "localhost" in regex
    assert "127\\.0\\.0\\.1" in regex


def test_get_cors_origin_regex_defaults_for_prod():
    with patch.object(settings, "env", "prod"), patch.object(settings, "cors_origin_regex", None):
        regex = settings.get_cors_origin_regex()
    assert regex is None


def test_get_cors_origin_regex_uses_explicit_value():
    with patch.object(settings, "env", "dev"), patch.object(settings, "cors_origin_regex", "^https://custom.example.com$"):
        regex = settings.get_cors_origin_regex()
    assert regex == "^https://custom.example.com$"


def test_validate_runtime_flags_rejects_auth_disabled_in_prod():
    with patch.object(settings, "env", "prod"), patch.object(settings, "auth_disabled", True):
        with pytest.raises(RuntimeError, match="AUTH_DISABLED cannot be true in prod"):
            settings.validate_runtime_flags()


def test_validate_runtime_flags_rejects_missing_jwt_secret_in_prod():
    with patch.object(settings, "env", "prod"), patch.object(settings, "auth_disabled", False), patch.object(
        settings, "supabase_jwt_secret", None
    ):
        with pytest.raises(RuntimeError, match="SUPABASE_JWT_SECRET is required in prod"):
            settings.validate_runtime_flags()
