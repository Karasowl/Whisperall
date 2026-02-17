import logging

from pydantic_settings import BaseSettings
from pydantic import Field

log = logging.getLogger(__name__)

DEFAULT_PROD_CORS_ORIGINS = (
    "https://whisperall.com",
    "https://www.whisperall.com",
)

DEFAULT_DEV_CORS_ORIGINS = (
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    *DEFAULT_PROD_CORS_ORIGINS,
)

# Keys that can be loaded from Supabase app_config table
_REMOTE_KEYS = {
    'OPENAI_API_KEY': 'openai_api_key',
    'GROQ_API_KEY': 'groq_api_key',
    'DEEPGRAM_API_KEY': 'deepgram_api_key',
    'GOOGLE_TTS_API_KEY': 'google_tts_api_key',
    'GOOGLE_OCR_API_KEY': 'google_ocr_api_key',
    'DEEPL_API_KEY': 'deepl_api_key',
    'DEEPSEEK_API_KEY': 'deepseek_api_key',
}


class Settings(BaseSettings):
    env: str = Field(default='dev', alias='ENV')
    cors_origins: str | None = Field(default=None, alias='CORS_ORIGINS')
    cors_origin_regex: str | None = Field(default=None, alias='CORS_ORIGIN_REGEX')
    supabase_url: str | None = Field(default=None, alias='SUPABASE_URL')
    supabase_anon_key: str | None = Field(default=None, alias='SUPABASE_ANON_KEY')
    supabase_service_role_key: str | None = Field(default=None, alias='SUPABASE_SERVICE_ROLE_KEY')
    supabase_jwt_secret: str | None = Field(default=None, alias='SUPABASE_JWT_SECRET')

    openai_api_key: str | None = Field(default=None, alias='OPENAI_API_KEY')
    groq_api_key: str | None = Field(default=None, alias='GROQ_API_KEY')
    deepgram_api_key: str | None = Field(default=None, alias='DEEPGRAM_API_KEY')
    google_tts_api_key: str | None = Field(default=None, alias='GOOGLE_TTS_API_KEY')
    google_ocr_api_key: str | None = Field(default=None, alias='GOOGLE_OCR_API_KEY')
    deepl_api_key: str | None = Field(default=None, alias='DEEPL_API_KEY')
    deepseek_api_key: str | None = Field(default=None, alias='DEEPSEEK_API_KEY')

    encryption_key: str | None = Field(default=None, alias='ENCRYPTION_KEY')

    # Admin / owner access (business dashboard)
    owner_email: str | None = Field(default=None, alias='OWNER_EMAIL')

    auth_disabled: bool = Field(default=False, alias='AUTH_DISABLED')
    usage_limits_disabled: bool = Field(default=False, alias='USAGE_LIMITS_DISABLED')
    reader_v2_enabled: bool = Field(default=True, alias='READER_V2_ENABLED')
    reader_v2_rollout_percent: int = Field(default=100, ge=0, le=100, alias='READER_V2_ROLLOUT_PERCENT')

    dictate_chunk_seconds: int = Field(default=120, alias='DICTATE_CHUNK_SECONDS')
    live_chunk_seconds: int = Field(default=2, alias='LIVE_CHUNK_SECONDS')
    long_chunk_seconds: int = Field(default=300, alias='LONG_CHUNK_SECONDS')

    class Config:
        env_file = '.env'
        extra = 'ignore'

    def get_cors_origins(self) -> list[str]:
        """Resolve allowed CORS origins from env with safe defaults."""
        if self.cors_origins:
            normalized: list[str] = []
            seen: set[str] = set()
            for raw in self.cors_origins.split(","):
                origin = raw.strip().rstrip("/")
                if origin and origin not in seen:
                    normalized.append(origin)
                    seen.add(origin)
            if normalized:
                return normalized
        defaults = DEFAULT_PROD_CORS_ORIGINS if self.env == "prod" else DEFAULT_DEV_CORS_ORIGINS
        return list(defaults)

    def validate_runtime_flags(self) -> None:
        """Fail fast on unsafe production runtime flags."""
        if self.env != "prod":
            return
        if self.auth_disabled:
            raise RuntimeError("AUTH_DISABLED cannot be true in prod")
        if self.usage_limits_disabled:
            log.warning("[config] USAGE_LIMITS_DISABLED=true in prod")
        if not self.supabase_jwt_secret:
            raise RuntimeError("SUPABASE_JWT_SECRET is required in prod")

    def _decrypt(self, cipher_text: str) -> str:
        """Decrypt a Fernet-encrypted value."""
        from cryptography.fernet import Fernet
        return Fernet(self.encryption_key.encode()).decrypt(cipher_text.encode()).decode()

    def load_remote_keys(self) -> None:
        """Fetch encrypted API keys from Supabase app_config, decrypt, and override .env values."""
        if not self.supabase_url or not self.supabase_service_role_key:
            log.info("[config] No Supabase credentials — using .env keys only")
            return
        try:
            from supabase import create_client
            db = create_client(self.supabase_url, self.supabase_service_role_key)
            rows = db.table("app_config").select("key, value").execute()
            loaded = 0
            for row in rows.data or []:
                attr = _REMOTE_KEYS.get(row["key"])
                if attr and row["value"]:
                    value = self._decrypt(row["value"]) if self.encryption_key else row["value"]
                    object.__setattr__(self, attr, value)
                    loaded += 1
            log.info("[config] Loaded %d API keys from Supabase app_config", loaded)
        except Exception as exc:
            log.warning("[config] Could not load remote keys: %s — falling back to .env", exc)


settings = Settings()
