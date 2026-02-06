from dataclasses import dataclass, field

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import jwt

from .config import settings
from .db import get_supabase_or_none

PLAN_LIMITS = {
    "free":  {"stt_seconds": 1800,   "tts_chars": 50_000,  "translate_chars": 50_000,  "transcribe_seconds": 600,    "ai_edit_tokens": 50_000},
    "basic": {"stt_seconds": 36_000, "tts_chars": 500_000, "translate_chars": 500_000, "transcribe_seconds": 18_000, "ai_edit_tokens": 500_000},
    "pro":   {"stt_seconds": 108_000,"tts_chars": 2_000_000,"translate_chars": 2_000_000,"transcribe_seconds": 108_000,"ai_edit_tokens": 2_000_000},
}


@dataclass
class AuthUser:
    user_id: str
    email: str | None = None
    plan: str = "free"
    usage: dict = field(default_factory=dict)


security = HTTPBearer(auto_error=False)


def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(security),
) -> AuthUser:
    if settings.auth_disabled:
        return AuthUser(user_id="dev-user")

    if not creds or not creds.credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing auth token")

    if not settings.supabase_jwt_secret:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="JWT secret not configured")

    try:
        payload = jwt.decode(
            creds.credentials,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            options={"verify_aud": False},
        )
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc

    user_id = payload.get("sub") or payload.get("user_id")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    plan = "free"
    usage = {}
    db = get_supabase_or_none()
    if db:
        row = db.table("profiles").select("plan").eq("id", user_id).maybe_single().execute()
        if row.data:
            plan = row.data["plan"]
        usage_row = db.table("usage").select("*").eq("user_id", user_id).order("month", desc=True).limit(1).maybe_single().execute()
        if usage_row.data:
            usage = usage_row.data

    return AuthUser(user_id=user_id, email=payload.get("email"), plan=plan, usage=usage)


def check_usage(user: AuthUser, resource: str, amount: int = 1) -> None:
    """Raise 429 if user exceeds plan limit for the given resource."""
    limits = PLAN_LIMITS.get(user.plan, PLAN_LIMITS["free"])
    limit = limits.get(resource)
    if limit is None:
        return
    current = user.usage.get(resource, 0)
    if current + amount > limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Plan limit exceeded for {resource}",
        )
