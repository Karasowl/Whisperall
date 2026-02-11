import pytest

from app.auth import AuthUser, PLAN_LIMITS, get_current_user
from app.main import app


@pytest.fixture(autouse=True)
def _cleanup_overrides():
    yield
    app.dependency_overrides.clear()


def test_401_error_envelope_and_request_id_passthrough(client):
    req_id = "req-test-401"
    res = client.get("/v1/usage", headers={"X-Request-Id": req_id})
    assert res.status_code == 401
    body = res.json()
    assert body["detail"] == "Missing bearer token"
    assert body["error"]["code"] == "UNAUTHORIZED"
    assert body["error"]["request_id"] == req_id
    assert res.headers.get("x-request-id") == req_id


def test_429_error_envelope_preserves_plan_limit_code(client, auth_headers):
    limit = PLAN_LIMITS["free"]["stt_seconds"]
    app.dependency_overrides[get_current_user] = lambda: AuthUser(
        user_id="user-429",
        plan="free",
        usage={"stt_seconds": limit},
    )
    res = client.post(
        "/v1/dictate",
        headers=auth_headers,
        files={"audio": ("a.wav", b"x" * 100, "audio/wav")},
    )
    assert res.status_code == 429
    body = res.json()
    assert "Plan limit exceeded for stt_seconds" in body["detail"]
    assert body["error"]["code"] == "PLAN_LIMIT_EXCEEDED"
    assert body["error"]["request_id"] == res.headers.get("x-request-id")
    assert res.headers.get("x-whisperall-error-code") == "PLAN_LIMIT_EXCEEDED"


def test_422_validation_error_uses_standard_envelope(client, auth_headers):
    res = client.post("/v1/transcribe/jobs", json={"total_chunks": 0}, headers=auth_headers)
    assert res.status_code == 422
    body = res.json()
    assert isinstance(body["detail"], list)
    assert body["error"]["code"] == "VALIDATION_ERROR"
    assert body["error"]["request_id"] == res.headers.get("x-request-id")


def test_transcribe_specific_error_code_is_propagated_in_envelope(client, auth_headers):
    req_id = "req-transcribe-404"
    res = client.get(
        "/v1/transcribe/jobs/missing-job",
        headers={**auth_headers, "X-Request-Id": req_id},
    )
    assert res.status_code == 404
    body = res.json()
    assert body["detail"] == "Transcription job not found"
    assert body["error"]["code"] == "TRANSCRIBE_JOB_NOT_FOUND"
    assert body["error"]["request_id"] == req_id
    assert res.headers.get("x-whisperall-error-code") == "TRANSCRIBE_JOB_NOT_FOUND"
