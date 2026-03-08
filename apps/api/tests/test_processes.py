"""Tests for unified processes router."""
from unittest.mock import MagicMock, patch


PROCESS_ROW = {
    "id": "lp-1",
    "user_id": "user-123",
    "process_type": "ai_edit",
    "title": "Rewrite note",
    "status": "running",
    "stage_label_key": "processes.stageAiEdit",
    "done": 0,
    "total": 1,
    "pct": 0,
    "document_id": None,
    "error": None,
    "created_at": "2026-02-20T00:00:00Z",
    "updated_at": "2026-02-20T00:00:00Z",
    "completed_at": None,
}

MISSING_TABLE_ERR = (
    "{'code': 'PGRST205', 'details': None, 'hint': \"Perhaps you meant the table "
    "'public.documents'\", 'message': \"Could not find the table 'public.processes' in "
    "the schema cache\"}"
)


def _mock_db(table_data=None):
    db = MagicMock()
    qb = MagicMock()
    qb.select.return_value = qb
    qb.eq.return_value = qb
    qb.order.return_value = qb
    qb.limit.return_value = qb
    qb.insert.return_value = qb
    qb.update.return_value = qb
    qb.delete.return_value = qb
    qb.maybe_single.return_value = qb
    qb.execute.return_value = MagicMock(data=table_data, count=0)
    db.table.return_value = qb
    return db


class TestProcessesListNoDb:
    def test_returns_empty_when_no_db(self, client, auth_headers):
        with patch("app.routers.processes.get_supabase_or_none", return_value=None):
            res = client.get("/v1/processes", headers=auth_headers)
        assert res.status_code == 200
        assert res.json() == []


class TestProcessesCRUD:
    def test_list_processes(self, client, auth_headers):
        db = _mock_db(table_data=[PROCESS_ROW])
        with patch("app.routers.processes.get_supabase_or_none", return_value=db):
            res = client.get("/v1/processes", headers=auth_headers)
        assert res.status_code == 200
        assert len(res.json()) == 1
        assert res.json()[0]["id"] == "lp-1"

    def test_upsert_process_creates_when_missing(self, client, auth_headers):
        db = _mock_db()
        db.table.return_value.execute.side_effect = [
            MagicMock(data=None, count=0),  # lookup existing
            MagicMock(data=[PROCESS_ROW], count=1),  # insert
        ]
        with patch("app.routers.processes.get_supabase_or_none", return_value=db):
            res = client.put("/v1/processes/lp-1", headers=auth_headers, json={
                "process_type": "ai_edit",
                "title": "Rewrite note",
                "status": "running",
                "stage_label_key": "processes.stageAiEdit",
                "done": 0,
                "total": 1,
                "pct": 0,
            })
        assert res.status_code == 200
        assert res.json()["id"] == "lp-1"
        inserted = db.table.return_value.insert.call_args.args[0]
        assert inserted["id"] == "lp-1"
        assert inserted["user_id"] == "user-123"

    def test_upsert_process_updates_when_existing(self, client, auth_headers):
        updated = {**PROCESS_ROW, "status": "completed", "done": 1, "pct": 100}
        db = _mock_db()
        db.table.return_value.execute.side_effect = [
            MagicMock(data={"id": "lp-1"}, count=1),  # lookup existing
            MagicMock(data=[updated], count=1),  # update
        ]
        with patch("app.routers.processes.get_supabase_or_none", return_value=db):
            res = client.put("/v1/processes/lp-1", headers=auth_headers, json={
                "process_type": "ai_edit",
                "title": "Rewrite note",
                "status": "completed",
                "stage_label_key": "processes.stageCompleted",
                "done": 1,
                "total": 1,
                "pct": 100,
            })
        assert res.status_code == 200
        assert res.json()["status"] == "completed"
        payload = db.table.return_value.update.call_args.args[0]
        assert payload["completed_at"] is not None

    def test_patch_process(self, client, auth_headers):
        updated = {**PROCESS_ROW, "status": "paused"}
        db = _mock_db(table_data=[updated])
        with patch("app.routers.processes.get_supabase_or_none", return_value=db):
            res = client.patch("/v1/processes/lp-1", headers=auth_headers, json={"status": "paused"})
        assert res.status_code == 200
        assert res.json()["status"] == "paused"

    def test_patch_process_canceled_sets_completed_at(self, client, auth_headers):
        updated = {**PROCESS_ROW, "status": "canceled", "completed_at": "2026-02-20T00:10:00Z"}
        db = _mock_db(table_data=[updated])
        with patch("app.routers.processes.get_supabase_or_none", return_value=db):
            res = client.patch("/v1/processes/lp-1", headers=auth_headers, json={"status": "canceled"})
        assert res.status_code == 200
        assert res.json()["status"] == "canceled"
        payload = db.table.return_value.update.call_args.args[0]
        assert payload["completed_at"] is not None

    def test_patch_requires_fields(self, client, auth_headers):
        db = _mock_db(table_data=[PROCESS_ROW])
        with patch("app.routers.processes.get_supabase_or_none", return_value=db):
            res = client.patch("/v1/processes/lp-1", headers=auth_headers, json={})
        assert res.status_code == 400

    def test_delete_process(self, client, auth_headers):
        db = _mock_db()
        with patch("app.routers.processes.get_supabase_or_none", return_value=db):
            res = client.delete("/v1/processes/lp-1", headers=auth_headers)
        assert res.status_code == 200
        assert res.json()["status"] == "deleted"

    def test_write_returns_503_when_table_missing(self, client, auth_headers):
        db = MagicMock()
        db.table.side_effect = Exception(MISSING_TABLE_ERR)
        with patch("app.routers.processes.get_supabase_or_none", return_value=db):
            res = client.put("/v1/processes/lp-1", headers=auth_headers, json={
                "process_type": "ai_edit",
                "title": "Rewrite note",
                "status": "running",
                "stage_label_key": "processes.stageAiEdit",
                "done": 0,
                "total": 1,
                "pct": 0,
            })
        assert res.status_code == 503
        assert "Processes are unavailable" in res.json()["detail"]

    def test_requires_auth(self, client):
        res = client.get("/v1/processes")
        assert res.status_code in (401, 403)
