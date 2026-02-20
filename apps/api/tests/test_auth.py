import jwt
import pytest
from unittest.mock import patch, MagicMock

from app.auth import AuthUser, get_current_user, check_usage, PLAN_LIMITS
from app.config import settings
from fastapi import HTTPException


JWT_SECRET = "test-secret"


class FakeCreds:
    def __init__(self, token):
        self.credentials = token
        self.scheme = "Bearer"


@pytest.fixture(autouse=True)
def _no_remote_auth_lookup():
    with patch("app.auth._fetch_user_payload_from_supabase", return_value=None):
        yield


def test_valid_jwt():
    token = jwt.encode({"sub": "uid-1", "email": "a@b.com"}, JWT_SECRET, algorithm="HS256")
    with patch("app.auth.get_supabase_or_none", return_value=None):
        user = get_current_user(FakeCreds(token))
    assert user.user_id == "uid-1"
    assert user.email == "a@b.com"
    assert user.plan == "free"


def test_missing_token():
    with pytest.raises(HTTPException) as exc_info:
        get_current_user(None)
    assert exc_info.value.status_code == 401


def test_invalid_token():
    with pytest.raises(HTTPException) as exc_info:
        get_current_user(FakeCreds("bad-token"))
    assert exc_info.value.status_code == 401


def test_invalid_token_uses_supabase_fallback():
    with patch("app.auth._fetch_user_payload_from_supabase", return_value={"sub": "uid-fallback", "email": "fb@test.com"}):
        with patch("app.auth.get_supabase_or_none", return_value=None):
            user = get_current_user(FakeCreds("bad-token"))
    assert user.user_id == "uid-fallback"
    assert user.email == "fb@test.com"
    assert user.plan == "free"


def test_expired_token():
    token = jwt.encode({"sub": "uid-1", "exp": 0}, JWT_SECRET, algorithm="HS256")
    with pytest.raises(HTTPException) as exc_info:
        get_current_user(FakeCreds(token))
    assert exc_info.value.status_code == 401


def test_no_sub_in_token():
    token = jwt.encode({"email": "a@b.com"}, JWT_SECRET, algorithm="HS256")
    with pytest.raises(HTTPException) as exc_info:
        with patch("app.auth.get_supabase_or_none", return_value=None):
            get_current_user(FakeCreds(token))
    assert exc_info.value.status_code == 401


def test_auth_disabled():
    with patch.object(settings, "auth_disabled", True):
        user = get_current_user(None)
        assert user.user_id == "00000000-0000-0000-0000-000000000000"


def test_plan_lookup_from_db():
    token = jwt.encode({"sub": "uid-2"}, JWT_SECRET, algorithm="HS256")

    # Build mock chain for profiles table
    mock_db = MagicMock()
    profiles_chain = MagicMock()
    profiles_chain.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(data={"plan": "pro"})

    usage_chain = MagicMock()
    usage_chain.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(data={"stt_seconds": 100})

    def table_dispatch(name):
        if name == "profiles":
            return profiles_chain
        return usage_chain

    mock_db.table = table_dispatch

    with patch("app.auth.get_supabase_or_none", return_value=mock_db):
        user = get_current_user(FakeCreds(token))
    assert user.plan == "pro"
    assert user.usage == {"stt_seconds": 100}


def test_plan_lookup_from_db_normalizes_case_and_spaces():
    token = jwt.encode({"sub": "uid-3"}, JWT_SECRET, algorithm="HS256")

    mock_db = MagicMock()
    profiles_chain = MagicMock()
    profiles_chain.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(data={"plan": " BASIC "})

    usage_chain = MagicMock()
    usage_chain.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(data={})

    def table_dispatch(name):
        if name == "profiles":
            return profiles_chain
        return usage_chain

    mock_db.table = table_dispatch

    with patch("app.auth.get_supabase_or_none", return_value=mock_db):
        user = get_current_user(FakeCreds(token))
    assert user.plan == "basic"


def test_plan_lookup_from_db_falls_back_to_free_on_unknown_plan():
    token = jwt.encode({"sub": "uid-4"}, JWT_SECRET, algorithm="HS256")

    mock_db = MagicMock()
    profiles_chain = MagicMock()
    profiles_chain.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(data={"plan": "enterprise"})

    usage_chain = MagicMock()
    usage_chain.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(data={})

    def table_dispatch(name):
        if name == "profiles":
            return profiles_chain
        return usage_chain

    mock_db.table = table_dispatch

    with patch("app.auth.get_supabase_or_none", return_value=mock_db):
        user = get_current_user(FakeCreds(token))
    assert user.plan == "free"


def test_check_usage_within_limit():
    user = AuthUser(user_id="u1", plan="free", usage={"stt_seconds": 100})
    check_usage(user, "stt_seconds", 100)  # should not raise


def test_check_usage_exceeds_limit():
    user = AuthUser(user_id="u1", plan="free", usage={"stt_seconds": 1800})
    with pytest.raises(HTTPException) as exc_info:
        check_usage(user, "stt_seconds", 1)
    assert exc_info.value.status_code == 429
    assert exc_info.value.headers["X-Whisperall-Error-Code"] == "PLAN_LIMIT_EXCEEDED"
    assert exc_info.value.headers["X-Whisperall-Resource"] == "stt_seconds"
    assert exc_info.value.headers["X-Whisperall-Current"] == "1800"
    assert exc_info.value.headers["X-Whisperall-Limit"] == "1800"
    assert exc_info.value.headers["X-Whisperall-Plan"] == "free"
    assert int(exc_info.value.headers["Retry-After"]) >= 1


def test_check_usage_bypass_in_dev_when_disabled_flag_enabled():
    user = AuthUser(user_id="u1", plan="free", usage={"stt_seconds": 1800})
    with patch.object(settings, "usage_limits_disabled", True), patch.object(settings, "env", "dev"):
        check_usage(user, "stt_seconds", 1)  # should not raise


def test_check_usage_does_not_bypass_in_prod():
    user = AuthUser(user_id="u1", plan="free", usage={"stt_seconds": 1800})
    with patch.object(settings, "usage_limits_disabled", True), patch.object(settings, "env", "prod"):
        with pytest.raises(HTTPException) as exc_info:
            check_usage(user, "stt_seconds", 1)
    assert exc_info.value.status_code == 429


def test_plan_limits_structure():
    for plan in ("free", "basic", "pro"):
        limits = PLAN_LIMITS[plan]
        assert "stt_seconds" in limits
        assert "tts_chars" in limits
        assert "translate_chars" in limits
        assert "transcribe_seconds" in limits
        assert "ai_edit_tokens" in limits
        assert "notes_count" in limits
        assert "storage_bytes" in limits
