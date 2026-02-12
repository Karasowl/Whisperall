import hashlib
import logging
from dataclasses import dataclass, field
from datetime import date, datetime, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import httpx
import jwt

from .config import settings
from .db import get_supabase_or_none

log = logging.getLogger(__name__)
API_KEY_PREFIX = "wsp_live_"

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
    is_owner: bool = False
    is_admin: bool = False


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


def authenticate_token(token: str) -> AuthUser:
    if settings.auth_disabled:
        return AuthUser(user_id="00000000-0000-0000-0000-000000000000")

    # ── API Key path (wsp_live_*) ────────────────────────────
    if token.startswith(API_KEY_PREFIX):
        return _authenticate_api_key(token)

    # ── JWT path (existing) ──────────────────────────────────
    if not settings.supabase_jwt_secret:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="JWT secret not configured")

    try:
        payload = jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            options={"verify_aud": False},
        )
    except jwt.InvalidTokenError:
        payload = _fetch_user_payload_from_supabase(token)
        if not payload:
            _raise_unauthorized("Invalid or expired token")

    user_id = payload.get("sub") or payload.get("user_id")
    if not user_id:
        _raise_unauthorized("Invalid token payload")

    return _load_user_profile(user_id, email=payload.get("email"))


def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(security),
) -> AuthUser:
    if settings.auth_disabled:
        return AuthUser(user_id="00000000-0000-0000-0000-000000000000")

    if not creds or not creds.credentials:
        _raise_unauthorized("Missing bearer token", error="invalid_request")

    return authenticate_token(creds.credentials)


def _authenticate_api_key(token: str) -> AuthUser:
    """Validate an API key (wsp_live_*) and return the associated user."""
    db = get_supabase_or_none()
    if not db:
        _raise_unauthorized("API key authentication requires database")

    key_hash = hashlib.sha256(token.encode()).hexdigest()
    try:
        row = db.table("api_keys").select("user_id").eq(
            "key_hash", key_hash
        ).is_("revoked_at", "null").maybe_single().execute()
    except Exception:
        _raise_unauthorized("API key validation failed")

    if not row.data:
        _raise_unauthorized("Invalid or revoked API key")

    user_id = row.data["user_id"]

    # Update last_used_at (fire-and-forget, don't block auth)
    try:
        db.table("api_keys").update(
            {"last_used_at": datetime.now(timezone.utc).isoformat()}
        ).eq("key_hash", key_hash).execute()
    except Exception:
        log.warning("Failed to update api_key last_used_at")

    return _load_user_profile(user_id)


def _load_user_profile(user_id: str, email: str | None = None) -> AuthUser:
    """Load plan and usage for a user from the database."""
    plan = "free"
    usage = {}
    is_owner = False
    is_admin = False
    db = get_supabase_or_none()
    if db:
        try:
            row = db.table("profiles").select("plan,is_owner,is_admin").eq("id", user_id).maybe_single().execute()
            if row.data:
                plan = normalize_plan(row.data.get("plan"))
                is_owner = bool(row.data.get("is_owner"))
                is_admin = bool(row.data.get("is_admin"))
        except Exception:
            plan = "free"
        try:
            now = datetime.now(timezone.utc)
            month_start = date(now.year, now.month, 1).isoformat()
            usage_row = (
                db.table("usage")
                .select("*")
                .eq("user_id", user_id)
                .eq("month", month_start)
                .maybe_single()
                .execute()
            )
            if usage_row.data:
                usage = usage_row.data
        except Exception:
            usage = {}

    # Owner override via env (sets a persistent flag in DB when possible).
    db_owner_flag = is_owner
    if email and settings.owner_email and email.strip().lower() == settings.owner_email.strip().lower():
        is_owner = True
        is_admin = True
        if db and not db_owner_flag:
            # Best-effort: persist so API keys (no email) still grant owner access.
            try:
                db.table("profiles").update({"is_owner": True}).eq("id", user_id).execute()
            except Exception:
                pass

    return AuthUser(
        user_id=user_id,
        email=email,
        plan=normalize_plan(plan),
        usage=usage,
        is_owner=is_owner,
        is_admin=is_admin,
    )


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
