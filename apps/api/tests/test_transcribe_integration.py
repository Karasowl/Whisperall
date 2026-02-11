"""Full transcribe lifecycle tests with mocked Supabase DB."""
import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from app.routers.transcribe import _segments_to_labeled_text


JOB_ID = "job-abc-123"
USER_ID = "user-123"


def _make_db_mock(enable_diarization: bool = False):
    """Build a mock Supabase client that tracks table state."""
    db = MagicMock()

    # -- transcribe_jobs.insert -> returns created job
    job_data = {
        "id": JOB_ID, "user_id": USER_ID, "status": "pending",
        "processed_chunks": 0, "total_chunks": 2,
        "language": None, "enable_diarization": enable_diarization,
        "enable_translation": False, "target_language": None,
    }

    def table_dispatch(name):
        mock_table = MagicMock()

        if name == "transcribe_jobs":
            # insert
            mock_table.insert.return_value.execute.return_value = MagicMock(data=[job_data])
            # select("...").eq("id", ...).single()/maybe_single()
            mock_table.select.return_value.eq.return_value.single.return_value.execute.return_value = MagicMock(data=job_data)
            mock_table.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(data=job_data)
            # update
            mock_table.update.return_value.eq.return_value.execute.return_value = MagicMock(data=[job_data])
            return mock_table

        if name == "transcribe_chunks":
            # insert
            mock_table.insert.return_value.execute.return_value = MagicMock(data=[{}])
            # select for pending chunks (used in run_job and usage check)
            chunk_data = [
                {"id": "chunk-0", "index": 0, "storage_path": "p0.wav", "status": "pending"},
                {"id": "chunk-1", "index": 1, "storage_path": "p1.wav", "status": "pending"},
            ]
            # For the limit query (count pending)
            mock_table.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(data=chunk_data)
            # For the ordered query (actual processing)
            mock_table.select.return_value.eq.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value = MagicMock(data=chunk_data)
            # For select result_json (final merge)
            mock_table.select.return_value.eq.return_value.order.return_value.execute.return_value = MagicMock(
                data=[{"result_json": {"text": "chunk zero"}}, {"result_json": {"text": "chunk one"}}]
            )
            # update
            mock_table.update.return_value.eq.return_value.execute.return_value = MagicMock(data=[{}])
            return mock_table

        if name == "transcripts":
            # insert
            mock_table.insert.return_value.execute.return_value = MagicMock(data=[{}])
            # select for result
            mock_table.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(
                data={"plain_text": "chunk zero chunk one", "segments": None}
            )
            return mock_table

        return mock_table

    db.table = table_dispatch
    db.rpc.return_value.execute.return_value = MagicMock(data=None)
    return db


@pytest.fixture
def mock_supabase():
    db = _make_db_mock()
    with patch("app.routers.transcribe.get_supabase_or_none", return_value=db):
        yield db


@pytest.fixture
def mock_groq_provider():
    with patch("app.routers.transcribe.groq_stt.transcribe_chunk", new_callable=AsyncMock) as m:
        m.return_value = "chunk text"
        yield m


@pytest.fixture
def mock_deepgram_provider():
    with patch("app.routers.transcribe.deepgram.transcribe_chunk_diarized", new_callable=AsyncMock) as m:
        m.return_value = {
            "text": "chunk text",
            "segments": [
                {"start": 0.0, "end": 1.0, "text": "hello", "speaker": "Speaker 1"},
            ],
        }
        yield m


class TestCreateJob:
    def test_creates_job(self, client, auth_headers, mock_supabase):
        res = client.post("/v1/transcribe/jobs", json={"total_chunks": 2}, headers=auth_headers)
        assert res.status_code == 200
        data = res.json()
        assert data["id"] == JOB_ID
        assert data["status"] == "pending"
        assert data["total_chunks"] == 2
        assert data["processed_chunks"] == 0

    def test_requires_auth(self, client):
        res = client.post("/v1/transcribe/jobs", json={"total_chunks": 2})
        assert res.status_code == 401

    def test_validates_total_chunks(self, client, auth_headers, mock_supabase):
        res = client.post("/v1/transcribe/jobs", json={"total_chunks": 0}, headers=auth_headers)
        assert res.status_code == 422  # validation error


