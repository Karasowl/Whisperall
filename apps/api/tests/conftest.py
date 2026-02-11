import jwt
import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app, asgi_app


JWT_SECRET = "test-secret"
TEST_USER_ID = "user-123"
TEST_EMAIL = "test@example.com"


@pytest.fixture(autouse=True)
def _patch_settings():
    """Patch the singleton settings for all tests. Also mock DB in auth to avoid real Supabase queries."""
    with patch.object(settings, "supabase_jwt_secret", JWT_SECRET), \
         patch.object(settings, "auth_disabled", False), \
         patch("app.auth.get_supabase_or_none", return_value=None):
        yield


@pytest.fixture
def client():
    # Use the runtime ASGI wrapper so tests exercise CORS behavior seen in dev/prod.
    return TestClient(asgi_app)


def make_token(user_id: str = TEST_USER_ID, email: str = TEST_EMAIL) -> str:
    return jwt.encode({"sub": user_id, "email": email}, JWT_SECRET, algorithm="HS256")


@pytest.fixture
def auth_headers():
    return {"Authorization": f"Bearer {make_token()}"}


# ── Provider mocks ────────────────────────────────────────
# Patch at the router module level where imports happen

@pytest.fixture
def mock_openai_stt():
    with patch("app.routers.dictate.openai_stt.transcribe", new_callable=AsyncMock) as m:
        m.return_value = "hello world"
        yield m


@pytest.fixture
def mock_deepgram():
    """Legacy alias — kept for backward compat. Now mocks openai_stt.diarize."""
    with patch("app.routers.live.openai_stt.diarize", new_callable=AsyncMock) as m:
        m.return_value = "live text"
        yield m


@pytest.fixture
def mock_deepl_in_live():
    with patch("app.routers.live.deepl.translate", new_callable=AsyncMock) as m:
        m.return_value = "texto traducido"
        yield m


@pytest.fixture
def mock_deepl():
    with patch("app.routers.translate.deepl.translate", new_callable=AsyncMock) as m:
        m.return_value = "texto traducido"
        yield m


@pytest.fixture
def mock_groq():
    with patch("app.routers.transcribe.groq_stt.transcribe_chunk", new_callable=AsyncMock) as m:
        m.return_value = "groq transcribed"
        yield m


@pytest.fixture
def mock_google_tts():
    with patch("app.routers.tts.google_tts.synthesize", new_callable=AsyncMock) as m:
        m.return_value = "https://storage.example.com/audio.mp3"
        yield m


@pytest.fixture
def mock_openai_llm():
    with patch("app.routers.ai_edit.openai_llm.edit_text", new_callable=AsyncMock) as m:
        m.return_value = "cleaned text"
        yield m


@pytest.fixture
def mock_db():
    """Mock get_supabase_or_none to return None (no DB in tests)."""
    with patch("app.routers.live.get_supabase_or_none", return_value=None), \
         patch("app.routers.transcribe._require_db") as mock_req:
        mock_req.side_effect = lambda: (_ for _ in ()).throw(
            __import__("fastapi").HTTPException(status_code=503, detail="Database not configured")
        )
        yield
