from unittest.mock import patch


def test_create_job_requires_auth(client):
    res = client.post("/v1/transcribe/jobs", json={"total_chunks": 2})
    assert res.status_code == 401


def test_create_job_no_db_returns_503(client, auth_headers):
    """Without Supabase configured, transcribe endpoints return 503."""
    with patch("app.routers.transcribe.get_supabase_or_none", return_value=None):
        res = client.post("/v1/transcribe/jobs", json={"total_chunks": 2}, headers=auth_headers)
    assert res.status_code == 503


def test_get_job_requires_auth(client):
    res = client.get("/v1/transcribe/jobs/fake-id")
    assert res.status_code == 401
