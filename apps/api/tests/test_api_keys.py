import hashlib
import pytest
from unittest.mock import patch, MagicMock

from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.auth import get_current_user, AuthUser, API_KEY_PREFIX
from app.main import app


# ── Fixtures ─────────────────────────────────────────────────

FAKE_USER = AuthUser(user_id="uid-1", email="test@example.com", plan="free")


class FakeCreds:
    def __init__(self, token):
        self.credentials = token
        self.scheme = "Bearer"


@pytest.fixture()
def client():
    app.dependency_overrides[get_current_user] = lambda: FAKE_USER
    c = TestClient(app)
    yield c
    app.dependency_overrides.clear()


@pytest.fixture()
def mock_db():
    db = MagicMock()
    with patch("app.routers.api_keys.get_supabase_or_none", return_value=db):
        yield db


# ── POST /v1/auth/api-keys ───────────────────────────────────

def test_create_api_key(client, mock_db):
    mock_db.table.return_value.select.return_value.eq.return_value.is_.return_value.execute.return_value.data = []
    mock_db.table.return_value.insert.return_value.execute.return_value.data = [{
        "id": "key-id-1",
        "name": "Test Key",
        "key_prefix": "wsp_live_abcdef12",
        "created_at": "2026-02-12T00:00:00Z",
    }]

    res = client.post("/v1/auth/api-keys", json={"name": "Test Key"})
    assert res.status_code == 201
    data = res.json()
    assert data["name"] == "Test Key"
    assert data["key"].startswith("wsp_live_")
    assert len(data["key"]) == len("wsp_live_") + 64  # prefix + 32 hex bytes


def test_create_api_key_max_limit(client, mock_db):
    mock_db.table.return_value.select.return_value.eq.return_value.is_.return_value.execute.return_value.data = [
        {"id": f"k{i}"} for i in range(5)
    ]

    res = client.post("/v1/auth/api-keys", json={"name": "Too many"})
    assert res.status_code == 400
    assert "Maximum" in res.json()["detail"]


# ── GET /v1/auth/api-keys ────────────────────────────────────

def test_list_api_keys(client, mock_db):
    mock_db.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value.data = [
        {"id": "k1", "name": "Key 1", "key_prefix": "wsp_live_abc12345", "created_at": "2026-02-01", "last_used_at": None, "revoked_at": None},
        {"id": "k2", "name": "Key 2", "key_prefix": "wsp_live_def67890", "created_at": "2026-02-02", "last_used_at": "2026-02-10", "revoked_at": None},
    ]

    res = client.get("/v1/auth/api-keys")
    assert res.status_code == 200
    data = res.json()
    assert len(data) == 2
    assert data[0]["name"] == "Key 1"
    assert "key" not in data[0]  # full key never returned in list


# ── DELETE /v1/auth/api-keys/{id} ────────────────────────────

def test_revoke_api_key(client, mock_db):
    mock_db.table.return_value.update.return_value.eq.return_value.eq.return_value.is_.return_value.execute.return_value.data = [
        {"id": "k1", "revoked_at": "2026-02-12T00:00:00Z"}
    ]

    res = client.delete("/v1/auth/api-keys/k1")
    assert res.status_code == 200
    assert res.json()["status"] == "revoked"


def test_revoke_nonexistent_key(client, mock_db):
    mock_db.table.return_value.update.return_value.eq.return_value.eq.return_value.is_.return_value.execute.return_value.data = []

    res = client.delete("/v1/auth/api-keys/nonexistent")
    assert res.status_code == 404


# ── Auth middleware: API key validation ──────────────────────

@pytest.fixture(autouse=True)
def _no_remote_auth_lookup():
    with patch("app.auth._fetch_user_payload_from_supabase", return_value=None):
        yield


def test_api_key_auth_valid():
    fake_key = "wsp_live_" + "a" * 64
    key_hash = hashlib.sha256(fake_key.encode()).hexdigest()

    mock_db = MagicMock()
    # api_keys lookup
    mock_db.table.return_value.select.return_value.eq.return_value.is_.return_value.maybe_single.return_value.execute.return_value.data = {
        "user_id": "uid-apikey"
    }
    # last_used_at update
    mock_db.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock()
    # profile lookup
    profile_chain = MagicMock()
    profile_chain.maybe_single.return_value.execute.return_value.data = {"plan": "pro"}
    # usage lookup
    usage_chain = MagicMock()
    usage_chain.maybe_single.return_value.execute.return_value.data = {"stt_seconds": 100}

    def table_router(name):
        if name == "api_keys":
            return mock_db.table.return_value
        mock_table = MagicMock()
        if name == "profiles":
            mock_table.select.return_value.eq.return_value = profile_chain
        elif name == "usage":
            mock_table.select.return_value.eq.return_value.eq.return_value = usage_chain
        return mock_table

    with patch("app.auth.get_supabase_or_none") as mock_get_db:
        db_instance = MagicMock()
        db_instance.table.side_effect = table_router
        # Copy the api_keys table return value
        db_instance.table.return_value = mock_db.table.return_value
        mock_get_db.return_value = db_instance

        user = get_current_user(FakeCreds(fake_key))

    assert user.user_id == "uid-apikey"


def test_api_key_auth_revoked():
    fake_key = "wsp_live_" + "b" * 64

    mock_db = MagicMock()
    mock_db.table.return_value.select.return_value.eq.return_value.is_.return_value.maybe_single.return_value.execute.return_value.data = None

    with patch("app.auth.get_supabase_or_none", return_value=mock_db):
        with pytest.raises(HTTPException) as exc_info:
            get_current_user(FakeCreds(fake_key))
    assert exc_info.value.status_code == 401


def test_api_key_auth_no_db():
    fake_key = "wsp_live_" + "c" * 64

    with patch("app.auth.get_supabase_or_none", return_value=None):
        with pytest.raises(HTTPException) as exc_info:
            get_current_user(FakeCreds(fake_key))
    assert exc_info.value.status_code == 401
