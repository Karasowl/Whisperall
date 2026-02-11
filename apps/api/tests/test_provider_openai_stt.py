import pytest
import httpx
import respx
from unittest.mock import patch

from app.config import settings
from app.providers import openai_stt


@pytest.fixture(autouse=True)
def _enable_key():
    with patch.object(settings, "openai_api_key", "sk-test-key"):
        yield


class TestTranscribe:
    @respx.mock
    @pytest.mark.asyncio
    async def test_sends_correct_request(self):
        route = respx.post("https://api.openai.com/v1/audio/transcriptions").mock(
            return_value=httpx.Response(200, json={"text": "hello world"})
        )

        result = await openai_stt.transcribe(b"fake-audio", language="en", prompt="context")

        assert result == "hello world"
        assert route.called
        req = route.calls.last.request
        assert req.headers["authorization"] == "Bearer sk-test-key"
        assert b"gpt-4o-mini-transcribe" in req.content
        assert b"en" in req.content
        assert b"context" in req.content

    @respx.mock
    @pytest.mark.asyncio
    async def test_sends_custom_model(self):
        route = respx.post("https://api.openai.com/v1/audio/transcriptions").mock(
            return_value=httpx.Response(200, json={"text": "custom"})
        )

        result = await openai_stt.transcribe(b"audio", model="whisper-1")

        assert result == "custom"
        assert b"whisper-1" in route.calls.last.request.content

    @respx.mock
    @pytest.mark.asyncio
    async def test_omits_optional_fields_when_none(self):
        route = respx.post("https://api.openai.com/v1/audio/transcriptions").mock(
            return_value=httpx.Response(200, json={"text": "bare"})
        )

        result = await openai_stt.transcribe(b"audio")

        assert result == "bare"
        content = route.calls.last.request.content
        assert b"language" not in content
        assert b"prompt" not in content

    @respx.mock
    @pytest.mark.asyncio
    async def test_raises_on_http_error(self):
        respx.post("https://api.openai.com/v1/audio/transcriptions").mock(
            return_value=httpx.Response(401, json={"error": "unauthorized"})
        )

        with pytest.raises(httpx.HTTPStatusError):
            await openai_stt.transcribe(b"audio")

    @pytest.mark.asyncio
    async def test_stub_when_no_key(self):
        with patch.object(settings, "openai_api_key", None):
            result = await openai_stt.transcribe(b"audio")
        assert "[openai-stub]" in result


class TestDiarize:
    @respx.mock
    @pytest.mark.asyncio
    async def test_sends_diarize_request(self):
        route = respx.post("https://api.openai.com/v1/audio/transcriptions").mock(
            return_value=httpx.Response(200, json={"text": "hello from speaker"})
        )

        result = await openai_stt.diarize(b"audio", language="es")

        assert result == "hello from speaker"
        req = route.calls.last.request
        assert req.headers["authorization"] == "Bearer sk-test-key"
        assert b"gpt-4o-transcribe" in req.content
        assert b"es" in req.content

    @respx.mock
    @pytest.mark.asyncio
    async def test_returns_empty_text(self):
        respx.post("https://api.openai.com/v1/audio/transcriptions").mock(
            return_value=httpx.Response(200, json={})
        )

        result = await openai_stt.diarize(b"audio")
        assert result == ""

    @pytest.mark.asyncio
    async def test_stub_when_no_key(self):
        with patch.object(settings, "openai_api_key", None):
            result = await openai_stt.diarize(b"audio")
        assert "[openai-stub]" in result
