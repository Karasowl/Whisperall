"""Tests for the folders CRUD router."""
from unittest.mock import MagicMock, patch


FOLDER_ROW = {
    "id": "folder-1", "user_id": "user-123", "name": "Work",
    "created_at": "2025-01-01", "updated_at": "2025-01-01",
}
MISSING_TABLE_ERR = (
    "{'code': 'PGRST205', 'details': None, 'hint': \"Perhaps you meant the table "
    "'public.documents'\", 'message': \"Could not find the table 'public.folders' in "
    "the schema cache\"}"
)


def _mock_db(table_data=None):
    """Build a mock Supabase client with chainable query builder."""
    db = MagicMock()
    qb = MagicMock()
    qb.select.return_value = qb
    qb.eq.return_value = qb
    qb.order.return_value = qb
    qb.insert.return_value = qb
    qb.update.return_value = qb
    qb.delete.return_value = qb
    qb.execute.return_value = MagicMock(data=table_data, count=0)
    db.table.return_value = qb
    return db


class TestFoldersListNoDb:
    def test_returns_empty_when_no_db(self, client, auth_headers):
        with patch("app.routers.folders.get_supabase_or_none", return_value=None):
            res = client.get("/v1/folders", headers=auth_headers)
        assert res.status_code == 200
        assert res.json() == []


class TestFoldersCRUD:
    def test_list_folders(self, client, auth_headers):
        db = _mock_db(table_data=[FOLDER_ROW])
        with patch("app.routers.folders.get_supabase_or_none", return_value=db):
            res = client.get("/v1/folders", headers=auth_headers)
        assert res.status_code == 200
        assert len(res.json()) == 1
        assert res.json()[0]["name"] == "Work"

    def test_create_folder(self, client, auth_headers):
        db = _mock_db(table_data=[FOLDER_ROW])
        with patch("app.routers.folders.get_supabase_or_none", return_value=db):
            res = client.post("/v1/folders", headers=auth_headers, json={"name": "Work"})
        assert res.status_code == 200
        assert res.json()["name"] == "Work"

    def test_create_folder_with_parent(self, client, auth_headers):
        row = {**FOLDER_ROW, "parent_id": "parent-1"}
        db = _mock_db(table_data=[row])
        with patch("app.routers.folders.get_supabase_or_none", return_value=db):
            res = client.post("/v1/folders", headers=auth_headers, json={"name": "Sub", "parent_id": "parent-1"})
        assert res.status_code == 200

    def test_update_folder_parent(self, client, auth_headers):
        updated = {**FOLDER_ROW, "parent_id": "parent-1"}
        db = _mock_db(table_data=[updated])
        with patch("app.routers.folders.get_supabase_or_none", return_value=db):
            res = client.put("/v1/folders/folder-1", headers=auth_headers, json={"parent_id": "parent-1"})
        assert res.status_code == 200

    def test_create_folder_default_name(self, client, auth_headers):
        row = {**FOLDER_ROW, "name": "Untitled"}
        db = _mock_db(table_data=[row])
        with patch("app.routers.folders.get_supabase_or_none", return_value=db):
            res = client.post("/v1/folders", headers=auth_headers, json={})
        assert res.status_code == 200

    def test_create_folder_missing_table_returns_503(self, client, auth_headers):
        db = MagicMock()
        db.table.side_effect = Exception(MISSING_TABLE_ERR)
        with patch("app.routers.folders.get_supabase_or_none", return_value=db):
            res = client.post("/v1/folders", headers=auth_headers, json={"name": "Work"})
        assert res.status_code == 503
        assert "Folders are unavailable" in res.json()["detail"]

    def test_update_folder(self, client, auth_headers):
        updated = {**FOLDER_ROW, "name": "Personal"}
        db = _mock_db(table_data=[updated])
        with patch("app.routers.folders.get_supabase_or_none", return_value=db):
            res = client.put("/v1/folders/folder-1", headers=auth_headers, json={"name": "Personal"})
        assert res.status_code == 200
        assert res.json()["name"] == "Personal"

    def test_update_folder_not_found(self, client, auth_headers):
        db = _mock_db(table_data=[])
        with patch("app.routers.folders.get_supabase_or_none", return_value=db):
            res = client.put("/v1/folders/nope", headers=auth_headers, json={"name": "X"})
        assert res.status_code == 404

    def test_update_folder_missing_table_returns_503(self, client, auth_headers):
        db = MagicMock()
        db.table.side_effect = Exception(MISSING_TABLE_ERR)
        with patch("app.routers.folders.get_supabase_or_none", return_value=db):
            res = client.put("/v1/folders/folder-1", headers=auth_headers, json={"name": "Personal"})
        assert res.status_code == 503

    def test_delete_folder(self, client, auth_headers):
        db = _mock_db()
        with patch("app.routers.folders.get_supabase_or_none", return_value=db):
            res = client.delete("/v1/folders/folder-1", headers=auth_headers)
        assert res.status_code == 200
        assert res.json()["status"] == "deleted"

    def test_delete_folder_missing_table_returns_503(self, client, auth_headers):
        db = MagicMock()
        db.table.side_effect = Exception(MISSING_TABLE_ERR)
        with patch("app.routers.folders.get_supabase_or_none", return_value=db):
            res = client.delete("/v1/folders/folder-1", headers=auth_headers)
        assert res.status_code == 503

    def test_requires_auth(self, client):
        res = client.get("/v1/folders")
        assert res.status_code in (401, 403)
