from unittest.mock import patch, MagicMock, AsyncMock

from app.config import settings
from fastapi import HTTPException
import httpx


def test_create_job_requires_auth(client):
    res = client.post("/v1/transcribe/jobs", json={"total_chunks": 2})
    assert res.status_code == 401


def test_create_job_no_db_returns_503(client, auth_headers):
    """Without Supabase configured, transcribe endpoints return 503."""
    with patch("app.routers.transcribe.get_supabase_or_none", return_value=None):
        res = client.post("/v1/transcribe/jobs", json={"total_chunks": 2}, headers=auth_headers)
    assert res.status_code == 503
    assert res.headers.get("x-whisperall-error-code") == "TRANSCRIBE_DB_UNAVAILABLE"
    assert res.json()["error"]["code"] == "TRANSCRIBE_DB_UNAVAILABLE"


def test_get_job_requires_auth(client):
    res = client.get("/v1/transcribe/jobs/fake-id")
    assert res.status_code == 401


def test_create_job_with_diarization_requires_deepgram_key(client, auth_headers):
    with patch.object(settings, "deepgram_api_key", None):
        res = client.post(
            "/v1/transcribe/jobs",
            json={"total_chunks": 1, "enable_diarization": True},
            headers=auth_headers,
        )
    assert res.status_code == 400
    assert "DEEPGRAM_API_KEY" in res.json()["detail"]
    assert res.headers.get("x-whisperall-error-code") == "DIARIZATION_NOT_CONFIGURED"
    assert res.json()["error"]["code"] == "DIARIZATION_NOT_CONFIGURED"


def test_run_job_sets_paused_status_on_plan_limit(client, auth_headers):
    job_id = "job-limit-1"
    user_id = "user-123"
    job_row = {
        "id": job_id,
        "user_id": user_id,
        "status": "pending",
        "processed_chunks": 0,
        "total_chunks": 3,
        "enable_diarization": False,
        "language": None,
    }

    jobs_table = MagicMock()
    jobs_table.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(data=job_row)
    jobs_table.update.return_value.eq.return_value.execute.return_value = MagicMock(data=[job_row])

    chunks_table = MagicMock()
    chunks_table.select.return_value.eq.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value = MagicMock(
        data=[{"id": "chunk-0"}]
    )

    db = MagicMock()
    db.table.side_effect = lambda name: jobs_table if name == "transcribe_jobs" else chunks_table

    with patch("app.routers.transcribe.get_supabase_or_none", return_value=db), \
         patch("app.routers.transcribe.check_usage", side_effect=HTTPException(status_code=429, detail="Plan limit exceeded for transcribe_seconds")):
        res = client.post(
            f"/v1/transcribe/jobs/{job_id}/run",
            json={"max_chunks": 5},
            headers=auth_headers,
        )

    assert res.status_code == 429
    assert any(
        call.args and isinstance(call.args[0], dict) and call.args[0].get("status") == "paused"
        for call in jobs_table.update.call_args_list
    )


def test_run_job_validates_max_chunks_minimum(client, auth_headers):
    res = client.post(
        "/v1/transcribe/jobs/job-1/run",
        json={"max_chunks": 0},
        headers=auth_headers,
    )
    assert res.status_code == 422


def test_run_job_returns_pending_when_no_chunks_registered(client, auth_headers):
    job_id = "job-pending-1"
    user_id = "user-123"
    job_row = {
        "id": job_id,
        "user_id": user_id,
        "status": "pending",
        "processed_chunks": 0,
        "total_chunks": 3,
        "enable_diarization": False,
        "language": None,
    }

    jobs_table = MagicMock()
    jobs_table.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(data=job_row)
    jobs_table.update.return_value.eq.return_value.execute.return_value = MagicMock(data=[job_row])

    chunks_table = MagicMock()
    chunks_table.select.return_value.eq.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value = MagicMock(data=[])

    db = MagicMock()
    db.table.side_effect = lambda name: jobs_table if name == "transcribe_jobs" else chunks_table

    with patch("app.routers.transcribe.get_supabase_or_none", return_value=db):
        res = client.post(
            f"/v1/transcribe/jobs/{job_id}/run",
            json={"max_chunks": 5},
            headers=auth_headers,
        )

    assert res.status_code == 200
    assert res.json()["status"] == "pending"
    assert any(
        call.args and isinstance(call.args[0], dict) and call.args[0].get("status") == "pending"
        for call in jobs_table.update.call_args_list
    )


