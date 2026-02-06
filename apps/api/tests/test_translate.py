def test_translate_requires_auth(client):
    res = client.post("/v1/translate", json={"text": "hello", "target_language": "ES"})
    assert res.status_code == 401


def test_translate(client, auth_headers, mock_deepl):
    res = client.post("/v1/translate", json={"text": "hello", "target_language": "ES"}, headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["text"] == "texto traducido"
    mock_deepl.assert_called_once_with("hello", "ES")
