from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    env: str = Field(default='dev', alias='ENV')
    supabase_url: str | None = Field(default=None, alias='SUPABASE_URL')
    supabase_anon_key: str | None = Field(default=None, alias='SUPABASE_ANON_KEY')
    supabase_service_role_key: str | None = Field(default=None, alias='SUPABASE_SERVICE_ROLE_KEY')
    supabase_jwt_secret: str | None = Field(default=None, alias='SUPABASE_JWT_SECRET')

    openai_api_key: str | None = Field(default=None, alias='OPENAI_API_KEY')
    groq_api_key: str | None = Field(default=None, alias='GROQ_API_KEY')
    deepgram_api_key: str | None = Field(default=None, alias='DEEPGRAM_API_KEY')
    google_tts_api_key: str | None = Field(default=None, alias='GOOGLE_TTS_API_KEY')
    deepl_api_key: str | None = Field(default=None, alias='DEEPL_API_KEY')

    auth_disabled: bool = Field(default=False, alias='AUTH_DISABLED')

    dictate_chunk_seconds: int = Field(default=120, alias='DICTATE_CHUNK_SECONDS')
    live_chunk_seconds: int = Field(default=2, alias='LIVE_CHUNK_SECONDS')
    long_chunk_seconds: int = Field(default=300, alias='LONG_CHUNK_SECONDS')

    class Config:
        env_file = '.env'
        extra = 'ignore'


settings = Settings()
