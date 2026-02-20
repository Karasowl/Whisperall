from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Response

from ..auth import get_current_user, AuthUser, PLAN_LIMITS, normalize_plan
from ..db import get_supabase_or_none
from ..schemas import UsageResponse as UsageResponseSchema

router = APIRouter(prefix="/v1/usage", tags=["usage"])

EMPTY_USAGE = {
    "stt_seconds": 0, "tts_chars": 0, "translate_chars": 0,
    "transcribe_seconds": 0, "ai_edit_tokens": 0, "notes_count": 0, "storage_bytes": 0,
}


def _usage_period_bounds(now: datetime) -> tuple[datetime, datetime]:
    period_start = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
    if now.month == 12:
        period_end = datetime(now.year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        period_end = datetime(now.year, now.month + 1, 1, tzinfo=timezone.utc)
    return period_start, period_end


def _int_or_zero(value: object) -> int:
    try:
        return max(0, int(value or 0))
    except (TypeError, ValueError):
        return 0


def _set_usage_no_cache_headers(response: Response) -> None:
    # Usage changes frequently while jobs run. Disable intermediary/browser caching.
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    response.headers["Vary"] = "Authorization"


@router.get("", response_model=UsageResponseSchema)
async def get_usage(response: Response, user: AuthUser = Depends(get_current_user)):
    _set_usage_no_cache_headers(response)
    now = datetime.now(timezone.utc)
    period_start, period_end = _usage_period_bounds(now)
    db = get_supabase_or_none()
    plan = normalize_plan(user.plan)
    usage = {**EMPTY_USAGE}

    if db:
        try:
            profile_row = (
                db.table("profiles")
                .select("plan")
                .eq("id", user.user_id)
                .maybe_single()
                .execute()
            )
            if profile_row.data:
                plan = normalize_plan(profile_row.data.get("plan"))
        except Exception:
            pass
        try:
            usage_row = (
                db.table("usage")
                .select("stt_seconds, tts_chars, translate_chars, transcribe_seconds, ai_edit_tokens, notes_count, storage_bytes")
                .eq("user_id", user.user_id)
                .eq("month", period_start.date().isoformat())
                .maybe_single()
                .execute()
            )
            if usage_row.data:
                for k in EMPTY_USAGE:
                    usage[k] = _int_or_zero(usage_row.data.get(k, 0))
        except Exception:
            pass

    limits = PLAN_LIMITS.get(normalize_plan(plan), PLAN_LIMITS["free"])
    usage_payload = usage
    limits_payload = {k: _int_or_zero(limits.get(k, 0)) for k in EMPTY_USAGE}

    return {
        "plan": normalize_plan(plan),
        "usage": usage_payload,
        "limits": limits_payload,
        "period_start": period_start,
        "period_end": period_end,
        "next_reset_at": period_end,
        "generated_at": now,
    }
