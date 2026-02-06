import pytest
import httpx
import respx
from unittest.mock import patch

from app.config import settings
from app.providers import deepl


@pytest.fixture(autouse=True)
def _enable_key():
    with patch.object(settings, "deepl_api_key", "dl-test-key"):
        yield


class TestTranslate:
    @respx.mock
    @pytest.mark.asyncio
    async def test_sends_correct_request(self):
        route = respx.post("https://api-free.deepl.com/v2/translate").mock(
            return_value=httpx.Response(200, json={
                "translations": [{"text": "Hola mundo", "detected_source_language": "EN"}]
            })
        )

        result = await deepl.translate("Hello world", "es")

        assert result == "Hola mundo"
        assert route.called
        req = route.calls.last.request
        assert req.headers["authorization"] == "DeepL-Auth-Key dl-test-key"
        # Form-encoded body
        body = req.content.decode()
        assert "text=Hello+world" in body or "text=Hello%20world" in body
        assert "target_lang=ES" in body

    @respx.mock
    @pytest.mark.asyncio
    async def test_uppercases_target_language(self):
        route = respx.post("https://api-free.deepl.com/v2/translate").mock(
            return_value=httpx.Response(200, json={
                "translations": [{"text": "Bonjour", "detected_source_language": "EN"}]
            })
        )

        await deepl.translate("Hello", "fr")

        body = route.calls.last.request.content.decode()
        assert "target_lang=FR" in body

    @respx.mock
    @pytest.mark.asyncio
    async def test_raises_on_http_error(self):
        respx.post("https://api-free.deepl.com/v2/translate").mock(
            return_value=httpx.Response(456, json={"message": "quota exceeded"})
        )

        with pytest.raises(httpx.HTTPStatusError):
            await deepl.translate("test", "de")

    @pytest.mark.asyncio
    async def test_stub_when_no_key(self):
        with patch.object(settings, "deepl_api_key", None):
            result = await deepl.translate("hello", "es")
        assert "[deepl-stub]" in result
        assert "hello" in result
