from datetime import datetime
from unittest.mock import MagicMock, patch

from app.auth import PLAN_LIMITS

USAGE_KEYS = {
    "stt_seconds",
    "tts_chars",
    "translate_chars",
    "transcribe_seconds",
    "ai_edit_tokens",
    "notes_count",
}


def test_usage_returns_stable_contract_and_no_cache_headers(client, auth_headers):
    with patch("app.routers.usage.get_supabase_or_none", return_value=None):
        res = client.get("/v1/usage", headers=auth_headers)

    assert res.status_code == 200
    payload = res.json()
    assert payload["plan"] == "free"
    assert set(payload["usage"].keys()) == USAGE_KEYS
    assert set(payload["limits"].keys()) == USAGE_KEYS
    assert "period_start" in payload
    assert "period_end" in payload
    assert "next_reset_at" in payload
    assert "generated_at" in payload

    period_start = datetime.fromisoformat(payload["period_start"])
    period_end = datetime.fromisoformat(payload["period_end"])
    next_reset = datetime.fromisoformat(payload["next_reset_at"])
    generated_at = datetime.fromisoformat(payload["generated_at"])

    assert period_end > period_start
    assert next_reset == period_end
    assert generated_at >= period_start
    assert generated_at <= period_end

    cache_control = res.headers.get("cache-control", "")
    assert "no-store" in cache_control
    assert "max-age=0" in cache_control
    assert res.headers.get("pragma") == "no-cache"
    assert res.headers.get("expires") == "0"
    assert "authorization" in res.headers.get("vary", "").lower()


def test_usage_normalizes_db_values_and_plan(client, auth_headers):
    mock_db = MagicMock()

    profiles_chain = MagicMock()
    profiles_chain.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(
        data={"plan": " BASIC "}
    )

    usage_chain = MagicMock()
    usage_chain.select.return_value.eq.return_value.order.return_value.limit.return_value.maybe_single.return_value.execute.return_value = MagicMock(
        data={
            "stt_seconds": None,
            "tts_chars": "12",
            "translate_chars": -5,
            "transcribe_seconds": 1.8,
            "ai_edit_tokens": "42",
            "notes_count": "7",
        }
    )

    def table_dispatch(name: str):
        if name == "profiles":
            return profiles_chain
        if name == "usage":
            return usage_chain
        raise AssertionError(f"Unexpected table requested: {name}")

    mock_db.table = table_dispatch

    with patch("app.routers.usage.get_supabase_or_none", return_value=mock_db):
        res = client.get("/v1/usage", headers=auth_headers)

    assert res.status_code == 200
    payload = res.json()
    assert payload["plan"] == "basic"
    assert payload["usage"] == {
        "stt_seconds": 0,
        "tts_chars": 12,
        "translate_chars": 0,
        "transcribe_seconds": 1,
        "ai_edit_tokens": 42,
        "notes_count": 7,
    }
    assert payload["limits"] == PLAN_LIMITS["basic"]
    assert datetime.fromisoformat(payload["period_end"]) > datetime.fromisoformat(payload["period_start"])
