import hashlib
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from ..auth import AuthUser, get_current_user
from ..db import get_supabase_or_none

router = APIRouter(prefix="/v1/auth/api-keys", tags=["api-keys"])

KEY_PREFIX = "wsp_live_"
KEY_RANDOM_BYTES = 32  # 64 hex chars after prefix
MAX_KEYS_PER_USER = 5


def _generate_key() -> str:
    return KEY_PREFIX + secrets.token_hex(KEY_RANDOM_BYTES)


def _hash_key(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


# ── Schemas ──────────────────────────────────────────────────

class CreateApiKeyRequest(BaseModel):
    name: str = "Default"


class ApiKeyResponse(BaseModel):
    id: str
    name: str
    key_prefix: str
    created_at: str
    last_used_at: str | None = None
    revoked_at: str | None = None


class CreateApiKeyResponse(ApiKeyResponse):
    key: str  # full key — shown ONCE


# ── Endpoints ────────────────────────────────────────────────

@router.post("", response_model=CreateApiKeyResponse, status_code=201)
async def create_api_key(
    body: CreateApiKeyRequest,
    user: AuthUser = Depends(get_current_user),
):
    db = get_supabase_or_none()
    if not db:
        raise HTTPException(status_code=500, detail="Database not configured")

    # Check limit
    existing = db.table("api_keys").select("id").eq("user_id", user.user_id).is_("revoked_at", "null").execute()
    if len(existing.data) >= MAX_KEYS_PER_USER:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Maximum {MAX_KEYS_PER_USER} active API keys allowed. Revoke an existing key first.",
        )

    full_key = _generate_key()
    now = datetime.now(timezone.utc).isoformat()

    row = db.table("api_keys").insert({
        "user_id": user.user_id,
        "name": body.name[:100],
        "key_prefix": full_key[:16],
        "key_hash": _hash_key(full_key),
        "created_at": now,
    }).execute()

    data = row.data[0]
    return CreateApiKeyResponse(
        id=data["id"],
        name=data["name"],
        key_prefix=data["key_prefix"],
        created_at=data["created_at"],
        key=full_key,
    )


@router.get("", response_model=list[ApiKeyResponse])
async def list_api_keys(user: AuthUser = Depends(get_current_user)):
    db = get_supabase_or_none()
    if not db:
        raise HTTPException(status_code=500, detail="Database not configured")

    result = db.table("api_keys").select("id, name, key_prefix, created_at, last_used_at, revoked_at").eq(
        "user_id", user.user_id
    ).order("created_at", desc=True).execute()

    return [ApiKeyResponse(**row) for row in result.data]


@router.delete("/{key_id}", status_code=200)
async def revoke_api_key(
    key_id: str,
    user: AuthUser = Depends(get_current_user),
):
    db = get_supabase_or_none()
    if not db:
        raise HTTPException(status_code=500, detail="Database not configured")

    now = datetime.now(timezone.utc).isoformat()
    result = db.table("api_keys").update({"revoked_at": now}).eq(
        "id", key_id
    ).eq("user_id", user.user_id).is_("revoked_at", "null").execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="API key not found or already revoked")

    return {"status": "revoked"}
