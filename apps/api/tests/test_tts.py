from unittest.mock import AsyncMock, patch


def test_tts_requires_auth(client):
    res = client.post("/v1/tts", json={"text": "hello"})
    assert res.status_code == 401


def test_tts(client, auth_headers, mock_google_tts):
    res = client.post("/v1/tts", json={"text": "hello"}, headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["audio_url"] == "https://storage.example.com/audio.mp3"


def test_tts_with_voice(client, auth_headers, mock_google_tts):
    res = client.post("/v1/tts", json={"text": "hello", "voice": "en-US-WaveNet-A"}, headers=auth_headers)
    assert res.status_code == 200
    mock_google_tts.assert_called_once_with("hello", "en-US-WaveNet-A", None)


def test_tts_voices_requires_auth(client):
    res = client.get("/v1/tts/voices")
    assert res.status_code == 401


def test_tts_voices(client, auth_headers):
    with patch("app.routers.tts.edge_tts_synth.list_voices", new_callable=AsyncMock) as mock_edge, \
         patch("app.routers.tts.google_tts.list_voices", new_callable=AsyncMock) as mock_google:
        mock_edge.return_value = [
            {"provider": "edge", "name": "en-US-AriaNeural", "locale": "en-US", "gender": "Female", "label": "Aria"},
        ]
        mock_google.return_value = [
            {"provider": "google", "name": "en-US-Wavenet-D", "locale": "en-US", "gender": "MALE", "label": "Wavenet D"},
        ]

        res = client.get("/v1/tts/voices", headers=auth_headers)
        assert res.status_code == 200
        data = res.json()
        assert data["voices"][0]["provider"] == "edge"
        assert len(data["voices"]) == 2
