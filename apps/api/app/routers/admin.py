from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query

from ..auth import AuthUser, get_current_user
from ..db import get_supabase_or_none
from ..schemas import (
    AdminInvoiceEntry,
    AdminInvoiceUpsertRequest,
    AdminOverviewResponse,
    AdminPricingEntry,
    AdminPricingUpsertRequest,
    AdminCostBreakdown,
    AdminRevenueBreakdown,
    AdminRevenueEntry,
    AdminRevenueUpsertRequest,
    UsageRecordResponse,
)


router = APIRouter(prefix="/v1/admin", tags=["admin"])

USAGE_KEYS = (
    "stt_seconds",
    "tts_chars",
    "translate_chars",
    "transcribe_seconds",
    "ai_edit_tokens",
    "notes_count",
)


def require_admin(user: AuthUser = Depends(get_current_user)) -> AuthUser:
    if not (user.is_owner or user.is_admin):
        raise HTTPException(
            status_code=403,
            detail="Not authorized",
            headers={"X-Whisperall-Error-Code": "ADMIN_FORBIDDEN"},
        )
    return user


def _month_bounds_utc(month: str | None) -> tuple[datetime, datetime, date]:
    """Return (period_start_dt, period_end_dt, month_start_date)."""
    now = datetime.now(timezone.utc)
    if not month:
        month_start = date(now.year, now.month, 1)
    else:
        try:
            year_s, month_s = month.split("-", 1)
            year = int(year_s)
            mo = int(month_s)
            if mo < 1 or mo > 12:
                raise ValueError("month out of range")
            month_start = date(year, mo, 1)
        except Exception as exc:
            raise HTTPException(status_code=400, detail="Invalid month. Use YYYY-MM.") from exc

    period_start = datetime(month_start.year, month_start.month, 1, tzinfo=timezone.utc)
    # first day of next month
    if month_start.month == 12:
        next_month = datetime(month_start.year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        next_month = datetime(month_start.year, month_start.month + 1, 1, tzinfo=timezone.utc)
    return period_start, next_month, month_start


def _paginate_select_all(query, page_size: int = 1000) -> list[dict]:
    rows: list[dict] = []
    start = 0
    while True:
        res = query.range(start, start + page_size - 1).execute()
        batch = res.data or []
        rows.extend(batch)
        if len(batch) < page_size:
            return rows
        start += page_size


def _latest_pricing(pricing_rows: list[dict], month_start: date) -> list[AdminPricingEntry]:
    """Pick the latest effective_from <= month_start for each (provider, resource)."""
    best: dict[tuple[str, str], dict] = {}
    for row in pricing_rows:
        provider = (row.get("provider") or "").strip()
        resource = (row.get("resource") or "").strip()
        eff = row.get("effective_from")
        if not provider or not resource or not eff:
            continue
        try:
            eff_date = date.fromisoformat(str(eff))
        except Exception:
            continue
        if eff_date > month_start:
            continue
        key = (provider, resource)
        cur = best.get(key)
        if not cur:
            best[key] = {**row, "effective_from": eff_date}
            continue
        try:
            cur_eff = cur["effective_from"]
        except Exception:
            cur_eff = None
        if not isinstance(cur_eff, date) or eff_date >= cur_eff:
            best[key] = {**row, "effective_from": eff_date}

    out: list[AdminPricingEntry] = []
    for row in best.values():
        out.append(
            AdminPricingEntry(
                provider=row["provider"],
                resource=row["resource"],
                model=row.get("model"),
                unit=row.get("unit") or "unit",
                usd_per_unit=float(row.get("usd_per_unit") or 0),
                effective_from=row["effective_from"],
                updated_at=datetime.fromisoformat(row["updated_at"]) if row.get("updated_at") else None,
            )
        )
    out.sort(key=lambda r: (r.provider, r.resource))
    return out


def _sum_usage(rows: list[dict]) -> UsageRecordResponse:
    totals = {k: 0 for k in USAGE_KEYS}
    for row in rows:
        for k in USAGE_KEYS:
            try:
                val = int(row.get(k) or 0)
            except Exception:
                val = 0
            if val > 0:
                totals[k] += val
    return UsageRecordResponse(**totals)


def _estimate_cost(
    usage_total: UsageRecordResponse,
    usage_events: list[dict],
    pricing: list[AdminPricingEntry],
) -> AdminCostBreakdown:
    """Estimate cost by provider using usage_events, with a safe fallback for unmetered units.

    Why: the monthly `usage` table aggregates by resource only (e.g. stt_seconds), which
    can span multiple providers. Pricing directly against usage would double-count once
    multiple providers exist for the same resource.

    Strategy:
    1) Use usage_events (provider/resource/units) for accurate attribution.
    2) For any leftover units (usage_total - metered), only apply pricing when that
       resource has exactly ONE priced provider (prevents double-counting).
    """
    pricing_by_key: dict[tuple[str, str], AdminPricingEntry] = {}
    providers_by_resource: dict[str, list[str]] = {}
    for entry in pricing:
        key = (entry.provider, entry.resource)
        pricing_by_key[key] = entry
        providers_by_resource.setdefault(entry.resource, []).append(entry.provider)

    metered_by_key: dict[tuple[str, str], int] = {}
    metered_by_resource: dict[str, int] = {}
    for row in usage_events:
        provider = (row.get("provider") or "").strip() or "unknown"
        resource = (row.get("resource") or "").strip()
        if resource not in USAGE_KEYS:
            continue
        try:
            units = int(row.get("units") or 0)
        except Exception:
            units = 0
        if units <= 0:
            continue
        key = (provider, resource)
        metered_by_key[key] = metered_by_key.get(key, 0) + units
        metered_by_resource[resource] = metered_by_resource.get(resource, 0) + units

    by_provider: dict[str, float] = {}

    # 1) Accurate: cost metered usage by (provider, resource).
    for key, units in metered_by_key.items():
        entry = pricing_by_key.get(key)
        if not entry:
            continue
        cost = float(units) * float(entry.usd_per_unit or 0)
        if cost <= 0:
            continue
        by_provider[key[0]] = by_provider.get(key[0], 0.0) + cost

    # 2) Safe fallback: if a resource has only one priced provider, price any leftover units.
    for resource in USAGE_KEYS:
        try:
            total_units = int(getattr(usage_total, resource) or 0)
        except Exception:
            total_units = 0
        metered_units = int(metered_by_resource.get(resource, 0) or 0)
        leftover = total_units - metered_units
        if leftover <= 0:
            continue
        providers = providers_by_resource.get(resource) or []
        if len(providers) != 1:
            continue
        provider = providers[0]
        entry = pricing_by_key.get((provider, resource))
        if not entry:
            continue
        cost = float(leftover) * float(entry.usd_per_unit or 0)
        if cost <= 0:
            continue
        by_provider[provider] = by_provider.get(provider, 0.0) + cost

    total = float(sum(by_provider.values()))
    by_provider_rounded = {k: round(v, 4) for k, v in sorted(by_provider.items())}
    return AdminCostBreakdown(total_usd=round(total, 4), by_provider=by_provider_rounded)


def _sum_revenue(rows: list[dict], month_start: date) -> tuple[AdminRevenueBreakdown, list[AdminRevenueEntry]]:
    entries: list[AdminRevenueEntry] = []
    by_source: dict[str, float] = {}
    for row in rows:
        try:
            period_val = date.fromisoformat(str(row.get("period")))
        except Exception:
            period_val = month_start
        source = (row.get("source") or "").strip() or "total"
        amt = float(row.get("amount_usd") or 0)
        entries.append(
            AdminRevenueEntry(
                period=period_val,
                source=source,
                amount_usd=amt,
                currency=row.get("currency") or "USD",
                notes=row.get("notes"),
                updated_at=datetime.fromisoformat(row["updated_at"]) if row.get("updated_at") else None,
            )
        )
        if amt:
            by_source[source] = by_source.get(source, 0.0) + amt

    breakdown = AdminRevenueBreakdown(
        total_usd=round(float(sum(by_source.values())), 4),
        by_source={k: round(v, 4) for k, v in sorted(by_source.items())},
    )
    entries.sort(key=lambda e: (e.period, e.source))
    return breakdown, entries


@router.get("/overview", response_model=AdminOverviewResponse)
async def admin_overview(
    month: str | None = Query(default=None, description="Billing month in YYYY-MM (UTC). Defaults to current month."),
    _user: AuthUser = Depends(require_admin),
):
    db = get_supabase_or_none()
    if not db:
        raise HTTPException(status_code=503, detail="Database not configured")

    period_start, period_end, month_start = _month_bounds_utc(month)
    generated_at = datetime.now(timezone.utc)

    # Users (total)
    try:
        users_res = db.table("profiles").select("id", count="exact").execute()
        users_total = int(getattr(users_res, "count", None) or 0)
        if users_total == 0:
            users_total = len(users_res.data or [])
    except Exception:
        users_total = 0

    # Active users: distinct user_id from history in last 30 days (best-effort).
    cutoff = (generated_at - timedelta(days=30)).isoformat()
    users_active: int
    try:
        rows = _paginate_select_all(
            db.table("history").select("user_id").gte("created_at", cutoff).order("created_at", desc=True)
        )
        users_active = len({r.get("user_id") for r in rows if r.get("user_id")})
    except Exception:
        users_active = 0

    # Usage totals for the selected month.
    usage_rows = _paginate_select_all(
        db.table("usage")
        .select(",".join(USAGE_KEYS))
        .eq("month", month_start.isoformat())
    )
    usage_total = _sum_usage(usage_rows)

    # Pricing: latest effective_from <= selected month for each provider/resource.
    pricing_rows = _paginate_select_all(
        db.table("provider_pricing")
        .select("provider,resource,model,unit,usd_per_unit,effective_from,updated_at")
        .lte("effective_from", month_start.isoformat())
    )
    pricing = _latest_pricing(pricing_rows, month_start)

    # Metered usage events (provider attribution). This table may not exist yet in older DBs.
    try:
        usage_event_rows = _paginate_select_all(
            db.table("usage_events")
            .select("provider,resource,units")
            .eq("period", month_start.isoformat())
        )
    except Exception:
        usage_event_rows = []

    estimated_cost = _estimate_cost(usage_total, usage_event_rows, pricing)

    # Real invoices for that month (manual entry).
    invoice_rows = _paginate_select_all(
        db.table("provider_invoices")
        .select("provider,period,amount_usd,currency,notes,updated_at")
        .eq("period", month_start.isoformat())
    )
    invoices: list[AdminInvoiceEntry] = []
    by_provider_real: dict[str, float] = {}
    for row in invoice_rows:
        try:
            period_val = date.fromisoformat(str(row.get("period")))
        except Exception:
            period_val = month_start
        amt = float(row.get("amount_usd") or 0)
        provider = (row.get("provider") or "").strip() or "unknown"
        invoices.append(
            AdminInvoiceEntry(
                provider=provider,
                period=period_val,
                amount_usd=amt,
                currency=row.get("currency") or "USD",
                notes=row.get("notes"),
                updated_at=datetime.fromisoformat(row["updated_at"]) if row.get("updated_at") else None,
            )
        )
        if amt > 0:
            by_provider_real[provider] = by_provider_real.get(provider, 0.0) + amt

    real_cost = AdminCostBreakdown(
        total_usd=round(float(sum(by_provider_real.values())), 4),
        by_provider={k: round(v, 4) for k, v in sorted(by_provider_real.items())},
    )

    # Revenue entries for that month (manual entry).
    try:
        revenue_rows = _paginate_select_all(
            db.table("revenue_entries")
            .select("period,source,amount_usd,currency,notes,updated_at")
            .eq("period", month_start.isoformat())
        )
    except Exception:
        revenue_rows = []

    revenue, revenue_entries = _sum_revenue(revenue_rows, month_start)

    profit_real_usd = round(float(revenue.total_usd - real_cost.total_usd), 4)
    profit_estimated_usd = round(float(revenue.total_usd - estimated_cost.total_usd), 4)

    return AdminOverviewResponse(
        period_start=period_start,
        period_end=period_end,
        generated_at=generated_at,
        users_total=users_total,
        users_active_30d=users_active,
        usage_total=usage_total,
        estimated_cost=estimated_cost,
        real_cost=real_cost,
        revenue=revenue,
        profit_real_usd=profit_real_usd,
        profit_estimated_usd=profit_estimated_usd,
        pricing=pricing,
        invoices=invoices,
        revenue_entries=revenue_entries,
    )


@router.post("/pricing", response_model=AdminPricingEntry)
async def upsert_pricing(
    body: AdminPricingUpsertRequest,
    _user: AuthUser = Depends(require_admin),
):
    if body.resource not in USAGE_KEYS:
        raise HTTPException(status_code=400, detail="Invalid resource")
    if body.usd_per_unit < 0:
        raise HTTPException(status_code=400, detail="usd_per_unit must be >= 0")

    db = get_supabase_or_none()
    if not db:
        raise HTTPException(status_code=503, detail="Database not configured")

    eff = body.effective_from or date.today().replace(day=1)
    row = {
        "provider": body.provider.strip(),
        "resource": body.resource,
        "model": body.model,
        "unit": body.unit,
        "usd_per_unit": body.usd_per_unit,
        "effective_from": eff.isoformat(),
    }
    try:
        res = db.table("provider_pricing").upsert(row, on_conflict="provider,resource,effective_from").execute()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Pricing upsert failed: {exc}") from exc

    data = (res.data or [row])[0]
    return AdminPricingEntry(
        provider=data["provider"],
        resource=data["resource"],
        model=data.get("model"),
        unit=data.get("unit") or body.unit,
        usd_per_unit=float(data.get("usd_per_unit") or body.usd_per_unit),
        effective_from=date.fromisoformat(str(data.get("effective_from") or eff.isoformat())),
        updated_at=datetime.fromisoformat(data["updated_at"]) if data.get("updated_at") else None,
    )


@router.post("/invoices", response_model=AdminInvoiceEntry)
async def upsert_invoice(
    body: AdminInvoiceUpsertRequest,
    _user: AuthUser = Depends(require_admin),
):
    if body.amount_usd < 0:
        raise HTTPException(status_code=400, detail="amount_usd must be >= 0")

    db = get_supabase_or_none()
    if not db:
        raise HTTPException(status_code=503, detail="Database not configured")

    period = body.period or date.today().replace(day=1)
    row = {
        "provider": body.provider.strip(),
        "period": period.isoformat(),
        "amount_usd": body.amount_usd,
        "currency": body.currency or "USD",
        "notes": body.notes,
    }
    try:
        res = db.table("provider_invoices").upsert(row, on_conflict="period,provider").execute()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Invoice upsert failed: {exc}") from exc

    data = (res.data or [row])[0]
    return AdminInvoiceEntry(
        provider=data["provider"],
        period=date.fromisoformat(str(data.get("period") or period.isoformat())),
        amount_usd=float(data.get("amount_usd") or body.amount_usd),
        currency=data.get("currency") or body.currency or "USD",
        notes=data.get("notes"),
        updated_at=datetime.fromisoformat(data["updated_at"]) if data.get("updated_at") else None,
    )


@router.post("/revenue", response_model=AdminRevenueEntry)
async def upsert_revenue(
    body: AdminRevenueUpsertRequest,
    _user: AuthUser = Depends(require_admin),
):
    if body.amount_usd < 0:
        raise HTTPException(status_code=400, detail="amount_usd must be >= 0")

    db = get_supabase_or_none()
    if not db:
        raise HTTPException(status_code=503, detail="Database not configured")

    period = body.period or date.today().replace(day=1)
    source = (body.source or "").strip() or "total"
    row = {
        "period": period.isoformat(),
        "source": source,
        "amount_usd": body.amount_usd,
        "currency": body.currency or "USD",
        "notes": body.notes,
    }
    try:
        res = db.table("revenue_entries").upsert(row, on_conflict="period,source").execute()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Revenue upsert failed: {exc}") from exc

    data = (res.data or [row])[0]
    return AdminRevenueEntry(
        period=date.fromisoformat(str(data.get("period") or period.isoformat())),
        source=data.get("source") or source,
        amount_usd=float(data.get("amount_usd") or body.amount_usd),
        currency=data.get("currency") or body.currency or "USD",
        notes=data.get("notes"),
        updated_at=datetime.fromisoformat(data["updated_at"]) if data.get("updated_at") else None,
    )
