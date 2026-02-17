from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException


def _chain_table_with_data(rows):
    table = MagicMock()
    table.select.return_value = table
    table.eq.return_value = table
    table.order.return_value = table
    table.limit.return_value = table
    table.lt.return_value = table
    table.maybe_single.return_value = table
    table.execute.return_value = MagicMock(data=rows)
    return table


def test_reader_import_file_requires_auth(client):
    resp = client.post(
        "/v1/reader/import-file",
        files={"file": ("sample.txt", b"hello", "text/plain")},
    )
    assert resp.status_code == 401


def test_reader_import_file_rejects_unsupported_format(client, auth_headers):
    with patch("app.routers.reader._require_db", return_value=MagicMock()):
        resp = client.post(
            "/v1/reader/import-file",
            files={"file": ("sample.bin", b"\x00\x01", "application/octet-stream")},
            data={"save": "false"},
            headers=auth_headers,
        )
    assert resp.status_code == 400
    assert resp.headers.get("x-whisperall-error-code") == "READER_IMPORT_UNSUPPORTED_FORMAT"
    assert resp.json()["error"]["code"] == "READER_IMPORT_UNSUPPORTED_FORMAT"


def test_reader_import_file_saves_document(client, auth_headers):
    with patch("app.routers.reader._require_db", return_value=MagicMock()), \
         patch("app.routers.reader._extract_any", new_callable=AsyncMock) as mock_extract, \
         patch("app.routers.reader._save_reader_document", return_value="doc-reader-1"):
        mock_extract.return_value = ("Hola Reader", [], 1, None, 0)
        resp = client.post(
            "/v1/reader/import-file",
            files={"file": ("sample.txt", b"hello", "text/plain")},
            headers=auth_headers,
        )
    assert resp.status_code == 200
    assert resp.json()["text"] == "Hola Reader"
    assert resp.json()["document_id"] == "doc-reader-1"
    assert resp.json()["source"] == "file"


def test_reader_import_url_maps_download_failures(client, auth_headers):
    with patch("app.routers.reader._require_db", return_value=MagicMock()), \
         patch("app.routers.reader._download_url", new_callable=AsyncMock) as mock_download:
        mock_download.side_effect = HTTPException(
            status_code=400,
            detail="Could not download URL",
            headers={"X-Whisperall-Error-Code": "READER_IMPORT_DOWNLOAD_FAILED"},
        )
        resp = client.post(
            "/v1/reader/import-url",
            json={"url": "https://example.invalid/nope", "save": False},
            headers=auth_headers,
        )
    assert resp.status_code == 400
    assert resp.headers.get("x-whisperall-error-code") == "READER_IMPORT_DOWNLOAD_FAILED"
    assert resp.json()["error"]["code"] == "READER_IMPORT_DOWNLOAD_FAILED"


def test_reader_import_file_records_success_and_ocr_metrics(client, auth_headers):
    with patch("app.routers.reader._require_db", return_value=MagicMock()), \
         patch("app.routers.reader._extract_any", new_callable=AsyncMock) as mock_extract, \
         patch("app.routers.reader._save_reader_document", return_value="doc-reader-1"), \
         patch("app.routers.reader.record_usage_event") as mock_metric:
        mock_extract.return_value = ("Hola Reader", [], 3, None, 3)
        resp = client.post(
            "/v1/reader/import-file",
            files={"file": ("sample.pdf", b"%PDF", "application/pdf")},
            headers=auth_headers,
        )
    assert resp.status_code == 200
    resources = [call.kwargs.get("resource") for call in mock_metric.call_args_list]
    assert "reader_import_count" in resources
    assert "reader_ocr_pages" in resources


def test_reader_import_file_records_failure_metric(client, auth_headers):
    with patch("app.routers.reader._require_db", return_value=MagicMock()), \
         patch("app.routers.reader.record_usage_event") as mock_metric:
        resp = client.post(
            "/v1/reader/import-file",
            files={"file": ("sample.bin", b"\x00\x01", "application/octet-stream")},
            data={"save": "false"},
            headers=auth_headers,
        )
    assert resp.status_code == 400
    resources = [call.kwargs.get("resource") for call in mock_metric.call_args_list]
    assert "reader_import_count" in resources
    assert "reader_import_fail_rate" in resources


