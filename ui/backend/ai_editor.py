"""
AI Edit service supporting local Ollama and cloud APIs.
"""

from __future__ import annotations

from typing import Optional, Tuple

import requests

from settings_service import settings_service


def _build_prompt(text: str, command: str) -> str:
    return (
        "You are a writing assistant. Apply the instruction to the text and return only the edited text.\n\n"
        f"Instruction: {command}\n\n"
        f"Text:\n{text}"
    )


class AIEditService:
    def _edit_openai_compatible(self, provider_id: str, base_url: str, key: str, model: str, text: str, command: str) -> Tuple[str, dict]:
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": "You edit text. Return only the edited text."},
                {"role": "user", "content": _build_prompt(text, command)},
            ],
            "temperature": 0.2,
        }
        resp = requests.post(
            f"{base_url.rstrip('/')}/v1/chat/completions",
            headers={"Authorization": f"Bearer {key}"},
            json=payload,
            timeout=120
        )
        if resp.status_code != 200:
            raise RuntimeError(f"{provider_id} error: HTTP {resp.status_code}")

        data = resp.json()
        content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        return content.strip(), {"provider": provider_id, "model": model}

    def _edit_openai(self, text: str, command: str) -> Tuple[str, dict]:
        key = settings_service.get_api_key("openai")
        if not key:
            raise RuntimeError("OpenAI API key is not configured")

        model = settings_service.get("providers.ai_edit.openai.model", "gpt-4o-mini")
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": "You edit text. Return only the edited text."},
                {"role": "user", "content": _build_prompt(text, command)},
            ],
            "temperature": 0.2,
        }
        resp = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {key}"},
            json=payload,
            timeout=120
        )
        if resp.status_code != 200:
            raise RuntimeError(f"OpenAI error: HTTP {resp.status_code}")

        data = resp.json()
        content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        return content.strip(), {"provider": "openai", "model": model}

    def _check_ollama_available(self, base_url: str) -> bool:
        """Check if Ollama is running and accessible"""
        try:
            resp = requests.get(f"{base_url}/api/tags", timeout=5)
            return resp.status_code == 200
        except requests.exceptions.ConnectionError:
            return False
        except requests.exceptions.Timeout:
            return False
        except Exception:
            return False

    def _edit_ollama(self, text: str, command: str) -> Tuple[str, dict]:
        base_url = settings_service.get("providers.ai_edit.ollama.base_url", "http://localhost:11434")
        model = settings_service.get("providers.ai_edit.ollama.model", "llama3")

        # Check if Ollama is running
        if not self._check_ollama_available(base_url):
            raise RuntimeError(
                f"Ollama is not running. Please start Ollama first:\n"
                f"1. Download from https://ollama.ai\n"
                f"2. Run 'ollama serve' in terminal\n"
                f"3. Pull a model: 'ollama pull {model}'\n"
                f"Configured URL: {base_url}"
            )

        payload = {
            "model": model,
            "prompt": _build_prompt(text, command),
            "stream": False,
        }

        try:
            resp = requests.post(f"{base_url}/api/generate", json=payload, timeout=120)
        except requests.exceptions.ConnectionError:
            raise RuntimeError(
                f"Cannot connect to Ollama at {base_url}. "
                "Make sure Ollama is running and the URL is correct."
            )

        if resp.status_code != 200:
            error_detail = resp.text[:200] if resp.text else "Unknown error"
            raise RuntimeError(f"Ollama error: HTTP {resp.status_code} - {error_detail}")

        data = resp.json()
        return data.get("response", "").strip(), {"provider": "ollama", "model": model}

    def _edit_claude(self, text: str, command: str) -> Tuple[str, dict]:
        key = settings_service.get_api_key("claude")
        if not key:
            raise RuntimeError("Claude API key is not configured")

        model = settings_service.get("providers.ai_edit.claude.model", "claude-3-haiku-20240307")
        payload = {
            "model": model,
            "max_tokens": 1024,
            "temperature": 0.2,
            "messages": [{"role": "user", "content": _build_prompt(text, command)}],
        }
        resp = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": key, "anthropic-version": "2023-06-01"},
            json=payload,
            timeout=120
        )
        if resp.status_code != 200:
            raise RuntimeError(f"Claude error: HTTP {resp.status_code}")

        data = resp.json()
        content = ""
        if data.get("content"):
            content = data["content"][0].get("text", "")
        return content.strip(), {"provider": "claude", "model": model}

    def _edit_gemini(self, text: str, command: str) -> Tuple[str, dict]:
        key = settings_service.get_api_key("gemini")
        if not key:
            raise RuntimeError("Gemini API key is not configured")

        model = settings_service.get("providers.ai_edit.gemini.model", "gemini-1.5-flash")
        payload = {
            "contents": [{"parts": [{"text": _build_prompt(text, command)}]}],
            "generationConfig": {"temperature": 0.2},
        }
        resp = requests.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}",
            json=payload,
            timeout=120
        )
        if resp.status_code != 200:
            raise RuntimeError(f"Gemini error: HTTP {resp.status_code}")

        data = resp.json()
        content = ""
        candidates = data.get("candidates") or []
        if candidates:
            parts = candidates[0].get("content", {}).get("parts") or []
            if parts:
                content = parts[0].get("text", "")
        return content.strip(), {"provider": "gemini", "model": model}

    def _edit_deepseek(self, text: str, command: str) -> Tuple[str, dict]:
        key = settings_service.get_api_key("deepseek")
        if not key:
            raise RuntimeError("DeepSeek API key is not configured")

        model = settings_service.get("providers.ai_edit.deepseek.model", "deepseek-chat")
        base_url = settings_service.get("providers.ai_edit.deepseek.base_url", "https://api.deepseek.com")
        return self._edit_openai_compatible("deepseek", base_url, key, model, text, command)

    def _edit_moonshot(self, text: str, command: str) -> Tuple[str, dict]:
        key = settings_service.get_api_key("moonshot")
        if not key:
            raise RuntimeError("Moonshot API key is not configured")

        model = settings_service.get("providers.ai_edit.moonshot.model", "kimi-k2-0905")
        base_url = settings_service.get("providers.ai_edit.moonshot.base_url", "https://api.moonshot.ai")
        return self._edit_openai_compatible("moonshot", base_url, key, model, text, command)

    def _edit_minimax(self, text: str, command: str) -> Tuple[str, dict]:
        key = settings_service.get_api_key("minimax")
        if not key:
            raise RuntimeError("MiniMax API key is not configured")

        model = settings_service.get("providers.ai_edit.minimax.model", "MiniMax-M2")
        base_url = settings_service.get("providers.ai_edit.minimax.base_url", "https://api.minimax.chat")
        return self._edit_openai_compatible("minimax", base_url, key, model, text, command)

    def _edit_zhipu(self, text: str, command: str) -> Tuple[str, dict]:
        key = settings_service.get_api_key("zhipu")
        if not key:
            raise RuntimeError("Zhipu (GLM-4.7) API key is not configured")

        model = settings_service.get("providers.ai_edit.zhipu.model", "glm-4-plus")
        base_url = settings_service.get("providers.ai_edit.zhipu.base_url", "https://open.bigmodel.cn/api/paas")
        return self._edit_openai_compatible("zhipu", base_url, key, model, text, command)

    def edit(self, text: str, command: str, provider: Optional[str] = None):
        provider = provider or settings_service.get_selected_provider("ai_edit")

        if provider == "ollama":
            return self._edit_ollama(text, command)
        if provider == "openai":
            return self._edit_openai(text, command)
        if provider == "claude":
            return self._edit_claude(text, command)
        if provider == "gemini":
            return self._edit_gemini(text, command)
        if provider == "deepseek":
            return self._edit_deepseek(text, command)
        if provider == "moonshot":
            return self._edit_moonshot(text, command)
        if provider == "minimax":
            return self._edit_minimax(text, command)
        if provider == "zhipu":
            return self._edit_zhipu(text, command)

        raise RuntimeError(f"AI provider not supported: {provider}")


_service: Optional[AIEditService] = None


def get_ai_edit_service() -> AIEditService:
    global _service
    if _service is None:
        _service = AIEditService()
    return _service
