from functools import lru_cache

from supabase import create_client, Client

from .config import settings


@lru_cache(maxsize=1)
def get_supabase() -> Client:
    """Supabase client singleton using service role key (bypasses RLS)."""
    url = settings.supabase_url
    key = settings.supabase_service_role_key
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
    return create_client(url, key)


def get_supabase_or_none() -> Client | None:
    """Return client if configured, None otherwise (for tests)."""
    if not settings.supabase_url or not settings.supabase_service_role_key:
        return None
    return get_supabase()
