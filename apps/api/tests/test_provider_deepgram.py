import pytest
import httpx
import respx
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

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

DIARIZED_RESPONSE = {
    "results": {
        "channels": [
            {
                "alternatives": [
                    {"transcript": "hola mundo"}
                ]
            }
        ],
        "utterances": [
            {"start": 0.0, "end": 1.2, "transcript": "hola", "speaker": 0},
            {"start": 1.2, "end": 2.1, "transcript": "mundo", "speaker": 1},
        ],
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
    async def test_detects_language_when_none(self):
        route = respx.post("https://api.deepgram.com/v1/listen").mock(
            return_value=httpx.Response(200, json=DEEPGRAM_RESPONSE)
        )

        await deepgram.transcribe_chunk(b"audio")

        url = str(route.calls.last.request.url)
        params = parse_qs(urlparse(url).query)
        assert "language" not in params
        assert params.get("detect_language") == ["true"]

    @respx.mock
    @pytest.mark.asyncio
    async def test_uses_custom_content_type_header(self):
        route = respx.post("https://api.deepgram.com/v1/listen").mock(
            return_value=httpx.Response(200, json=DEEPGRAM_RESPONSE)
        )

        await deepgram.transcribe_chunk(b"audio", content_type="audio/mp4")

        req = route.calls.last.request
        assert req.headers["content-type"] == "audio/mp4"

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


class TestTranscribeChunkDiarized:
    @respx.mock
    @pytest.mark.asyncio
    async def test_returns_speaker_segments(self):
        route = respx.post("https://api.deepgram.com/v1/listen").mock(
            return_value=httpx.Response(200, json=DIARIZED_RESPONSE)
        )

        result = await deepgram.transcribe_chunk_diarized(b"audio", language="es")

        assert result["text"] == "hola mundo"
        assert len(result["segments"]) == 2
        assert result["segments"][0]["speaker"] == "Speaker 1"
        assert result["segments"][1]["speaker"] == "Speaker 2"

        url = str(route.calls.last.request.url)
        assert "diarize=true" in url
        assert "utterances=true" in url
        assert "language=es" in url

    @respx.mock
    @pytest.mark.asyncio
    async def test_detects_language_when_none(self):
        route = respx.post("https://api.deepgram.com/v1/listen").mock(
            return_value=httpx.Response(200, json=DIARIZED_RESPONSE)
        )

        await deepgram.transcribe_chunk_diarized(b"audio")

        url = str(route.calls.last.request.url)
        params = parse_qs(urlparse(url).query)
        assert "language" not in params
        assert params.get("detect_language") == ["true"]

    @pytest.mark.asyncio
    async def test_stub_when_no_key(self):
        with patch.object(settings, "deepgram_api_key", None):
            result = await deepgram.transcribe_chunk_diarized(b"audio")
        assert "[deepgram-stub]" in result["text"]
        assert result["segments"][0]["speaker"] == "Speaker 1"

    @respx.mock
    @pytest.mark.asyncio
    async def test_uses_custom_content_type_header(self):
        route = respx.post("https://api.deepgram.com/v1/listen").mock(
            return_value=httpx.Response(200, json=DIARIZED_RESPONSE)
        )

        await deepgram.transcribe_chunk_diarized(b"audio", content_type="audio/mp4")

        req = route.calls.last.request
        assert req.headers["content-type"] == "audio/mp4"
