"""Seed Supabase app_config table with encrypted API keys from .env.

Usage:
    cd apps/api
    python -m scripts.seed_app_config
"""

import os
import sys
from pathlib import Path

from cryptography.fernet import Fernet
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

KEYS = [
    "OPENAI_API_KEY",
    "GROQ_API_KEY",
    "DEEPGRAM_API_KEY",
    "GOOGLE_TTS_API_KEY",
    "DEEPL_API_KEY",
]


def main():
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    enc_key = os.getenv("ENCRYPTION_KEY")
    if not url or not key:
        print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env")
        sys.exit(1)
    if not enc_key:
        print("ERROR: ENCRYPTION_KEY must be set in .env")
        sys.exit(1)

    fernet = Fernet(enc_key.encode())

    from supabase import create_client

    db = create_client(url, key)

    for name in KEYS:
        value = os.getenv(name)
        if not value:
            print(f"  SKIP {name} (not set)")
            continue
        encrypted = fernet.encrypt(value.encode()).decode()
        db.table("app_config").upsert(
            {"key": name, "value": encrypted}, on_conflict="key"
        ).execute()
        print(f"  OK   {name} (encrypted)")

    print("Done.")


if __name__ == "__main__":
    main()