def test_register_chunk_rejects_index_out_of_range(client, auth_headers):
    job_id = "job-range-1"
    user_id = "user-123"
    job_row = {"id": job_id, "user_id": user_id, "total_chunks": 2, "status": "pending"}

    jobs_table = MagicMock()
    jobs_table.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(data=job_row)

    db = MagicMock()
    db.table.side_effect = lambda name: jobs_table if name == "transcribe_jobs" else MagicMock()

    with patch("app.routers.transcribe.get_supabase_or_none", return_value=db):
        res = client.post(
            f"/v1/transcribe/jobs/{job_id}/chunks",
            json={"index": 3, "storage_path": "audio/chunk3.wav"},
            headers=auth_headers,
        )

    assert res.status_code == 400
    assert "out of range" in res.json()["detail"].lower()
    assert res.headers.get("x-whisperall-error-code") == "TRANSCRIBE_CHUNK_INDEX_OUT_OF_RANGE"
    assert res.json()["error"]["code"] == "TRANSCRIBE_CHUNK_INDEX_OUT_OF_RANGE"


def test_register_chunk_is_idempotent_for_same_index(client, auth_headers):
    job_id = "job-idempotent-1"
    user_id = "user-123"
    job_row = {"id": job_id, "user_id": user_id, "total_chunks": 3, "status": "pending"}

    jobs_table = MagicMock()
    jobs_table.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(data=job_row)

    chunks_table = MagicMock()
    chunks_table.select.return_value.eq.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value = MagicMock(
        data=[{"id": "chunk-existing", "status": "pending"}]
    )

    db = MagicMock()
    db.table.side_effect = lambda name: jobs_table if name == "transcribe_jobs" else chunks_table

    with patch("app.routers.transcribe.get_supabase_or_none", return_value=db):
        res = client.post(
            f"/v1/transcribe/jobs/{job_id}/chunks",
            json={"index": 1, "storage_path": "audio/chunk1.wav"},
            headers=auth_headers,
        )

    assert res.status_code == 200
    assert res.json()["ok"] is True
    assert res.json()["already_registered"] is True


def test_register_chunk_handles_unique_violation_as_idempotent(client, auth_headers):
    job_id = "job-race-1"
    user_id = "user-123"
    job_row = {"id": job_id, "user_id": user_id, "total_chunks": 3, "status": "pending"}

    jobs_table = MagicMock()
    jobs_table.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(data=job_row)

    chunks_table = MagicMock()
    chunk_lookup = (
        chunks_table.select.return_value.eq.return_value.eq.return_value.order.return_value.limit.return_value
    )
    chunk_lookup.execute.side_effect = [
        MagicMock(data=[]),
        MagicMock(data=[{"id": "chunk-existing", "status": "pending"}]),
    ]
    chunks_table.insert.return_value.execute.side_effect = Exception(
        "duplicate key value violates unique constraint 23505"
    )

    db = MagicMock()
    db.table.side_effect = lambda name: jobs_table if name == "transcribe_jobs" else chunks_table

    with patch("app.routers.transcribe.get_supabase_or_none", return_value=db):
        res = client.post(
            f"/v1/transcribe/jobs/{job_id}/chunks",
            json={"index": 1, "storage_path": "audio/chunk1.wav"},
            headers=auth_headers,
        )

    assert res.status_code == 200
    assert res.json()["ok"] is True
    assert res.json()["already_registered"] is True
    assert res.json()["chunk_id"] == "chunk-existing"


