"""Test that routers enforce plan usage limits and call increment_usage."""
import pytest
from unittest.mock import patch, MagicMock, AsyncMock

from app.main import app
from app.auth import get_current_user, AuthUser, PLAN_LIMITS


def _make_user_at_limit(resource: str):
    """Create an AuthUser whose usage is exactly at the free plan limit."""
    limit = PLAN_LIMITS["free"][resource]
    return AuthUser(user_id="user-123", plan="free", usage={resource: limit})


def _override_user(user: AuthUser):
    """Override FastAPI's get_current_user dependency."""
    app.dependency_overrides[get_current_user] = lambda: user


@pytest.fixture(autouse=True)
def _cleanup_overrides():
    yield
    app.dependency_overrides.clear()


class TestDictateUsage:
    def test_rejects_when_stt_limit_exceeded(self, client):
        _override_user(_make_user_at_limit("stt_seconds"))
        res = client.post("/v1/dictate", files={"audio": ("a.wav", b"x" * 100, "audio/wav")})
        assert res.status_code == 429

    def test_increments_usage_on_success(self, client):
        _override_user(AuthUser(user_id="user-123", plan="free", usage={"stt_seconds": 0}))
        mock_db = MagicMock()
        mock_db.rpc.return_value.execute.return_value = MagicMock()
        mock_db.table.return_value.insert.return_value.execute.return_value = MagicMock()

        with patch("app.routers.dictate.openai_stt.transcribe", new_callable=AsyncMock, return_value="text"), \
             patch("app.routers.dictate.get_supabase_or_none", return_value=mock_db):
            res = client.post("/v1/dictate", files={"audio": ("a.wav", b"x" * 100, "audio/wav")})

        assert res.status_code == 200
        mock_db.rpc.assert_called_once()
        args = mock_db.rpc.call_args[0]
        assert args[0] == "increment_usage"
        assert args[1]["p_stt_seconds"] >= 1

    def test_logs_history_on_success(self, client):
        _override_user(AuthUser(user_id="user-123", plan="free", usage={}))
        mock_db = MagicMock()
        mock_db.rpc.return_value.execute.return_value = MagicMock()
        mock_db.table.return_value.insert.return_value.execute.return_value = MagicMock()

        with patch("app.routers.dictate.openai_stt.transcribe", new_callable=AsyncMock, return_value="text"), \
             patch("app.routers.dictate.get_supabase_or_none", return_value=mock_db):
            client.post("/v1/dictate", files={"audio": ("a.wav", b"x" * 100, "audio/wav")})

        history_calls = [c for c in mock_db.table.call_args_list if c[0][0] == "history"]
        assert len(history_calls) >= 1


class TestLiveUsage:
    def test_rejects_when_stt_limit_exceeded(self, client):
        _override_user(_make_user_at_limit("stt_seconds"))
        res = client.post("/v1/live/chunk", files={"audio": ("a.wav", b"x" * 100, "audio/wav")})
        assert res.status_code == 429

    def test_rejects_when_translate_limit_exceeded(self, client):
        _override_user(_make_user_at_limit("translate_chars"))
        with patch("app.routers.live.openai_stt.diarize", new_callable=AsyncMock, return_value=[{"speaker": "A", "text": "text"}]), \
             patch("app.routers.live.get_supabase_or_none", return_value=None):
            res = client.post(
                "/v1/live/chunk",
                files={"audio": ("a.wav", b"x" * 100, "audio/wav")},
                data={"translate_to": "ES"},
            )
        assert res.status_code == 429


class TestTtsUsage:
    def test_rejects_when_tts_limit_exceeded(self, client):
        _override_user(_make_user_at_limit("tts_chars"))
        res = client.post("/v1/tts", json={"text": "hello"})
        assert res.status_code == 429

    def test_increments_usage_on_success(self, client):
        _override_user(AuthUser(user_id="user-123", plan="free", usage={"tts_chars": 0}))
        mock_db = MagicMock()
        mock_db.rpc.return_value.execute.return_value = MagicMock()
        mock_db.table.return_value.insert.return_value.execute.return_value = MagicMock()

        with patch("app.routers.tts.google_tts.synthesize", new_callable=AsyncMock, return_value="https://x.mp3"), \
             patch("app.routers.tts.get_supabase_or_none", return_value=mock_db):
            res = client.post("/v1/tts", json={"text": "hello world"})

        assert res.status_code == 200
        args = mock_db.rpc.call_args[0]
        assert args[0] == "increment_usage"
        assert args[1]["p_tts_chars"] == len("hello world")


class TestTranslateUsage:
    def test_rejects_when_translate_limit_exceeded(self, client):
        _override_user(_make_user_at_limit("translate_chars"))
        res = client.post("/v1/translate", json={"text": "hello", "target_language": "ES"})
        assert res.status_code == 429

    def test_increments_usage_on_success(self, client):
        _override_user(AuthUser(user_id="user-123", plan="free", usage={"translate_chars": 0}))
        mock_db = MagicMock()
        mock_db.rpc.return_value.execute.return_value = MagicMock()
        mock_db.table.return_value.insert.return_value.execute.return_value = MagicMock()

        with patch("app.routers.translate.deepl.translate", new_callable=AsyncMock, return_value="hola"), \
             patch("app.routers.translate.get_supabase_or_none", return_value=mock_db):
            res = client.post("/v1/translate", json={"text": "hello", "target_language": "ES"})

        assert res.status_code == 200
        args = mock_db.rpc.call_args[0]
        assert args[1]["p_translate_chars"] == len("hello")


class TestAiEditUsage:
    def test_rejects_when_ai_edit_limit_exceeded(self, client):
        _override_user(_make_user_at_limit("ai_edit_tokens"))
        res = client.post("/v1/ai-edit", json={"text": "um hello"})
        assert res.status_code == 429

    def test_increments_usage_on_success(self, client):
        _override_user(AuthUser(user_id="user-123", plan="free", usage={"ai_edit_tokens": 0}))
        mock_db = MagicMock()
        mock_db.rpc.return_value.execute.return_value = MagicMock()
        mock_db.table.return_value.insert.return_value.execute.return_value = MagicMock()

        with patch("app.routers.ai_edit.openai_llm.edit_text", new_callable=AsyncMock, return_value="clean"), \
             patch("app.routers.ai_edit.get_supabase_or_none", return_value=mock_db):
            res = client.post("/v1/ai-edit", json={"text": "um hello"})

        assert res.status_code == 200
        args = mock_db.rpc.call_args[0]
        assert args[1]["p_ai_edit_tokens"] >= 1
