import pytest
import httpx
import respx
from unittest.mock import patch

from app.config import settings
from app.providers import openai_llm


@pytest.fixture(autouse=True)
def _enable_key():
    with patch.object(settings, "openai_api_key", "sk-test-key"):
        yield


def _chat_response(content: str) -> dict:
    return {"choices": [{"message": {"content": content}}]}


class TestEditText:
    @respx.mock
    @pytest.mark.asyncio
    async def test_sends_correct_request(self):
        route = respx.post("https://api.openai.com/v1/chat/completions").mock(
            return_value=httpx.Response(200, json=_chat_response("cleaned text"))
        )

        result = await openai_llm.edit_text("um hello uh world")

        assert result == "cleaned text"
        assert route.called
        req = route.calls.last.request
        assert req.headers["authorization"] == "Bearer sk-test-key"

        import json
        body = json.loads(req.content)
        assert body["model"] == "gpt-4o-mini"
        assert body["temperature"] == 0.3
        assert len(body["messages"]) == 2
        assert body["messages"][0]["role"] == "system"
        assert "filler" in body["messages"][0]["content"].lower()
        assert body["messages"][1]["role"] == "user"
        assert body["messages"][1]["content"] == "um hello uh world"

    @respx.mock
    @pytest.mark.asyncio
    async def test_custom_mode_uses_fallback_prompt(self):
        route = respx.post("https://api.openai.com/v1/chat/completions").mock(
            return_value=httpx.Response(200, json=_chat_response("summarized"))
        )

        result = await openai_llm.edit_text("long text here", mode="summarize")

        assert result == "summarized"
        import json
        body = json.loads(route.calls.last.request.content)
        assert "summarize" in body["messages"][0]["content"]

    @respx.mock
    @pytest.mark.asyncio
    async def test_raises_on_http_error(self):
        respx.post("https://api.openai.com/v1/chat/completions").mock(
            return_value=httpx.Response(500, json={"error": "server error"})
        )

        with pytest.raises(httpx.HTTPStatusError):
            await openai_llm.edit_text("test")

    @pytest.mark.asyncio
    async def test_stub_when_no_key(self):
        with patch.object(settings, "openai_api_key", None):
            result = await openai_llm.edit_text("hello world")
        assert result == "hello world"  # returns input unchanged
