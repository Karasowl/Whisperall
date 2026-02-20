"""Tests for the documents CRUD router."""
from unittest.mock import MagicMock, patch
from fastapi import HTTPException


DOC_ROW = {
    "id": "doc-1", "user_id": "user-123", "title": "Test",
    "content": "Hello", "source": "dictation", "source_id": None,
    "audio_url": None, "tags": [], "created_at": "2025-01-01", "updated_at": "2025-01-01",
}
MISSING_AUDIO_URL_ERR = "{'code': 'PGRST204', 'message': \"Could not find the 'audio_url' column of 'documents' in the schema cache\"}"
TRANSCRIPTION_ENTRY = {
    "id": "hist-1",
    "document_id": "doc-1",
    "user_id": "user-123",
    "block_id": "block-1",
    "source": "audio",
    "language": "es",
    "diarization": True,
    "text": "Speaker 1: Hola",
    "segments": [{"text": "Hola", "speaker": "Speaker 1", "start": 0, "end": 1}],
    "audio_url": "https://cdn.example.com/a.mp3",
    "created_at": "2025-01-01",
    "updated_at": "2025-01-01",
}


def _mock_db(table_data=None, single_data=None):
    """Build a mock Supabase client with chainable query builder."""
    db = MagicMock()
    qb = MagicMock()
    qb.select.return_value = qb
    qb.eq.return_value = qb
    qb.order.return_value = qb
    qb.maybe_single.return_value = qb
    qb.insert.return_value = qb
    qb.update.return_value = qb
    qb.delete.return_value = qb
    qb.execute.return_value = MagicMock(data=table_data, count=0)
    db.table.return_value = qb
    return db


class TestDocumentsListNoDb:
    def test_returns_empty_when_no_db(self, client, auth_headers):
        with patch("app.routers.documents.get_supabase_or_none", return_value=None):
            res = client.get("/v1/documents", headers=auth_headers)
        assert res.status_code == 200
        assert res.json() == []


