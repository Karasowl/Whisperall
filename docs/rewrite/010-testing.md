# Testing Strategy

## API Tests (pytest)
- **conftest.py**: JWT fixtures, provider AsyncMock fixtures, settings patches
- **test_auth.py**: JWT validation, plan lookup, usage checking, auth disabled mode
- **test_dictate.py**: Auth guard, text return, prompt forwarding
- **test_live.py**: Auth guard, chunk transcription, translation
- **test_transcribe.py**: Auth guard, DB requirement (503)
- **test_tts.py**: Auth guard, synthesis
- **test_translate.py**: Auth guard, translation
- **test_ai_edit.py**: Auth guard, filler cleaning, custom modes

Run: `cd apps/api && pytest --cov=app -q`

## CI Pipeline (.github/workflows/ci.yml)
- `api-tests`: Python 3.12, pip install, pytest with coverage
- `ts-lint`: pnpm, Node 20, lint all packages

## Desktop Tests (planned)
- Vitest for React components and Zustand stores
- Playwright for E2E flows

## Coverage Target
- API: 80%+ on auth, routers, schemas
- Providers: low coverage expected (real HTTP calls mocked)
