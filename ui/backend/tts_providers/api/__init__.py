"""API-based TTS Providers"""

from .openai_tts import OpenAITTSProvider
from .elevenlabs import ElevenLabsProvider
from .fishaudio import FishAudioProvider
from .cartesia import CartesiaProvider
from .playht import PlayHTProvider
from .siliconflow import SiliconFlowProvider
from .minimax import MiniMaxTTSProvider
from .zyphra import ZyphraProvider
from .narilabs import NariLabsProvider
from .deepinfra import DeepInfraTTSProvider

__all__ = [
    "OpenAITTSProvider",
    "ElevenLabsProvider",
    "FishAudioProvider",
    "CartesiaProvider",
    "PlayHTProvider",
    "SiliconFlowProvider",
    "MiniMaxTTSProvider",
    "ZyphraProvider",
    "NariLabsProvider",
    "DeepInfraTTSProvider",
]