def test_register_chunk_returns_404_when_job_not_found(client, auth_headers):
    jobs_table = MagicMock()
    jobs_table.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(data=None)

    db = MagicMock()
    db.table.side_effect = lambda name: jobs_table if name == "transcribe_jobs" else MagicMock()

    with patch("app.routers.transcribe.get_supabase_or_none", return_value=db):
        res = client.post(
            "/v1/transcribe/jobs/missing-job/chunks",
            json={"index": 0, "storage_path": "audio/chunk0.wav"},
            headers=auth_headers,
        )

    assert res.status_code == 404
    assert "not found" in res.json()["detail"].lower()
    assert res.headers.get("x-whisperall-error-code") == "TRANSCRIBE_JOB_NOT_FOUND"
    assert res.json()["error"]["code"] == "TRANSCRIBE_JOB_NOT_FOUND"


def test_run_job_returns_404_when_job_not_found(client, auth_headers):
    jobs_table = MagicMock()
    jobs_table.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(data=None)

    db = MagicMock()
    db.table.side_effect = lambda name: jobs_table if name == "transcribe_jobs" else MagicMock()

    with patch("app.routers.transcribe.get_supabase_or_none", return_value=db):
        res = client.post(
            "/v1/transcribe/jobs/missing-job/run",
            json={"max_chunks": 1},
            headers=auth_headers,
        )

    assert res.status_code == 404
    assert "not found" in res.json()["detail"].lower()
    assert res.headers.get("x-whisperall-error-code") == "TRANSCRIBE_JOB_NOT_FOUND"
    assert res.json()["error"]["code"] == "TRANSCRIBE_JOB_NOT_FOUND"


def test_get_job_returns_404_when_job_not_found(client, auth_headers):
    jobs_table = MagicMock()
    jobs_table.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(data=None)

    db = MagicMock()
    db.table.side_effect = lambda name: jobs_table if name == "transcribe_jobs" else MagicMock()

    with patch("app.routers.transcribe.get_supabase_or_none", return_value=db):
        res = client.get("/v1/transcribe/jobs/missing-job", headers=auth_headers)

    assert res.status_code == 404
    assert "not found" in res.json()["detail"].lower()
    assert res.headers.get("x-whisperall-error-code") == "TRANSCRIBE_JOB_NOT_FOUND"
    assert res.json()["error"]["code"] == "TRANSCRIBE_JOB_NOT_FOUND"


def test_get_result_returns_404_when_job_not_found(client, auth_headers):
    jobs_table = MagicMock()
    jobs_table.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(data=None)

    db = MagicMock()
    db.table.side_effect = lambda name: jobs_table if name == "transcribe_jobs" else MagicMock()

    with patch("app.routers.transcribe.get_supabase_or_none", return_value=db):
        res = client.get("/v1/transcribe/jobs/missing-job/result", headers=auth_headers)

    assert res.status_code == 404
    assert "not found" in res.json()["detail"].lower()
    assert res.headers.get("x-whisperall-error-code") == "TRANSCRIBE_JOB_NOT_FOUND"
    assert res.json()["error"]["code"] == "TRANSCRIBE_JOB_NOT_FOUND"


def test_get_result_returns_404_with_result_not_ready_code(client, auth_headers):
    job_id = "job-no-result-1"
    user_id = "user-123"
    job_row = {"id": job_id, "user_id": user_id}

    jobs_table = MagicMock()
    jobs_table.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(data=job_row)

    transcripts_table = MagicMock()
    transcripts_table.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(data=None)

    def table_dispatch(name: str):
        if name == "transcribe_jobs":
            return jobs_table
        if name == "transcripts":
            return transcripts_table
        return MagicMock()

    db = MagicMock()
    db.table.side_effect = table_dispatch

    with patch("app.routers.transcribe.get_supabase_or_none", return_value=db):
        res = client.get(f"/v1/transcribe/jobs/{job_id}/result", headers=auth_headers)

    assert res.status_code == 404
    assert res.json()["detail"] == "Result not ready"
    assert res.headers.get("x-whisperall-error-code") == "TRANSCRIBE_RESULT_NOT_READY"
    assert res.json()["error"]["code"] == "TRANSCRIBE_RESULT_NOT_READY"


