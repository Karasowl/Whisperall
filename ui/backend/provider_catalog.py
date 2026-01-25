from __future__ import annotations

from typing import Dict, List, Optional


PROVIDER_ALIASES = {
    "anthropic": "claude",
}


def normalize_provider_id(provider_id: str) -> str:
    if not provider_id:
        return provider_id
    return PROVIDER_ALIASES.get(provider_id, provider_id)


def get_provider_catalog() -> Dict[str, Dict[str, object]]:
    # Note: pricing values change often; keep units + links and avoid hard-coded prices.
    return {
        "openai": {
            "id": "openai",
            "name": "OpenAI",
            "type": "api",
            "features": ["ai_edit", "stt", "tts"],
            "description": "GPT models plus Whisper STT and OpenAI TTS.",
            "pricing_unit": "LLM: per 1M tokens (input/output); STT: per minute audio; TTS: per 1M characters",
            "pricing_note": "Rates vary by model; see pricing page.",
            "pricing_url": "https://openai.com/pricing",
            "docs_url": "https://platform.openai.com/docs",
            "console_url": "https://platform.openai.com/api-keys",
            "key_label": "API key",
            "key_instructions": "Create an API key in the OpenAI dashboard and paste it here.",
            "supported": {"ai_edit": True, "stt": True, "tts": True},
        },
        "elevenlabs": {
            "id": "elevenlabs",
            "name": "ElevenLabs",
            "type": "api",
            "features": ["tts", "stt"],
            "description": "High-quality TTS with voice cloning + Scribe STT (10h free in Starter plan).",
            "pricing_unit": "Per character (TTS) / Per hour (STT)",
            "pricing_note": "Starter plan includes 10h STT/month. See pricing for details.",
            "pricing_url": "https://elevenlabs.io/pricing",
            "docs_url": "https://docs.elevenlabs.io",
            "console_url": "https://elevenlabs.io/app/settings/api-keys",
            "key_label": "XI API key",
            "key_instructions": "Create an API key in ElevenLabs settings and paste it here.",
            "supported": {"tts": True, "stt": True},
        },
        "claude": {
            "id": "claude",
            "name": "Anthropic Claude",
            "type": "api",
            "features": ["ai_edit"],
            "description": "Claude LLMs for high-quality text editing.",
            "pricing_unit": "Per 1M tokens (input/output)",
            "pricing_note": "Rates vary by model; see pricing page.",
            "pricing_url": "https://www.anthropic.com/pricing",
            "docs_url": "https://docs.anthropic.com/claude/docs",
            "console_url": "https://console.anthropic.com/settings/keys",
            "key_label": "API key",
            "key_instructions": "Create a Claude API key in the Anthropic console and paste it here.",
            "supported": {"ai_edit": True},
        },
        "gemini": {
            "id": "gemini",
            "name": "Google Gemini",
            "type": "api",
            "features": ["ai_edit"],
            "description": "Google Gemini models for text editing and summarization.",
            "pricing_unit": "Per 1M tokens (input/output)",
            "pricing_note": "Rates vary by model; see pricing page.",
            "pricing_url": "https://ai.google.dev/pricing",
            "docs_url": "https://ai.google.dev/gemini-api/docs",
            "console_url": "https://aistudio.google.com/app/apikey",
            "key_label": "API key",
            "key_instructions": "Create an API key in Google AI Studio and paste it here.",
            "supported": {"ai_edit": True},
        },
        "deepseek": {
            "id": "deepseek",
            "name": "DeepSeek",
            "type": "api",
            "features": ["ai_edit", "translation"],
            "description": "DeepSeek V3/R1 - Fast, cheap, OpenAI-compatible. Great for coding and reasoning.",
            "pricing_unit": "Per 1M tokens (input/output)",
            "pricing_note": "~$0.14/1M input, $0.28/1M output (cache hits even cheaper)",
            "pricing_url": "https://platform.deepseek.com/pricing",
            "docs_url": "https://platform.deepseek.com/docs",
            "console_url": "https://platform.deepseek.com/api_keys",
            "key_label": "API key",
            "key_instructions": "Create a key in DeepSeek and paste it here.",
            "supported": {"ai_edit": True, "translation": True},
        },
        "deepinfra": {
            "id": "deepinfra",
            "name": "DeepInfra",
            "type": "api",
            "features": ["ai_edit"],
            "description": "Fast inference for open-source models: Llama, Mistral, Qwen, and more.",
            "pricing_unit": "Per 1M tokens (input/output)",
            "pricing_note": "Rates vary by model; typically $0.05-0.90 per 1M tokens.",
            "pricing_url": "https://deepinfra.com/pricing",
            "docs_url": "https://deepinfra.com/docs",
            "console_url": "https://deepinfra.com/dash/api_keys",
            "key_label": "API key",
            "key_instructions": "Create a key in DeepInfra dashboard and paste it here.",
            "supported": {"ai_edit": True},
        },
        "zhipu": {
            "id": "zhipu",
            "name": "GLM-4.7 (Zhipu AI)",
            "type": "api",
            "features": ["ai_edit", "translation"],
            "description": "GLM-4.7 - 200K context, top coding scores, OpenAI-compatible. Chinese AI leader.",
            "pricing_unit": "Per 1M tokens (input/output)",
            "pricing_note": "~$3/month unlimited or pay-per-use; see Z.ai pricing",
            "pricing_url": "https://open.bigmodel.cn/pricing",
            "docs_url": "https://open.bigmodel.cn/dev/api",
            "console_url": "https://open.bigmodel.cn/usercenter/apikeys",
            "key_label": "API key",
            "key_instructions": "Create a key in Zhipu Open Platform (open.bigmodel.cn) and paste it here.",
            "supported": {"ai_edit": True, "translation": True},
        },
        "moonshot": {
            "id": "moonshot",
            "name": "Moonshot (Kimi)",
            "type": "api",
            "features": ["ai_edit"],
            "description": "OpenAI-compatible Kimi LLMs (Moonshot AI).",
            "pricing_unit": "Per 1M tokens (input/output)",
            "pricing_note": "Rates vary by model; see pricing page.",
            "pricing_url": "https://platform.moonshot.ai/pricing",
            "docs_url": "https://platform.moonshot.ai/docs",
            "console_url": "https://platform.moonshot.ai/console",
            "key_label": "API key",
            "key_instructions": "Create a key in the Moonshot console and paste it here.",
            "supported": {"ai_edit": True},
        },
        "minimax": {
            "id": "minimax",
            "name": "MiniMax",
            "type": "api",
            "features": ["ai_edit", "tts"],
            "description": "MiniMax models for text and speech; direct API or via Together.",
            "pricing_unit": "Per 1M tokens (LLM) or per character (TTS)",
            "pricing_note": "Rates vary by plan; see pricing page.",
            "pricing_url": "https://platform.minimax.io/docs/pricing/overview",
            "docs_url": "https://platform.minimax.io/docs",
            "console_url": "https://platform.minimax.io/user-center/basic-information",
            "key_label": "API key",
            "key_instructions": "Create a key in MiniMax console and paste it here.",
            "supported": {"ai_edit": True, "tts": True},
        },
        "groq": {
            "id": "groq",
            "name": "Groq",
            "type": "api",
            "features": ["stt", "ai_edit"],
            "description": "Fast inference; OpenAI-compatible LLM + Whisper STT.",
            "pricing_unit": "LLM: per 1M tokens; STT: per hour audio",
            "pricing_note": "Rates vary by model; see pricing page.",
            "pricing_url": "https://groq.com/pricing",
            "docs_url": "https://console.groq.com/docs/overview",
            "console_url": "https://console.groq.com/keys",
            "key_label": "API key",
            "key_instructions": "Create a key in Groq console and paste it here.",
            "supported": {"stt": True, "ai_edit": False},
        },
        "deepgram": {
            "id": "deepgram",
            "name": "Deepgram",
            "type": "api",
            "features": ["stt", "diarization"],
            "description": "Streaming STT with diarization and language detection.",
            "pricing_unit": "Per minute audio (model dependent)",
            "pricing_note": "Rates vary by model and tier; see pricing page.",
            "pricing_url": "https://deepgram.com/pricing",
            "docs_url": "https://developers.deepgram.com/documentation",
            "console_url": "https://console.deepgram.com/signup",
            "key_label": "API key",
            "key_instructions": "Create a key in Deepgram console and paste it here.",
            "supported": {"stt": True, "diarization": False},
        },
        "dashscope": {
            "id": "dashscope",
            "name": "Alibaba DashScope",
            "type": "api",
            "features": ["stt"],
            "description": "SenseVoice/Paraformer ASR and other Alibaba audio models.",
            "pricing_unit": "Per minute audio (model dependent)",
            "pricing_note": "Rates vary by model; see pricing page.",
            "pricing_url": "https://dashscope.aliyun.com",
            "docs_url": "https://help.aliyun.com/zh/dashscope/developer-reference/api-reference",
            "console_url": "https://dashscope.aliyun.com",
            "key_label": "API key",
            "key_instructions": "Create a key in DashScope and paste it here.",
            "supported": {"stt": False},
        },
        "fishaudio": {
            "id": "fishaudio",
            "name": "Fish Audio",
            "type": "api",
            "features": ["tts"],
            "description": "API TTS alternative with voice cloning.",
            "pricing_unit": "Per character / subscription credits",
            "pricing_note": "Rates vary by plan; see pricing page.",
            "pricing_url": "https://fish.audio",
            "docs_url": "https://docs.fish.audio/api-reference/introduction",
            "console_url": "https://fish.audio/app/api-keys/",
            "key_label": "API key",
            "key_instructions": "Create an API key in Fish Audio and paste it here.",
            "supported": {"tts": True},
        },
        "siliconflow": {
            "id": "siliconflow",
            "name": "SiliconFlow (CosyVoice)",
            "type": "api",
            "features": ["tts"],
            "description": "API access to CosyVoice and open models.",
            "pricing_unit": "Per character / per second audio",
            "pricing_note": "Rates vary by model; see pricing page.",
            "pricing_url": "https://siliconflow.cn",
            "docs_url": "https://docs.siliconflow.cn/cn/api-reference/audio/create-speech",
            "console_url": "https://cloud.siliconflow.cn/account/ak",
            "key_label": "API key",
            "key_instructions": "Create a key in SiliconFlow console and paste it here.",
            "supported": {"tts": True},
        },
        "assemblyai": {
            "id": "assemblyai",
            "name": "AssemblyAI",
            "type": "api",
            "features": ["stt", "diarization"],
            "description": "Accurate transcription with speaker labels.",
            "pricing_unit": "Per minute audio",
            "pricing_note": "Rates vary by tier; see pricing page.",
            "pricing_url": "https://www.assemblyai.com/pricing",
            "docs_url": "https://www.assemblyai.com/docs",
            "console_url": "https://www.assemblyai.com/dashboard",
            "key_label": "API key",
            "key_instructions": "Create a key in AssemblyAI dashboard and paste it here.",
            "supported": {"stt": False, "diarization": False},
        },
        "gladia": {
            "id": "gladia",
            "name": "Gladia",
            "type": "api",
            "features": ["stt", "diarization"],
            "description": "Whisper + diarization as an API.",
            "pricing_unit": "Per minute audio",
            "pricing_note": "Rates vary by tier; see pricing page.",
            "pricing_url": "https://gladia.io/pricing",
            "docs_url": "https://docs.gladia.io",
            "console_url": "https://app.gladia.io",
            "key_label": "API key",
            "key_instructions": "Create a key in Gladia dashboard and paste it here.",
            "supported": {"stt": False, "diarization": False},
        },
        "deepl": {
            "id": "deepl",
            "name": "DeepL",
            "type": "api",
            "features": ["translation"],
            "description": "High-quality machine translation.",
            "pricing_unit": "Per 1M characters",
            "pricing_note": "Rates vary by plan; see pricing page.",
            "pricing_url": "https://www.deepl.com/pro#developer",
            "docs_url": "https://www.deepl.com/docs-api",
            "console_url": "https://www.deepl.com/account/summary",
            "key_label": "Auth key",
            "key_instructions": "Create an API key in your DeepL account and paste it here.",
            "supported": {"translation": True},
        },
        "google": {
            "id": "google",
            "name": "Google Translate",
            "type": "api",
            "features": ["translation"],
            "description": "Google Cloud Translation API.",
            "pricing_unit": "Per 1M characters",
            "pricing_note": "Rates vary by tier; see pricing page.",
            "pricing_url": "https://cloud.google.com/translate/pricing",
            "docs_url": "https://cloud.google.com/translate/docs",
            "console_url": "https://console.cloud.google.com/apis/credentials",
            "key_label": "API key",
            "key_instructions": "Create a Google Cloud API key and paste it here.",
            "supported": {"translation": True},
        },
        "zyphra": {
            "id": "zyphra",
            "name": "Zyphra (Zonos)",
            "type": "api",
            "features": ["tts"],
            "description": "Zonos TTS API - High quality multilingual voice synthesis with emotion control.",
            "pricing_unit": "Per character / subscription",
            "pricing_note": "Check Zyphra pricing for current rates.",
            "pricing_url": "https://www.zyphra.com/pricing",
            "docs_url": "https://www.zyphra.com/docs",
            "console_url": "https://www.zyphra.com/dashboard",
            "key_label": "API key",
            "key_instructions": "Create an API key in your Zyphra dashboard and paste it here.",
            "supported": {"tts": True},
        },
        "narilabs": {
            "id": "narilabs",
            "name": "Nari Labs (Dia)",
            "type": "api",
            "features": ["tts"],
            "description": "Dia TTS API - Dialogue generation with emotions and multiple speakers.",
            "pricing_unit": "Per character / subscription",
            "pricing_note": "Check Nari Labs pricing for current rates.",
            "pricing_url": "https://nari.ai/pricing",
            "docs_url": "https://nari.ai/docs",
            "console_url": "https://nari.ai/dashboard",
            "key_label": "API key",
            "key_instructions": "Create an API key in your Nari Labs dashboard and paste it here.",
            "supported": {"tts": True},
        },
        "cartesia": {
            "id": "cartesia",
            "name": "Cartesia",
            "type": "api",
            "features": ["tts"],
            "description": "Cartesia Sonic TTS - Ultra-low latency streaming TTS with voice cloning.",
            "pricing_unit": "Per character / subscription",
            "pricing_note": "Check Cartesia pricing for current rates.",
            "pricing_url": "https://cartesia.ai/pricing",
            "docs_url": "https://docs.cartesia.ai",
            "console_url": "https://play.cartesia.ai/console",
            "key_label": "API key",
            "key_instructions": "Create an API key in your Cartesia console and paste it here.",
            "supported": {"tts": True},
        },
        "playht": {
            "id": "playht",
            "name": "PlayHT",
            "type": "api",
            "features": ["tts"],
            "description": "PlayHT TTS - High quality voice synthesis with instant voice cloning.",
            "pricing_unit": "Per character / subscription",
            "pricing_note": "Check PlayHT pricing for current rates.",
            "pricing_url": "https://play.ht/pricing",
            "docs_url": "https://docs.play.ht",
            "console_url": "https://play.ht/studio",
            "key_label": "API key",
            "key_instructions": "Create an API key in your PlayHT dashboard and paste it here.",
            "supported": {"tts": True},
        },
    }


