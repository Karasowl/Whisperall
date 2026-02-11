import pytest
import httpx
import respx
from unittest.mock import patch

from app.config import settings
from app.providers import groq_stt


@pytest.fixture(autouse=True)
def _enable_key():
    with patch.object(settings, "groq_api_key", "gsk-test-key"):
        yield


class TestTranscribeChunk:
    @respx.mock
    @pytest.mark.asyncio
    async def test_sends_correct_request(self):
        route = respx.post("https://api.groq.com/openai/v1/audio/transcriptions").mock(
            return_value=httpx.Response(200, json={"text": "groq result"})
        )

        result = await groq_stt.transcribe_chunk(b"fake-audio", language="en")

        assert result == "groq result"
        assert route.called
        req = route.calls.last.request
        assert req.headers["authorization"] == "Bearer gsk-test-key"
        assert b"whisper-large-v3-turbo" in req.content
        assert b"en" in req.content

    @respx.mock
    @pytest.mark.asyncio
    async def test_sends_custom_model(self):
        route = respx.post("https://api.groq.com/openai/v1/audio/transcriptions").mock(
            return_value=httpx.Response(200, json={"text": "v3 result"})
        )

        result = await groq_stt.transcribe_chunk(b"audio", model="whisper-large-v3")

        assert result == "v3 result"
        assert b"whisper-large-v3" in route.calls.last.request.content

    @respx.mock
    @pytest.mark.asyncio
    async def test_omits_language_when_none(self):
        route = respx.post("https://api.groq.com/openai/v1/audio/transcriptions").mock(
            return_value=httpx.Response(200, json={"text": "no lang"})
        )

        await groq_stt.transcribe_chunk(b"audio")

        content = route.calls.last.request.content
        assert b"language" not in content

    @respx.mock
    @pytest.mark.asyncio
    async def test_uses_custom_filename_and_content_type(self):
        route = respx.post("https://api.groq.com/openai/v1/audio/transcriptions").mock(
            return_value=httpx.Response(200, json={"text": "ok"})
        )

        await groq_stt.transcribe_chunk(
            b"audio",
            filename="meeting.m4a",
            content_type="audio/mp4",
        )

        content = route.calls.last.request.content
        assert b'filename="meeting.m4a"' in content
        assert b"Content-Type: audio/mp4" in content

    @respx.mock
    @pytest.mark.asyncio
    async def test_raises_on_http_error(self):
        respx.post("https://api.groq.com/openai/v1/audio/transcriptions").mock(
            return_value=httpx.Response(429, json={"error": "rate limited"})
        )

        with pytest.raises(httpx.HTTPStatusError):
            await groq_stt.transcribe_chunk(b"audio")

    @pytest.mark.asyncio
    async def test_stub_when_no_key(self):
        with patch.object(settings, "groq_api_key", None):
            result = await groq_stt.transcribe_chunk(b"audio")
        assert "[groq-stub]" in result
