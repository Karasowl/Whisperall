# Whisperall v2 Rewrite Overview

## Goal
Complete rewrite as cloud-only monorepo. Replace Wisprflow/Granola/Speechify/TurboScribe.

## Architecture
```
DESKTOP (Electron + React/Vite)
  |-- Supabase JS (Auth + Realtime + Storage uploads)
  `-- VERCEL API (FastAPI, stateless)
        |-- OpenAI (dictate: gpt-4o-mini-transcribe)
        |-- Deepgram (live chunks 1-2s)
        |-- Groq (long files: whisper-large-v3-turbo)
        |-- Google Cloud TTS (WaveNet)
        |-- DeepL (translation)
        `-- OpenAI LLM (ai-edit: gpt-4o-mini)
              |
        SUPABASE (Auth + Postgres + Storage + Realtime)
```

## Key Decisions
- Desktop v1: Windows only
- Infra: Vercel + Supabase (no VPS)
- Live: Deepgram via 1-2s chunks
- Diarization: final only (not live)
- Pricing: Free + Basic $4 + Pro $10
- No local models - cloud only
- TDD approach

## Milestone Status
- [x] M1: Foundation (schema, auth, db, schemas, providers, tests, CI)
- [x] M2: API Providers (real httpx calls + 100% respx coverage)
- [x] M3: API Routers (usage tracking, history logging, integration tests)
- [x] M4: API Client Package (typed endpoints, MSW tests)
- [x] M5: Desktop Electron Shell (6 modules, 12 IPC channels, 12 vitest tests)
- [x] M6: Desktop React App (5 pages, 4 stores, 30 store tests)
- [ ] M7: Overlay Widget
- [ ] M8: E2E + Polish
- [ ] M9: Auth, Billing, Production
