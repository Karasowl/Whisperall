import pytest
import httpx
import respx
from unittest.mock import patch

from app.config import settings
from app.providers import deepgram

DEEPGRAM_RESPONSE = {
    "results": {
        "channels": [
            {
                "alternatives": [
                    {"transcript": "live transcription text"}
                ]
            }
        ]
    }
}


@pytest.fixture(autouse=True)
def _enable_key():
    with patch.object(settings, "deepgram_api_key", "dg-test-key"):
        yield


class TestTranscribeChunk:
    @respx.mock
    @pytest.mark.asyncio
    async def test_sends_correct_request(self):
        route = respx.post("https://api.deepgram.com/v1/listen").mock(
            return_value=httpx.Response(200, json=DEEPGRAM_RESPONSE)
        )

        result = await deepgram.transcribe_chunk(b"raw-audio-bytes")

        assert result == "live transcription text"
        assert route.called
        req = route.calls.last.request
        assert req.headers["authorization"] == "Token dg-test-key"
        assert req.headers["content-type"] == "audio/wav"
        assert req.content == b"raw-audio-bytes"

    @respx.mock
    @pytest.mark.asyncio
    async def test_sends_query_params(self):
        route = respx.post("https://api.deepgram.com/v1/listen").mock(
            return_value=httpx.Response(200, json=DEEPGRAM_RESPONSE)
        )

        await deepgram.transcribe_chunk(b"audio", language="es")

        url = str(route.calls.last.request.url)
        assert "model=nova-2" in url
        assert "smart_format=true" in url
        assert "punctuate=true" in url
        assert "language=es" in url

    @respx.mock
    @pytest.mark.asyncio
    async def test_omits_language_when_none(self):
        route = respx.post("https://api.deepgram.com/v1/listen").mock(
            return_value=httpx.Response(200, json=DEEPGRAM_RESPONSE)
        )

        await deepgram.transcribe_chunk(b"audio")

        url = str(route.calls.last.request.url)
        assert "language" not in url

    @respx.mock
    @pytest.mark.asyncio
    async def test_raises_on_http_error(self):
        respx.post("https://api.deepgram.com/v1/listen").mock(
            return_value=httpx.Response(403, json={"error": "forbidden"})
        )

        with pytest.raises(httpx.HTTPStatusError):
            await deepgram.transcribe_chunk(b"audio")

    @pytest.mark.asyncio
    async def test_stub_when_no_key(self):
        with patch.object(settings, "deepgram_api_key", None):
            result = await deepgram.transcribe_chunk(b"audio")
        assert "[deepgram-stub]" in result
