import base64

import pytest
import httpx
import respx
from unittest.mock import patch, MagicMock

from app.config import settings
from app.providers import google_tts


SAMPLE_AUDIO = base64.b64encode(b"fake-mp3-audio").decode()


@pytest.fixture(autouse=True)
def _enable_key():
    with patch.object(settings, "google_tts_api_key", "gcp-test-key"):
        yield


class TestSynthesize:
    @respx.mock
    @pytest.mark.asyncio
    async def test_sends_correct_request(self):
        route = respx.post("https://texttospeech.googleapis.com/v1/text:synthesize").mock(
            return_value=httpx.Response(200, json={"audioContent": SAMPLE_AUDIO})
        )

        with patch("app.providers.google_tts.get_supabase_or_none", return_value=None):
            result = await google_tts.synthesize("Hello world")

        assert route.called
        req = route.calls.last.request
        url = str(req.url)
        assert "key=gcp-test-key" in url

        import json
        body = json.loads(req.content)
        assert body["input"]["text"] == "Hello world"
        assert body["voice"]["languageCode"] == "en-US"
        assert body["voice"]["name"] == "en-US-WaveNet-D"
        assert body["audioConfig"]["audioEncoding"] == "MP3"

    @respx.mock
    @pytest.mark.asyncio
    async def test_returns_fallback_url_without_db(self):
        respx.post("https://texttospeech.googleapis.com/v1/text:synthesize").mock(
            return_value=httpx.Response(200, json={"audioContent": SAMPLE_AUDIO})
        )

        with patch("app.providers.google_tts.get_supabase_or_none", return_value=None):
            result = await google_tts.synthesize("test")

        assert result == "https://storage.example.com/tts-output.mp3"

    @respx.mock
    @pytest.mark.asyncio
    async def test_uploads_to_storage_when_db_available(self):
        respx.post("https://texttospeech.googleapis.com/v1/text:synthesize").mock(
            return_value=httpx.Response(200, json={"audioContent": SAMPLE_AUDIO})
        )

        mock_db = MagicMock()
        mock_db.storage.from_.return_value.upload.return_value = None
        mock_db.storage.from_.return_value.get_public_url.return_value = "https://cdn.example.com/tts/abc.mp3"

        with patch("app.providers.google_tts.get_supabase_or_none", return_value=mock_db):
            result = await google_tts.synthesize("test")

        assert result == "https://cdn.example.com/tts/abc.mp3"
        mock_db.storage.from_.assert_called_with("audio")

    @respx.mock
    @pytest.mark.asyncio
    async def test_custom_voice(self):
        route = respx.post("https://texttospeech.googleapis.com/v1/text:synthesize").mock(
            return_value=httpx.Response(200, json={"audioContent": SAMPLE_AUDIO})
        )

        with patch("app.providers.google_tts.get_supabase_or_none", return_value=None):
            await google_tts.synthesize("hola", voice="es-ES-WaveNet-B", language_code="es-ES")

        import json
        body = json.loads(route.calls.last.request.content)
        assert body["voice"]["name"] == "es-ES-WaveNet-B"
        assert body["voice"]["languageCode"] == "es-ES"

    @respx.mock
    @pytest.mark.asyncio
    async def test_raises_on_http_error(self):
        respx.post("https://texttospeech.googleapis.com/v1/text:synthesize").mock(
            return_value=httpx.Response(400, json={"error": "bad request"})
        )

        with patch("app.providers.google_tts.get_supabase_or_none", return_value=None):
            with pytest.raises(httpx.HTTPStatusError):
                await google_tts.synthesize("test")

    @pytest.mark.asyncio
    async def test_stub_when_no_key(self):
        with patch.object(settings, "google_tts_api_key", None):
            result = await google_tts.synthesize("test")
        assert "stub" in result