def test_from_url_supports_page_links_via_media_resolution(client, auth_headers):
    db = MagicMock()

    with patch("app.routers.transcribe.get_supabase_or_none", return_value=db), \
         patch("app.routers.transcribe.check_usage"), \
         patch("app.routers.transcribe._resolve_media_from_url", new_callable=AsyncMock) as mock_resolve, \
         patch("app.routers.transcribe.groq_stt.transcribe_chunk", new_callable=AsyncMock) as mock_groq:
        mock_resolve.return_value = (b"RIFF-fake-audio", "audio/wav", "/audio.wav")
        mock_groq.return_value = "transcribed text"
        res = client.post(
            "/v1/transcribe/from-url",
            json={"url": "https://www.youtube.com/watch?v=HcKWn32vRIM"},
            headers=auth_headers,
        )

    assert res.status_code == 200
    assert res.json()["text"] == "transcribed text"
    assert res.json()["segments"] is None
    mock_resolve.assert_awaited_once()
    mock_groq.assert_awaited_once()


def test_from_url_rejects_non_media_page_before_provider_calls(client, auth_headers):
    db = MagicMock()

    with patch("app.routers.transcribe.get_supabase_or_none", return_value=db), \
         patch("app.routers.transcribe.check_usage"), \
         patch("app.routers.transcribe._resolve_media_from_url", new_callable=AsyncMock) as mock_resolve, \
         patch("app.routers.transcribe.groq_stt.transcribe_chunk", new_callable=AsyncMock) as mock_groq, \
         patch("app.routers.transcribe.deepgram.transcribe_chunk_diarized", new_callable=AsyncMock) as mock_deepgram:
        mock_resolve.side_effect = HTTPException(
            status_code=400,
            detail="The provided URL does not point to downloadable audio/video media (content-type: text/html).",
            headers={"X-Whisperall-Error-Code": "TRANSCRIBE_URL_NOT_MEDIA"},
        )
        res = client.post(
            "/v1/transcribe/from-url",
            json={"url": "https://www.youtube.com/watch?v=HcKWn32vRIM", "enable_diarization": True},
            headers=auth_headers,
        )

    assert res.status_code == 400
    assert res.headers.get("x-whisperall-error-code") == "TRANSCRIBE_URL_NOT_MEDIA"
    assert res.json()["error"]["code"] == "TRANSCRIBE_URL_NOT_MEDIA"
    assert mock_groq.await_count == 0
    assert mock_deepgram.await_count == 0


def test_from_url_maps_provider_http_error_to_stable_api_error(client, auth_headers):
    groq_request = httpx.Request("POST", "https://api.groq.com/openai/v1/audio/transcriptions")
    groq_response = httpx.Response(status_code=400, request=groq_request)
    db = MagicMock()

    with patch("app.routers.transcribe.get_supabase_or_none", return_value=db), \
         patch("app.routers.transcribe.check_usage"), \
         patch("app.routers.transcribe._resolve_media_from_url", new_callable=AsyncMock) as mock_resolve, \
         patch("app.routers.transcribe.groq_stt.transcribe_chunk", new_callable=AsyncMock) as mock_groq:
        mock_resolve.return_value = (b"RIFF-fake-audio", "audio/wav", "/audio.wav")
        mock_groq.side_effect = httpx.HTTPStatusError(
            "Bad request from Groq",
            request=groq_request,
            response=groq_response,
        )
        res = client.post(
            "/v1/transcribe/from-url",
            json={"url": "https://cdn.example.com/audio.wav"},
            headers=auth_headers,
        )

    assert res.status_code == 400
    assert res.headers.get("x-whisperall-error-code") == "TRANSCRIBE_URL_PROVIDER_REJECTED"
    assert res.json()["error"]["code"] == "TRANSCRIBE_URL_PROVIDER_REJECTED"
