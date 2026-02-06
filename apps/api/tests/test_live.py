from unittest.mock import patch


def test_live_chunk_requires_auth(client):
    files = {"audio": ("a.wav", b"abc", "audio/wav")}
    res = client.post("/v1/live/chunk", files=files, data={"chunk_index": "0"})
    assert res.status_code == 401


def test_live_chunk(client, auth_headers, mock_deepgram):
    files = {"audio": ("a.wav", b"abc", "audio/wav")}
    with patch("app.routers.live.get_supabase_or_none", return_value=None):
        res = client.post("/v1/live/chunk", files=files, data={"chunk_index": "0"}, headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["text"] == "live text"
    assert data["segment_id"]
    assert data["translated_text"] is None


def test_live_chunk_with_translation(client, auth_headers, mock_deepgram, mock_deepl_in_live):
    files = {"audio": ("a.wav", b"abc", "audio/wav")}
    with patch("app.routers.live.get_supabase_or_none", return_value=None):
        res = client.post(
            "/v1/live/chunk",
            files=files,
            data={"chunk_index": "0", "translate_to": "ES"},
            headers=auth_headers,
        )
    assert res.status_code == 200
    data = res.json()
    assert data["translated_text"] == "texto traducido"
