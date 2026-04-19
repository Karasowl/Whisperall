from unittest.mock import patch, MagicMock, AsyncMock, ANY

from app.config import settings
from app.routers.transcribe import (
    _is_near_silent_chunk,
    _is_repetitive_text,
    _merge_chunk_segments,
    _pick_best_text_candidate,
    _should_fallback_to_chunk_text,
)
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


def test_diarized_text_fallback_triggers_when_coverage_is_too_low():
    chunk_text = " ".join([f"palabra{i}" for i in range(120)])
    diarized_text = "Speaker 1: Hola, buenas. Se escucha bien."
    assert _should_fallback_to_chunk_text(diarized_text, chunk_text) is True


def test_diarized_text_fallback_keeps_diarized_text_when_coverage_is_reasonable():
    chunk_text = " ".join(["palabra"] * 80)
    diarized_text = "Speaker 1: " + " ".join(["palabra"] * 40)
    assert _should_fallback_to_chunk_text(diarized_text, chunk_text) is False


def test_is_repetitive_text_detects_thank_you_loops():
    repetitive = " ".join(["thank you"] * 60)
    assert _is_repetitive_text(repetitive) is True


def test_is_repetitive_text_ignores_normal_varied_speech():
    varied = (
        "Hoy revisamos métricas de ventas, soporte, onboarding y producto. "
        "Luego definimos acciones para Q2 con responsables y fechas concretas."
    )
    assert _is_repetitive_text(varied) is False


def test_pick_best_text_candidate_prefers_non_repetitive_option():
    repetitive = " ".join(["gracias"] * 80)
    meaningful = "Necesitamos confirmar presupuesto, cronograma y próximos pasos del proyecto."
    text, source, low_quality = _pick_best_text_candidate(
        {"groq": repetitive, "deepgram": meaningful},
        rms_level=0.002,
    )
    assert text == meaningful
    assert source == "deepgram"
    assert low_quality is False


def test_fallback_to_chunk_text_avoids_repetitive_chunk():
    chunk_text = " ".join(["thank you"] * 70)
    diarized_text = "Speaker 1: Tenemos reunión mañana para revisar resultados y cerrar pendientes."
    assert _should_fallback_to_chunk_text(diarized_text, chunk_text, chunk_rms=0.002) is False


def test_merge_chunk_segments_uses_duration_seconds_offsets():
    chunks = [
        {
            "index": 0,
            "result_json": {
                "duration_seconds": 120,
                "segments": [{"start": 0.0, "end": 3.0, "text": "Hola", "speaker": "Speaker 1"}],
            },
        },
        {
            "index": 1,
            "result_json": {
                "duration_seconds": 118,
                "segments": [{"start": 0.5, "end": 2.5, "text": "Buenas", "speaker": "Speaker 2"}],
            },
        },
    ]
    merged = _merge_chunk_segments(chunks)
    assert merged[0]["start"] == 0.0
    assert merged[1]["start"] == 120.5


def test_merge_chunk_segments_falls_back_to_default_chunk_size_when_duration_missing():
    chunks = [
        {"index": 0, "result_json": {"segments": [{"start": 0.0, "end": 1.0, "text": "A", "speaker": "Speaker 1"}]}},
        {"index": 1, "result_json": {"segments": [{"start": 0.0, "end": 1.0, "text": "B", "speaker": "Speaker 1"}]}},
    ]
    merged = _merge_chunk_segments(chunks)
    assert merged[1]["start"] == 300.0


def test_is_near_silent_chunk_uses_rms_metadata():
    silent = {"result_json": {"rms_level": 0.0004}}
    voiced = {"result_json": {"rms_level": 0.01}}
    unknown = {"result_json": {}}
    assert _is_near_silent_chunk(silent) is True
    assert _is_near_silent_chunk(voiced) is False
    assert _is_near_silent_chunk(unknown) is False


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
            json={"index": 3, "storage_path": "user-123/chunks/job-range-1/3.wav"},
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
            json={"index": 1, "storage_path": "user-123/chunks/job-idempotent-1/1.wav"},
            headers=auth_headers,
        )

    assert res.status_code == 200
    assert res.json()["ok"] is True
    assert res.json()["already_registered"] is True


def test_register_chunk_rejects_storage_path_owned_by_other_user(client, auth_headers):
    job_id = "job-storage-1"
    user_id = "user-123"
    job_row = {"id": job_id, "user_id": user_id, "total_chunks": 3, "status": "pending"}

    jobs_table = MagicMock()
    jobs_table.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(data=job_row)

    chunks_table = MagicMock()
    chunks_table.select.return_value.eq.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value = MagicMock(data=[])

    db = MagicMock()
    db.table.side_effect = lambda name: jobs_table if name == "transcribe_jobs" else chunks_table

    with patch("app.routers.transcribe.get_supabase_or_none", return_value=db):
        res = client.post(
            f"/v1/transcribe/jobs/{job_id}/chunks",
            json={"index": 1, "storage_path": "other-user/chunks/job-storage-1/1.wav"},
            headers=auth_headers,
        )

    assert res.status_code == 403
    assert res.headers.get("x-whisperall-error-code") == "TRANSCRIBE_STORAGE_FORBIDDEN"
    assert res.json()["error"]["code"] == "TRANSCRIBE_STORAGE_FORBIDDEN"