def test_reader_rollout_disabled_returns_404(client, auth_headers):
    with patch("app.routers.reader.settings.reader_v2_enabled", True), \
         patch("app.routers.reader.settings.reader_v2_rollout_percent", 0):
        resp = client.post(
            "/v1/reader/import-file",
            files={"file": ("sample.txt", b"hello", "text/plain")},
            headers=auth_headers,
        )
    assert resp.status_code == 404
    assert resp.headers.get("x-whisperall-error-code") == "READER_V2_DISABLED"


def test_reader_list_documents_returns_reader_source_rows(client, auth_headers):
    docs_table = _chain_table_with_data(
        [
            {"id": "d1", "title": "Doc 1", "source": "reader", "content": "hello", "updated_at": "2026-02-17T00:00:00Z"},
            {"id": "d2", "title": "Doc 2", "source": "reader", "content": "world", "updated_at": "2026-02-16T00:00:00Z"},
        ]
    )
    db = MagicMock()
    db.table.return_value = docs_table
    with patch("app.routers.reader._require_db", return_value=db):
        resp = client.get("/v1/reader/documents?limit=10", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    assert all(item["source"] == "reader" for item in data)


def test_reader_progress_upsert_and_get(client, auth_headers):
    progress_table = MagicMock()
    progress_table.upsert.return_value.execute.return_value = MagicMock(data=[{}])
    progress_table.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(
        data={
            "document_id": "doc-1",
            "char_offset": 123,
            "playback_seconds": 45.5,
            "section_index": 2,
            "updated_at": "2026-02-17T00:00:00+00:00",
        }
    )
    db = MagicMock()
    db.table.return_value = progress_table

    with patch("app.routers.reader._require_db", return_value=db), \
         patch("app.routers.reader._assert_document_owner", return_value={"id": "doc-1"}):
        upsert = client.put(
            "/v1/reader/progress/doc-1",
            json={"char_offset": 123, "playback_seconds": 45.5, "section_index": 2},
            headers=auth_headers,
        )
        getp = client.get("/v1/reader/progress/doc-1", headers=auth_headers)

    assert upsert.status_code == 200
    assert upsert.json()["char_offset"] == 123
    assert getp.status_code == 200
    assert getp.json()["section_index"] == 2


def test_reader_bookmark_create_and_delete(client, auth_headers):
    bookmarks = _chain_table_with_data(
        [{"id": "bm-1", "document_id": "doc-1", "char_offset": 30, "label": "Bookmark 30", "created_at": "2026-02-17T00:00:00Z"}]
    )
    bookmarks.insert.return_value.execute.return_value = MagicMock(data=bookmarks.execute.return_value.data)
    bookmarks.delete.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(data=[{}])
    db = MagicMock()
    db.table.return_value = bookmarks

    with patch("app.routers.reader._require_db", return_value=db), \
         patch("app.routers.reader._assert_document_owner", return_value={"id": "doc-1"}):
        created = client.post(
            "/v1/reader/bookmarks",
            json={"document_id": "doc-1", "char_offset": 30},
            headers=auth_headers,
        )
        removed = client.delete("/v1/reader/bookmarks/bm-1", headers=auth_headers)

    assert created.status_code == 200
    assert created.json()["id"] == "bm-1"
    assert removed.status_code == 200
    assert removed.json()["status"] == "deleted"


def test_reader_annotation_rejects_invalid_range(client, auth_headers):
    with patch("app.routers.reader._require_db", return_value=MagicMock()), \
         patch("app.routers.reader._assert_document_owner", return_value={"id": "doc-1"}):
        resp = client.post(
            "/v1/reader/annotations",
            json={"document_id": "doc-1", "start_offset": 20, "end_offset": 10, "note": "bad"},
            headers=auth_headers,
        )
    assert resp.status_code == 400
    assert resp.headers.get("x-whisperall-error-code") == "READER_ANNOTATION_INVALID_RANGE"
