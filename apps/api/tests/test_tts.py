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