class TestDocumentsCRUD:
    def test_list_documents(self, client, auth_headers):
        db = _mock_db(table_data=[DOC_ROW])
        with patch("app.routers.documents.get_supabase_or_none", return_value=db):
            res = client.get("/v1/documents", headers=auth_headers)
        assert res.status_code == 200
        assert len(res.json()) == 1
        assert res.json()[0]["title"] == "Test"

    def test_get_document(self, client, auth_headers):
        db = _mock_db()
        db.table.return_value.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(data=DOC_ROW)
        with patch("app.routers.documents.get_supabase_or_none", return_value=db):
            res = client.get("/v1/documents/doc-1", headers=auth_headers)
        assert res.status_code == 200
        assert res.json()["id"] == "doc-1"

    def test_get_document_not_found(self, client, auth_headers):
        db = _mock_db()
        db.table.return_value.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(data=None)
        with patch("app.routers.documents.get_supabase_or_none", return_value=db):
            res = client.get("/v1/documents/nope", headers=auth_headers)
        assert res.status_code == 404

    def test_create_document(self, client, auth_headers):
        db = _mock_db(table_data=[DOC_ROW])
        with patch("app.routers.documents.get_supabase_or_none", return_value=db):
            res = client.post("/v1/documents", headers=auth_headers, json={
                "title": "Test", "content": "Hello", "source": "dictation",
            })
        assert res.status_code == 200
        assert res.json()["title"] == "Test"
        db.rpc.assert_called_with("increment_usage", {"p_user_id": "user-123", "p_notes_count": 1})

    def test_create_document_accepts_source_and_audio_metadata(self, client, auth_headers):
        row = {**DOC_ROW, "source": "transcription", "source_id": "job-1", "audio_url": "https://cdn.example.com/a.mp3"}
        db = _mock_db(table_data=[row])
        with patch("app.routers.documents.get_supabase_or_none", return_value=db):
            res = client.post("/v1/documents", headers=auth_headers, json={
                "title": "Call",
                "content": "Speaker 1: Hola",
                "source": "transcription",
                "source_id": "job-1",
                "audio_url": "https://cdn.example.com/a.mp3",
            })
        assert res.status_code == 200
        assert res.json()["source"] == "transcription"
        assert res.json()["source_id"] == "job-1"
        assert res.json()["audio_url"] == "https://cdn.example.com/a.mp3"

    def test_create_document_retries_without_audio_url_when_column_missing(self, client, auth_headers):
        db = _mock_db()
        docs_qb = MagicMock()
        docs_qb.insert.return_value = docs_qb
        docs_qb.eq.return_value = docs_qb
        docs_qb.update.return_value = docs_qb
        docs_qb.select.return_value = docs_qb
        docs_qb.maybe_single.return_value = docs_qb
        docs_qb.execute.side_effect = [
            Exception(MISSING_AUDIO_URL_ERR),
            MagicMock(data=[DOC_ROW], count=1),
        ]

        history_qb = MagicMock()
        history_qb.insert.return_value = history_qb
        history_qb.execute.return_value = MagicMock(data=[{}], count=1)

        def _table(name: str):
            return docs_qb if name == "documents" else history_qb

        db.table.side_effect = _table
        db.rpc.return_value.execute.return_value = MagicMock(data=None)

        with patch("app.routers.documents.get_supabase_or_none", return_value=db):
            res = client.post("/v1/documents", headers=auth_headers, json={
                "title": "Call",
                "content": "Speaker 1: Hola",
                "source": "transcription",
                "source_id": "job-1",
                "audio_url": "https://cdn.example.com/a.mp3",
            })

        assert res.status_code == 200
        assert docs_qb.insert.call_count == 2
        first_insert = docs_qb.insert.call_args_list[0].args[0]
        second_insert = docs_qb.insert.call_args_list[1].args[0]
        assert first_insert["audio_url"] == "https://cdn.example.com/a.mp3"
        assert "audio_url" not in second_insert
        assert second_insert["source_id"] == "job-1"

    def test_create_document_respects_notes_usage_limit(self, client, auth_headers):
        db = _mock_db(table_data=[DOC_ROW])
        with patch("app.routers.documents.get_supabase_or_none", return_value=db), patch(
            "app.routers.documents.check_usage",
            side_effect=HTTPException(status_code=429, detail="Plan limit exceeded for notes_count"),
        ):
            res = client.post("/v1/documents", headers=auth_headers, json={
                "title": "Blocked", "content": "Nope", "source": "dictation",
            })

        assert res.status_code == 429

    def test_update_document(self, client, auth_headers):
        updated = {**DOC_ROW, "title": "Updated"}
        db = _mock_db(table_data=[updated])
        with patch("app.routers.documents.get_supabase_or_none", return_value=db):
            res = client.put("/v1/documents/doc-1", headers=auth_headers, json={"title": "Updated"})
        assert res.status_code == 200
        assert res.json()["title"] == "Updated"

    def test_update_document_retries_without_audio_url_when_column_missing(self, client, auth_headers):
        updated = {**DOC_ROW, "title": "Updated"}
        db = _mock_db()
        docs_qb = MagicMock()
        docs_qb.update.return_value = docs_qb
        docs_qb.eq.return_value = docs_qb
        docs_qb.select.return_value = docs_qb
        docs_qb.maybe_single.return_value = docs_qb
        docs_qb.execute.side_effect = [
            Exception(MISSING_AUDIO_URL_ERR),
            MagicMock(data=[updated], count=1),
        ]
        db.table.return_value = docs_qb

        with patch("app.routers.documents.get_supabase_or_none", return_value=db):
            res = client.put("/v1/documents/doc-1", headers=auth_headers, json={
                "title": "Updated",
                "audio_url": "https://cdn.example.com/new.mp3",
            })

        assert res.status_code == 200
        assert docs_qb.update.call_count == 2
        first_update = docs_qb.update.call_args_list[0].args[0]
        second_update = docs_qb.update.call_args_list[1].args[0]
        assert first_update["audio_url"] == "https://cdn.example.com/new.mp3"
        assert "audio_url" not in second_update
        assert second_update["title"] == "Updated"

    def test_delete_document(self, client, auth_headers):
        db = _mock_db()
        with patch("app.routers.documents.get_supabase_or_none", return_value=db):
            res = client.delete("/v1/documents/doc-1", headers=auth_headers)
        assert res.status_code == 200
        assert res.json()["status"] == "deleted"

    def test_list_document_transcriptions(self, client, auth_headers):
        db = _mock_db()

        docs_qb = MagicMock()
        docs_qb.select.return_value = docs_qb
        docs_qb.eq.return_value = docs_qb
        docs_qb.maybe_single.return_value = docs_qb
        docs_qb.execute.return_value = MagicMock(data=DOC_ROW, count=1)

        history_qb = MagicMock()
        history_qb.select.return_value = history_qb
        history_qb.eq.return_value = history_qb
        history_qb.order.return_value = history_qb
        history_qb.limit.return_value = history_qb
        history_qb.execute.return_value = MagicMock(data=[TRANSCRIPTION_ENTRY], count=1)

        db.table.side_effect = lambda name: docs_qb if name == "documents" else history_qb
        with patch("app.routers.documents.get_supabase_or_none", return_value=db):
            res = client.get("/v1/documents/doc-1/transcriptions", headers=auth_headers)

        assert res.status_code == 200
        assert len(res.json()) == 1
        assert res.json()[0]["id"] == "hist-1"

    def test_list_document_transcriptions_by_block_id(self, client, auth_headers):
        db = _mock_db()

        docs_qb = MagicMock()
        docs_qb.select.return_value = docs_qb
        docs_qb.eq.return_value = docs_qb
        docs_qb.maybe_single.return_value = docs_qb
        docs_qb.execute.return_value = MagicMock(data=DOC_ROW, count=1)

        history_qb = MagicMock()
        history_qb.select.return_value = history_qb
        history_qb.eq.return_value = history_qb
        history_qb.order.return_value = history_qb
        history_qb.limit.return_value = history_qb
        history_qb.execute.return_value = MagicMock(data=[TRANSCRIPTION_ENTRY], count=1)

        db.table.side_effect = lambda name: docs_qb if name == "documents" else history_qb
        with patch("app.routers.documents.get_supabase_or_none", return_value=db):
            res = client.get("/v1/documents/doc-1/transcriptions?block_id=block-1", headers=auth_headers)

        assert res.status_code == 200
        assert len(res.json()) == 1
        history_qb.eq.assert_any_call("block_id", "block-1")

    def test_create_document_transcription_entry(self, client, auth_headers):
        db = _mock_db()

        docs_qb = MagicMock()
        docs_qb.select.return_value = docs_qb
        docs_qb.eq.return_value = docs_qb
        docs_qb.maybe_single.return_value = docs_qb
        docs_qb.execute.return_value = MagicMock(data=DOC_ROW, count=1)

        history_qb = MagicMock()
        history_qb.insert.return_value = history_qb
        history_qb.execute.return_value = MagicMock(data=[TRANSCRIPTION_ENTRY], count=1)

        db.table.side_effect = lambda name: docs_qb if name == "documents" else history_qb
        with patch("app.routers.documents.get_supabase_or_none", return_value=db):
            res = client.post("/v1/documents/doc-1/transcriptions", headers=auth_headers, json={
                "block_id": "block-1",
                "source": "audio",
                "language": "es",
                "diarization": True,
                "text": "Speaker 1: Hola",
                "segments": [{"text": "Hola", "speaker": "Speaker 1", "start": 0, "end": 1}],
                "audio_url": "https://cdn.example.com/a.mp3",
            })

        assert res.status_code == 200
        assert res.json()["text"] == "Speaker 1: Hola"
        assert res.json()["block_id"] == "block-1"
        assert res.json()["source"] == "audio"
        history_qb.insert.assert_called_once()
        payload = history_qb.insert.call_args.args[0]
        assert payload["block_id"] == "block-1"
        assert payload["source"] == "audio"

    def test_delete_document_transcription_entry(self, client, auth_headers):
        db = _mock_db()

        docs_qb = MagicMock()
        docs_qb.select.return_value = docs_qb
        docs_qb.eq.return_value = docs_qb
        docs_qb.maybe_single.return_value = docs_qb
        docs_qb.execute.return_value = MagicMock(data=DOC_ROW, count=1)

        history_qb = MagicMock()
        history_qb.delete.return_value = history_qb
        history_qb.eq.return_value = history_qb
        history_qb.execute.return_value = MagicMock(data=[TRANSCRIPTION_ENTRY], count=1)

        db.table.side_effect = lambda name: docs_qb if name == "documents" else history_qb
        with patch("app.routers.documents.get_supabase_or_none", return_value=db):
            res = client.delete("/v1/documents/doc-1/transcriptions/hist-1", headers=auth_headers)

        assert res.status_code == 200
        assert res.json()["status"] == "deleted"

    def test_requires_auth(self, client):
        res = client.get("/v1/documents")
        assert res.status_code in (401, 403)
