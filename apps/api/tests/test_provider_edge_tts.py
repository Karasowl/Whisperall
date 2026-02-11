import base64

import pytest
from unittest.mock import patch, MagicMock, AsyncMock

from app.providers import edge_tts_synth


def _mock_communicate(audio_bytes: bytes = b"fake-mp3-audio"):
    """Create a mock edge_tts.Communicate that yields audio chunks."""
    mock = MagicMock()

    async def stream():
        yield {"type": "audio", "data": audio_bytes}

    mock.return_value.stream = stream
    return mock


class TestSynthesize:
    @pytest.mark.asyncio
    async def test_returns_data_url_without_db(self):
        with patch("app.providers.edge_tts_synth.edge_tts") as mock_edge, \
             patch("app.providers.edge_tts_synth.get_supabase_or_none", return_value=None):
            mock_edge.Communicate = _mock_communicate(b"fake-mp3")
            result = await edge_tts_synth.synthesize("Hello world")

        assert result.startswith("data:audio/mpeg;base64,")
        audio = base64.b64decode(result.split(",")[1])
        assert audio == b"fake-mp3"

    @pytest.mark.asyncio
    async def test_uploads_to_storage_when_db_available(self):
        mock_db = MagicMock()
        mock_db.storage.from_.return_value.upload.return_value = None
        mock_db.storage.from_.return_value.get_public_url.return_value = "https://cdn.example.com/tts/abc.mp3"

        with patch("app.providers.edge_tts_synth.edge_tts") as mock_edge, \
             patch("app.providers.edge_tts_synth.get_supabase_or_none", return_value=mock_db):
            mock_edge.Communicate = _mock_communicate()
            result = await edge_tts_synth.synthesize("test")

        assert result == "https://cdn.example.com/tts/abc.mp3"
        mock_db.storage.from_.assert_called_with("audio")

    @pytest.mark.asyncio
    async def test_uses_default_voice(self):
        with patch("app.providers.edge_tts_synth.edge_tts") as mock_edge, \
             patch("app.providers.edge_tts_synth.get_supabase_or_none", return_value=None):
            mock_edge.Communicate = _mock_communicate()
            await edge_tts_synth.synthesize("hi")

        mock_edge.Communicate.assert_called_once_with("hi", "en-US-AriaNeural")

    @pytest.mark.asyncio
    async def test_custom_voice(self):
        with patch("app.providers.edge_tts_synth.edge_tts") as mock_edge, \
             patch("app.providers.edge_tts_synth.get_supabase_or_none", return_value=None):
            mock_edge.Communicate = _mock_communicate()
            await edge_tts_synth.synthesize("hola", voice="es-MX-DaliaNeural")

        mock_edge.Communicate.assert_called_once_with("hola", "es-MX-DaliaNeural")

    @pytest.mark.asyncio
    async def test_raises_on_empty_audio(self):
        mock_comm = MagicMock()

        async def empty_stream():
            if False:
                yield  # pragma: no cover

        mock_comm.return_value.stream = empty_stream

        with patch("app.providers.edge_tts_synth.edge_tts") as mock_edge, \
             patch("app.providers.edge_tts_synth.get_supabase_or_none", return_value=None):
            mock_edge.Communicate = mock_comm
            with pytest.raises(RuntimeError, match="no audio data"):
                await edge_tts_synth.synthesize("test")
