"""Tests for the documents CRUD router."""
from unittest.mock import MagicMock, patch
from fastapi import HTTPException


DOC_ROW = {
    "id": "doc-1", "user_id": "user-123", "title": "Test",
    "content": "Hello", "source": "dictation", "source_id": None,
    "tags": [], "created_at": "2025-01-01", "updated_at": "2025-01-01",
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

    def test_delete_document(self, client, auth_headers):
        db = _mock_db()
        with patch("app.routers.documents.get_supabase_or_none", return_value=db):
            res = client.delete("/v1/documents/doc-1", headers=auth_headers)
        assert res.status_code == 200
        assert res.json()["status"] == "deleted"

    def test_requires_auth(self, client):
        res = client.get("/v1/documents")
        assert res.status_code in (401, 403)