def test_register_chunk_tracks_storage_usage_bytes(client, auth_headers):
    job_id = "job-storage-usage-1"
    user_id = "user-123"
    job_row = {"id": job_id, "user_id": user_id, "total_chunks": 3, "status": "pending"}

    jobs_table = MagicMock()
    jobs_table.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(data=job_row)

    chunks_table = MagicMock()
    chunks_table.select.return_value.eq.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value = MagicMock(data=[])
    chunks_table.insert.return_value.execute.return_value = MagicMock(data=[{"id": "chunk-new"}])

    db = MagicMock()
    db.table.side_effect = lambda name: jobs_table if name == "transcribe_jobs" else chunks_table
    db.rpc.return_value.execute.return_value = MagicMock()

    with patch("app.routers.transcribe.get_supabase_or_none", return_value=db), \
         patch("app.routers.transcribe.check_usage") as mock_check_usage:
        res = client.post(
            f"/v1/transcribe/jobs/{job_id}/chunks",
            json={
                "index": 0,
                "storage_path": "user-123/chunks/job-storage-usage-1/0.wav",
                "chunk_bytes": 2048,
            },
            headers=auth_headers,
        )

    assert res.status_code == 200
    mock_check_usage.assert_any_call(
        ANY,
        "storage_bytes",
        2048,
    )
    db.rpc.assert_called_with("increment_usage", {"p_user_id": "user-123", "p_storage_bytes": 2048})


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
            json={"index": 1, "storage_path": "user-123/chunks/job-race-1/1.wav"},
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
            json={"index": 0, "storage_path": "user-123/chunks/missing-job/0.wav"},
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
        mock_resolve.return_value = (b"RIFF-fake-audio", "audio/wav", "/audio.wav", None)
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
        mock_resolve.return_value = (b"RIFF-fake-audio", "audio/wav", "/audio.wav", None)
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

    # The endpoint now maps upstream provider failures to HTTP 502 (Bad
    # Gateway) with `stage=transcribe` so the client can tell the error
    # came from the STT call, not from URL resolution or size check.
    assert res.status_code == 502
    assert res.headers.get("x-whisperall-error-code") == "TRANSCRIBE_STT_FAILED"
    assert res.headers.get("x-whisperall-error-stage") == "transcribe"
    assert res.json()["error"]["code"] == "TRANSCRIBE_STT_FAILED"


def test_from_url_job_requires_auth(client):
    res = client.post("/v1/transcribe/from-url-job", json={"url": "https://example.com/x.mp3"})
    assert res.status_code == 401


def test_from_url_job_no_db_returns_503(client, auth_headers):
    with patch("app.routers.transcribe.get_supabase_or_none", return_value=None):
        res = client.post(
            "/v1/transcribe/from-url-job",
            json={"url": "https://example.com/x.mp3"},
            headers=auth_headers,
        )
    assert res.status_code == 503
    assert res.headers.get("x-whisperall-error-code") == "TRANSCRIBE_DB_UNAVAILABLE"


def test_from_url_job_happy_path(client, auth_headers):
    """End-to-end-ish: mock resolve, ffmpeg splitting, storage upload, and DB
    inserts. Verifies the endpoint returns the real job id and total_chunks
    matches what ffmpeg produced."""
    db = MagicMock()
    fake_job_row = {"id": "job-xyz", "status": "pending", "processed_chunks": 0, "total_chunks": 3}
    db.table.return_value.insert.return_value.execute.return_value.data = [fake_job_row]
    db.storage.from_.return_value.upload.return_value = None

    with patch("app.routers.transcribe.get_supabase_or_none", return_value=db), \
         patch("app.routers.transcribe.check_usage"), \
         patch("app.routers.transcribe._resolve_media_from_url", new_callable=AsyncMock) as mock_resolve, \
         patch("app.routers.transcribe._ffmpeg_split_audio") as mock_split:
        mock_resolve.return_value = (
            b"fake-audio-bytes-long-enough-to-pass-size-check" * 32,
            "audio/mp3",
            "/audio.mp3",
            "Sample Video Title",
        )
        # Three mock chunks — bytes + duration tuples.
        mock_split.return_value = [
            (b"chunk0-bytes" * 64, 300.0),
            (b"chunk1-bytes" * 64, 300.0),
            (b"chunk2-bytes" * 64, 120.0),
        ]
        res = client.post(
            "/v1/transcribe/from-url-job",
            json={"url": "https://cdn.example.com/audio.mp3"},
            headers=auth_headers,
        )

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["id"] == "job-xyz"
    assert body["total_chunks"] == 3
    assert body["processed_chunks"] == 0
    # Three storage uploads + one jobs insert + three chunk inserts.
    assert db.storage.from_.call_count == 3
    # Verify chunk paths are user-scoped as per storage RLS.
    upload_calls = db.storage.from_.return_value.upload.call_args_list
    for call in upload_calls:
        path = call.args[0]
        assert "/url-chunks/job-xyz/" in path, f"unexpected path {path}"
        assert path.endswith(".mp3"), f"unexpected ext {path}"


def test_from_url_job_rejects_tiny_response(client, auth_headers):
    """If the source returns too few bytes it's almost certainly not media
    (captcha/redirect/404 html). The endpoint short-circuits with stage=resolve."""
    db = MagicMock()
    with patch("app.routers.transcribe.get_supabase_or_none", return_value=db), \
         patch("app.routers.transcribe.check_usage"), \
         patch("app.routers.transcribe._resolve_media_from_url", new_callable=AsyncMock) as mock_resolve:
        mock_resolve.return_value = (b"tiny", "text/html", "/", None)
        res = client.post(
            "/v1/transcribe/from-url-job",
            json={"url": "https://private.example.com/"},
            headers=auth_headers,
        )
    assert res.status_code == 400
    assert res.headers.get("x-whisperall-error-code") == "TRANSCRIBE_URL_TOO_SMALL"
    assert res.headers.get("x-whisperall-error-stage") == "resolve"
