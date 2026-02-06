# Cloud Backend MVP (VPS/Aversell) - Whisperall

Goal: run the existing FastAPI backend remotely (managed keys, no end-user setup), and point the Electron app to it.

## 1) Backend (server) setup

### Environment variables (recommended)

- `WHISPERALL_BACKEND_PORT=8080`
- `WHISPERALL_BIND_HOST=0.0.0.0`

Provider keys (the backend reads keys from env before local `settings.json`):

- `WHISPERALL_GROQ_API_KEY=...`
- `WHISPERALL_DEEPINFRA_API_KEY=...`
- `WHISPERALL_OPENAI_API_KEY=...`
- `WHISPERALL_DEEPSEEK_API_KEY=...`
- `WHISPERALL_GEMINI_API_KEY=...`
- `WHISPERALL_CLAUDE_API_KEY=...`

You can also use the alternative format:

- `WHISPERALL_API_KEY_GROQ=...`, `WHISPERALL_API_KEY_DEEPINFRA=...`, etc.

Optional API auth (recommended for anything public):

- `WHISPERALL_API_TOKEN=your-long-random-token`

Notes:

- When `WHISPERALL_API_TOKEN` is set, all API routes require `Authorization: Bearer <token>`.
- Static audio routes `/output/*` and `/voice-files/*` are intentionally public (audio tags cannot send headers).
- The loopback WebSocket `/ws/loopback` requires `?token=<token>` when a token is configured.

### Run the backend

From the repo root on the server:

```powershell
python ui/backend/main.py
```

Or with uvicorn:

```powershell
python -m uvicorn ui.backend.main:app --host 0.0.0.0 --port 8080
```

For HTTPS, put it behind a reverse proxy (Caddy/Nginx) and forward to `127.0.0.1:8080`.

## 2) Client (Electron app) pointing to the hosted backend

The Electron preload exposes a runtime backend URL and token to the frontend.

Set:

- `WHISPERALL_API_URL=https://your-api-host.example.com`
- `WHISPERALL_CLIENT_TOKEN=your-long-random-token` (or reuse `WHISPERALL_API_TOKEN`)

The app will automatically:

- Use `WHISPERALL_API_URL` as the API base URL (instead of localhost).
- Send the bearer token on API requests (including uploads and the loopback WebSocket).

## 3) Quick smoke test checklist

- Open the app, go to Dictate: confirm STT works (Spanish is the best stress test).
- Open Reader: confirm TTS works even if the selected provider is not ready (auto-fallback).
- Open Transcribe: confirm upload + polling works (Electron uses IPC netFetch).
- Open Live Capture: confirm WebSocket connects (requires token when enabled).

