def test_ai_edit_requires_auth(client):
    res = client.post("/v1/ai-edit", json={"text": "um hello"})
    assert res.status_code == 401


def test_ai_edit_clean_fillers(client, auth_headers, mock_openai_llm):
    res = client.post("/v1/ai-edit", json={"text": "um hello", "mode": "clean_fillers"}, headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["text"] == "cleaned text"


def test_ai_edit_custom_mode(client, auth_headers, mock_openai_llm):
    res = client.post("/v1/ai-edit", json={"text": "some text", "mode": "summarize"}, headers=auth_headers)
    assert res.status_code == 200
    mock_openai_llm.assert_called_once_with("some text", "summarize", None)


def test_ai_edit_custom_prompt(client, auth_headers, mock_openai_llm):
    res = client.post("/v1/ai-edit", json={
        "text": "some text", "mode": "custom",
        "prompt": "Rewrite as a poem",
    }, headers=auth_headers)
    assert res.status_code == 200
    mock_openai_llm.assert_called_once_with("some text", "custom", "Rewrite as a poem")


def test_ai_edit_accepts_long_text(client, auth_headers, mock_openai_llm):
    long_text = "palabra " * 2_000
    res = client.post("/v1/ai-edit", json={"text": long_text}, headers=auth_headers)
    assert res.status_code == 200
    mock_openai_llm.assert_called_once_with(long_text, "clean_fillers", None)
