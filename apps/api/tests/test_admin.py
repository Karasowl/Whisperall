from datetime import date, datetime, timezone
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from app.config import settings


class _Resp(SimpleNamespace):
    data: list | dict | None
    count: int | None


class _Query:
    def __init__(self, data, count: int | None = None):
        self._data = data
        self._count = count

    # Chainable query methods (no-ops for unit tests)
    def select(self, *_args, **_kwargs):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def gte(self, *_args, **_kwargs):
        return self

    def lte(self, *_args, **_kwargs):
        return self

    def order(self, *_args, **_kwargs):
        return self

    def limit(self, *_args, **_kwargs):
        return self

    def maybe_single(self, *_args, **_kwargs):
        return self

    def range(self, *_args, **_kwargs):
        return self

    def upsert(self, row, **_kwargs):
        # Mirror supabase behavior: return the upserted row in data.
        self._data = [row]
        return self

    def execute(self):
        return _Resp(data=self._data, count=self._count)


class _DB:
    def __init__(self, tables: dict[str, _Query]):
        self._tables = tables

    def table(self, name: str):
        q = self._tables.get(name)
        if not q:
            raise AssertionError(f"Unexpected table requested: {name}")
        return q


def test_admin_requires_owner_or_admin(client, auth_headers):
    res = client.get("/v1/admin/overview", headers=auth_headers)
    assert res.status_code == 403


def test_admin_overview_contract(client, auth_headers):
    now = datetime.now(timezone.utc)
    month_start = date(now.year, now.month, 1)

    mock_db = _DB(
        {
            "profiles": _Query(data=[{"id": "u1"}, {"id": "u2"}], count=2),
            "history": _Query(data=[{"user_id": "u1"}, {"user_id": "u1"}, {"user_id": "u2"}]),
            "usage": _Query(
                data=[
                    {"stt_seconds": 10, "tts_chars": 100, "translate_chars": 0, "transcribe_seconds": 0, "ai_edit_tokens": 0, "notes_count": 0},
                    {"stt_seconds": 5, "tts_chars": 0, "translate_chars": 20, "transcribe_seconds": 300, "ai_edit_tokens": 10, "notes_count": 1},
                ]
            ),
            "usage_events": _Query(
                data=[
                    {"provider": "openai", "resource": "stt_seconds", "units": 15},
                    {"provider": "deepl", "resource": "translate_chars", "units": 20},
                ]
            ),
            "provider_pricing": _Query(
                data=[
                    {
                        "provider": "openai",
                        "resource": "stt_seconds",
                        "model": "gpt-4o-mini-transcribe",
                        "unit": "second",
                        "usd_per_unit": 0.01,
                        "effective_from": month_start.isoformat(),
                        "updated_at": now.isoformat(),
                    },
                    {
                        "provider": "deepl",
                        "resource": "translate_chars",
                        "model": "deepl",
                        "unit": "char",
                        "usd_per_unit": 0.001,
                        "effective_from": month_start.isoformat(),
                        "updated_at": now.isoformat(),
                    },
                ]
            ),
            "provider_invoices": _Query(
                data=[
                    {
                        "provider": "openai",
                        "period": month_start.isoformat(),
                        "amount_usd": 12.34,
                        "currency": "USD",
                        "notes": "Test invoice",
                        "updated_at": now.isoformat(),
                    }
                ]
            ),
            "revenue_entries": _Query(
                data=[
                    {
                        "period": month_start.isoformat(),
                        "source": "total",
                        "amount_usd": 100.00,
                        "currency": "USD",
                        "notes": "Test revenue",
                        "updated_at": now.isoformat(),
                    }
                ]
            ),
        }
    )

    with patch.object(settings, "owner_email", "test@example.com"), \
         patch("app.routers.admin.get_supabase_or_none", return_value=mock_db):
        res = client.get("/v1/admin/overview", headers=auth_headers)

    assert res.status_code == 200
    payload = res.json()

    # Stable contract
    assert "users_total" in payload
    assert "users_active_30d" in payload
    assert "usage_total" in payload
    assert "estimated_cost" in payload
    assert "real_cost" in payload
    assert "revenue" in payload
    assert "profit_real_usd" in payload
    assert "profit_estimated_usd" in payload
    assert "pricing" in payload
    assert "invoices" in payload
    assert "revenue_entries" in payload

    assert payload["users_total"] == 2
    assert payload["users_active_30d"] == 2
    assert payload["usage_total"]["stt_seconds"] == 15
    assert payload["estimated_cost"]["total_usd"] == pytest.approx(0.17, abs=1e-9)
    assert payload["revenue"]["total_usd"] == pytest.approx(100.0, abs=1e-9)
    assert payload["profit_real_usd"] == pytest.approx(87.66, abs=1e-9)
    assert payload["profit_estimated_usd"] == pytest.approx(99.83, abs=1e-9)


def test_admin_upsert_pricing(client, auth_headers):
    now = datetime.now(timezone.utc)
    month_start = date(now.year, now.month, 1)

    mock_db = _DB(
        {
            "provider_pricing": _Query(data=[]),
        }
    )

    with patch.object(settings, "owner_email", "test@example.com"), \
         patch("app.routers.admin.get_supabase_or_none", return_value=mock_db):
        res = client.post(
            "/v1/admin/pricing",
            headers=auth_headers,
            json={
                "provider": "openai",
                "resource": "stt_seconds",
                "unit": "second",
                "usd_per_unit": 0.02,
                "effective_from": month_start.isoformat(),
            },
        )

    assert res.status_code == 200
    payload = res.json()
    assert payload["provider"] == "openai"
    assert payload["resource"] == "stt_seconds"


def test_admin_upsert_invoice(client, auth_headers):
    now = datetime.now(timezone.utc)
    month_start = date(now.year, now.month, 1)

    mock_db = _DB(
        {
            "provider_invoices": _Query(data=[]),
        }
    )

    with patch.object(settings, "owner_email", "test@example.com"), \
         patch("app.routers.admin.get_supabase_or_none", return_value=mock_db):
        res = client.post(
            "/v1/admin/invoices",
            headers=auth_headers,
            json={
                "provider": "openai",
                "period": month_start.isoformat(),
                "amount_usd": 99.99,
                "currency": "USD",
                "notes": "Feb invoice",
            },
        )

    assert res.status_code == 200
    payload = res.json()
    assert payload["provider"] == "openai"
    assert float(payload["amount_usd"]) == 99.99


def test_admin_upsert_revenue(client, auth_headers):
    now = datetime.now(timezone.utc)
    month_start = date(now.year, now.month, 1)

    mock_db = _DB(
        {
            "revenue_entries": _Query(data=[]),
        }
    )

    with patch.object(settings, "owner_email", "test@example.com"), \
         patch("app.routers.admin.get_supabase_or_none", return_value=mock_db):
        res = client.post(
            "/v1/admin/revenue",
            headers=auth_headers,
            json={
                "period": month_start.isoformat(),
                "source": "total",
                "amount_usd": 123.45,
                "currency": "USD",
                "notes": "Feb revenue",
            },
        )

    assert res.status_code == 200
    payload = res.json()
    assert payload["source"] == "total"
    assert float(payload["amount_usd"]) == 123.45