class TestRegisterChunk:
    def test_registers_chunk(self, client, auth_headers, mock_supabase):
        res = client.post(
            f"/v1/transcribe/jobs/{JOB_ID}/chunks",
            json={"index": 0, "storage_path": "audio/chunk0.wav"},
            headers=auth_headers,
        )
        assert res.status_code == 200
        assert res.json()["ok"] is True

    def test_rejects_wrong_owner(self, client, mock_supabase):
        """User who doesn't own the job gets 403."""
        import jwt
        other_token = jwt.encode({"sub": "other-user"}, "test-secret", algorithm="HS256")
        headers = {"Authorization": f"Bearer {other_token}"}
        res = client.post(
            f"/v1/transcribe/jobs/{JOB_ID}/chunks",
            json={"index": 0, "storage_path": "p.wav"},
            headers=headers,
        )
        assert res.status_code == 403


class TestRunJob:
    def test_processes_chunks(self, client, auth_headers, mock_supabase, mock_groq_provider):
        res = client.post(
            f"/v1/transcribe/jobs/{JOB_ID}/run",
            json={"max_chunks": 5},
            headers=auth_headers,
        )
        assert res.status_code == 200
        data = res.json()
        assert data["status"] in ("processing", "completed")
        assert mock_groq_provider.call_count == 2  # 2 pending chunks

    def test_increments_usage(self, client, auth_headers, mock_supabase, mock_groq_provider):
        client.post(f"/v1/transcribe/jobs/{JOB_ID}/run", json={"max_chunks": 5}, headers=auth_headers)
        # Verify increment_usage RPC was called
        mock_supabase.rpc.assert_called()
        rpc_calls = [c for c in mock_supabase.rpc.call_args_list if c[0][0] == "increment_usage"]
        assert len(rpc_calls) >= 1
        assert rpc_calls[0][0][1]["p_transcribe_seconds"] > 0

    def test_processes_chunks_with_diarization(self, client, auth_headers, mock_deepgram_provider):
        db = _make_db_mock(enable_diarization=True)
        with patch("app.routers.transcribe.get_supabase_or_none", return_value=db), \
             patch("app.routers.transcribe.groq_stt.transcribe_chunk", new_callable=AsyncMock) as mock_groq, \
             patch("app.routers.transcribe.settings.deepgram_api_key", "dg-test-key"):
            mock_groq.return_value = "hq chunk text"
            res = client.post(
                f"/v1/transcribe/jobs/{JOB_ID}/run",
                json={"max_chunks": 5},
                headers=auth_headers,
            )
        assert res.status_code == 200
        assert mock_deepgram_provider.call_count == 2
        assert mock_groq.call_count == 2


class TestGetJob:
    def test_returns_job_status(self, client, auth_headers, mock_supabase):
        res = client.get(f"/v1/transcribe/jobs/{JOB_ID}", headers=auth_headers)
        assert res.status_code == 200
        data = res.json()
        assert data["id"] == JOB_ID

    def test_rejects_wrong_owner(self, client, mock_supabase):
        import jwt
        other_token = jwt.encode({"sub": "other-user"}, "test-secret", algorithm="HS256")
        headers = {"Authorization": f"Bearer {other_token}"}
        res = client.get(f"/v1/transcribe/jobs/{JOB_ID}", headers=headers)
        assert res.status_code == 403


class TestGetResult:
    def test_returns_transcript(self, client, auth_headers, mock_supabase):
        res = client.get(f"/v1/transcribe/jobs/{JOB_ID}/result", headers=auth_headers)
        assert res.status_code == 200
        data = res.json()
        assert "chunk zero chunk one" in data["text"]

    def test_returns_404_when_not_ready(self, client, auth_headers):
        db = _make_db_mock()
        # Override transcripts to return None
        no_transcript = MagicMock()
        no_transcript.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(data=None)

        original_table = db.table

        def patched_table(name):
            if name == "transcripts":
                return no_transcript
            return original_table(name)

        db.table = patched_table

        with patch("app.routers.transcribe.get_supabase_or_none", return_value=db):
            res = client.get(f"/v1/transcribe/jobs/{JOB_ID}/result", headers=auth_headers)
        assert res.status_code == 404


def test_segments_to_labeled_text_groups_consecutive_speakers():
    text = _segments_to_labeled_text([
        {"speaker": "Speaker 1", "text": "Hola"},
        {"speaker": "Speaker 1", "text": "cómo estás"},
        {"speaker": "Speaker 2", "text": "Bien"},
        {"speaker": "Speaker 2", "text": "gracias"},
        {"speaker": "Speaker 1", "text": "Perfecto"},
    ])
    assert text == (
        "Speaker 1: Hola cómo estás\n\n"
        "Speaker 2: Bien gracias\n\n"
        "Speaker 1: Perfecto"
    )
