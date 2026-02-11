from dataclasses import dataclass, field
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import httpx
import jwt

from .config import settings
from .db import get_supabase_or_none

PLAN_LIMITS = {
    "free":  {"stt_seconds": 1800,   "tts_chars": 50_000,  "translate_chars": 50_000,  "transcribe_seconds": 600,    "ai_edit_tokens": 50_000,  "notes_count": 50},
    "basic": {"stt_seconds": 36_000, "tts_chars": 500_000, "translate_chars": 500_000, "transcribe_seconds": 18_000, "ai_edit_tokens": 500_000, "notes_count": 200},
    "pro":   {"stt_seconds": 108_000,"tts_chars": 2_000_000,"translate_chars": 2_000_000,"transcribe_seconds": 108_000,"ai_edit_tokens": 2_000_000,"notes_count": 1000},
}


def normalize_plan(value: str | None) -> str:
    if not value:
        return "free"
    normalized = value.strip().lower()
    return normalized if normalized in PLAN_LIMITS else "free"


@dataclass
class AuthUser:
    user_id: str
    email: str | None = None
    plan: str = "free"
    usage: dict = field(default_factory=dict)


security = HTTPBearer(auto_error=False)


def _seconds_until_next_month_utc(now: datetime | None = None) -> int:
    current = now or datetime.now(timezone.utc)
    if current.month == 12:
        next_month = datetime(current.year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        next_month = datetime(current.year, current.month + 1, 1, tzinfo=timezone.utc)
    return max(1, int((next_month - current).total_seconds()))


def _raise_unauthorized(detail: str, error: str = "invalid_token") -> None:
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": f'Bearer error="{error}"'},
    )


def _fetch_user_payload_from_supabase(token: str) -> dict | None:
    """Fallback validation via Supabase Auth when local JWT decode fails."""
    if not settings.supabase_url or not settings.supabase_anon_key:
        return None

    url = f"{settings.supabase_url.rstrip('/')}/auth/v1/user"
    headers = {
        "apikey": settings.supabase_anon_key,
        "Authorization": f"Bearer {token}",
    }
    try:
        with httpx.Client(timeout=5.0) as client:
            res = client.get(url, headers=headers)
        if res.status_code != 200:
            return None
        data = res.json()
    except Exception:
        return None

    user_id = data.get("id")
    if not user_id:
        return None
    return {"sub": user_id, "email": data.get("email")}


def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(security),
) -> AuthUser:
    if settings.auth_disabled:
        return AuthUser(user_id="00000000-0000-0000-0000-000000000000")

    if not creds or not creds.credentials:
        _raise_unauthorized("Missing bearer token", error="invalid_request")

    if not settings.supabase_jwt_secret:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="JWT secret not configured")

    try:
        payload = jwt.decode(
            creds.credentials,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            options={"verify_aud": False},
        )
    except jwt.InvalidTokenError:
        payload = _fetch_user_payload_from_supabase(creds.credentials)
        if not payload:
            _raise_unauthorized("Invalid or expired token")

    user_id = payload.get("sub") or payload.get("user_id")
    if not user_id:
        _raise_unauthorized("Invalid token payload")

    plan = "free"
    usage = {}
    db = get_supabase_or_none()
    if db:
        try:
            row = db.table("profiles").select("plan").eq("id", user_id).maybe_single().execute()
            if row.data:
                plan = normalize_plan(row.data.get("plan"))
        except Exception:
            plan = "free"
        try:
            usage_row = db.table("usage").select("*").eq("user_id", user_id).order("month", desc=True).limit(1).maybe_single().execute()
            if usage_row.data:
                usage = usage_row.data
        except Exception:
            usage = {}

    return AuthUser(user_id=user_id, email=payload.get("email"), plan=normalize_plan(plan), usage=usage)


def check_usage(user: AuthUser, resource: str, amount: int = 1) -> None:
    """Raise 429 if user exceeds plan limit for the given resource."""
    # Dev-only escape hatch to unblock local testing without mutating DB plan/usage.
    if settings.usage_limits_disabled and settings.env != "prod":
        return

    limits = PLAN_LIMITS.get(normalize_plan(user.plan), PLAN_LIMITS["free"])
    limit = limits.get(resource)
    if limit is None:
        return
    current = user.usage.get(resource, 0)
    if current + amount > limit:
        retry_after = str(_seconds_until_next_month_utc())
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                f"Plan limit exceeded for {resource}. "
                f"Usage: {current}/{limit}. Upgrade plan or wait for monthly reset."
            ),
            headers={
                "Retry-After": retry_after,
                "X-Whisperall-Error-Code": "PLAN_LIMIT_EXCEEDED",
                "X-Whisperall-Resource": resource,
                "X-Whisperall-Current": str(current),
                "X-Whisperall-Limit": str(limit),
                "X-Whisperall-Plan": normalize_plan(user.plan),
            },
        )
