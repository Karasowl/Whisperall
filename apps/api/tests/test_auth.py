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
        assert user.user_id == "dev-user"


def test_plan_lookup_from_db():
    token = jwt.encode({"sub": "uid-2"}, JWT_SECRET, algorithm="HS256")

    # Build mock chain for profiles table
    mock_db = MagicMock()
    profiles_chain = MagicMock()
    profiles_chain.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(data={"plan": "pro"})

    usage_chain = MagicMock()
    usage_chain.select.return_value.eq.return_value.order.return_value.limit.return_value.maybe_single.return_value.execute.return_value = MagicMock(data={"stt_seconds": 100})

    def table_dispatch(name):
        if name == "profiles":
            return profiles_chain
        return usage_chain

    mock_db.table = table_dispatch

    with patch("app.auth.get_supabase_or_none", return_value=mock_db):
        user = get_current_user(FakeCreds(token))
    assert user.plan == "pro"
    assert user.usage == {"stt_seconds": 100}


def test_check_usage_within_limit():
    user = AuthUser(user_id="u1", plan="free", usage={"stt_seconds": 100})
    check_usage(user, "stt_seconds", 100)  # should not raise


def test_check_usage_exceeds_limit():
    user = AuthUser(user_id="u1", plan="free", usage={"stt_seconds": 1800})
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
