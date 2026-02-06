def test_dictate_requires_auth(client):
    res = client.post("/v1/dictate", files={"audio": ("a.wav", b"123", "audio/wav")})
    assert res.status_code == 401


def test_dictate_returns_text(client, auth_headers, mock_openai_stt):
    files = {"audio": ("a.wav", b"123", "audio/wav")}
    res = client.post("/v1/dictate", files=files, data={"is_final": "false"}, headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["text"] == "hello world"
    assert data["is_final"] is False
    assert "session_id" in data


def test_dictate_final(client, auth_headers, mock_openai_stt):
    files = {"audio": ("a.wav", b"123", "audio/wav")}
    res = client.post("/v1/dictate", files=files, data={"is_final": "true"}, headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["is_final"] is True


def test_dictate_with_prompt(client, auth_headers, mock_openai_stt):
    files = {"audio": ("a.wav", b"123", "audio/wav")}
    res = client.post(
        "/v1/dictate",
        files=files,
        data={"prompt": "previous context", "language": "en"},
        headers=auth_headers,
    )
    assert res.status_code == 200
    mock_openai_stt.assert_called_once()
    call_kwargs = mock_openai_stt.call_args
    assert call_kwargs[1]["prompt"] == "previous context"
    assert call_kwargs[1]["language"] == "en"