_TTS_CATALOG_ALIASES = {
    "openai": "openai-tts",
}


def _get_implemented_provider_sets() -> Dict[str, set[str]]:
    try:
        from providers.ai.registry import list_providers as list_ai
        ai_providers = set(list_ai())
    except Exception:
        ai_providers = set()

    try:
        from providers.stt.registry import list_providers as list_stt
        stt_providers = set(list_stt())
    except Exception:
        stt_providers = set()

    try:
        from providers.translation.registry import list_providers as list_translation
        translation_providers = set(list_translation())
    except Exception:
        translation_providers = set()

    try:
        from tts_providers.registry import list_providers as list_tts
        tts_providers = set(list_tts())
    except Exception:
        tts_providers = set()

    return {
        "ai_edit": ai_providers,
        "stt": stt_providers,
        "translation": translation_providers,
        "tts": tts_providers,
    }


def get_supported_provider_catalog() -> Dict[str, Dict[str, object]]:
    catalog = get_provider_catalog()
    implemented = _get_implemented_provider_sets()
    supported: Dict[str, Dict[str, object]] = {}

    for provider_id, entry in catalog.items():
        implemented_services: list[str] = []

        if provider_id in implemented["ai_edit"]:
            implemented_services.append("ai_edit")
        if provider_id in implemented["stt"]:
            implemented_services.append("stt")
        if provider_id in implemented["translation"]:
            implemented_services.append("translation")

        tts_id = _TTS_CATALOG_ALIASES.get(provider_id, provider_id)
        if tts_id in implemented["tts"]:
            implemented_services.append("tts")

        if not implemented_services:
            continue

        enriched = dict(entry)
        enriched["implemented"] = True
        enriched["implemented_services"] = implemented_services
        supported[provider_id] = enriched

    return supported


def list_provider_ids() -> List[str]:
    return sorted(get_provider_catalog().keys())


def get_provider(provider_id: str) -> Optional[Dict[str, object]]:
    normalized = normalize_provider_id(provider_id)
    return get_provider_catalog().get(normalized)
