# Whisperall

**All-in-one voice AI desktop app.** Dictation, live meeting transcription, file transcription, text-to-speech, real-time translation, and subtitles — in a single tool.

Replaces the need for separate subscriptions to dictation, transcription, TTS, and meeting note services.

## Features

| Feature | Description | Provider |
|---------|-------------|----------|
| **Dictation** | Hotkey-triggered recording → transcription → clipboard paste | OpenAI `gpt-4o-mini-transcribe` |
| **Live Meetings** | Real-time transcription with speaker diarization | Deepgram nova-2 (WebSocket) |
| **File Transcription** | Transcribe audio/video files up to 10 hours (chunked) | Groq `whisper-large-v3-turbo` |
| **Text-to-Speech** | Read any text aloud with natural voices | Google WaveNet |
| **Real-time Translation** | Auto-translate dictation and live transcription | DeepL API |
| **Subtitles Overlay** | Floating subtitle bar during live meetings | — |
| **AI Text Editing** | Clean up, formalize, summarize, or remove fillers | OpenAI GPT |
| **Notes & Documents** | Auto-save from all sources, rich text editor (TipTap) | Supabase |

### Overlay Widget

A minimal floating overlay provides quick access to 4 modules from any application:
- Dictation
- Reader (TTS)
- Translator
- Subtitles

### Hotkeys

| Shortcut | Action |
|----------|--------|
| `Alt+X` | Start/stop dictation |
| `Alt+Shift+S` | Paste last dictation |
| `Ctrl+Shift+R` | Read clipboard aloud (TTS) |

## Tech Stack

**Monorepo** (pnpm workspaces):

```
whisperall/
├── apps/desktop/     Electron 33 + React 18 + Vite + TypeScript
├── apps/api/         FastAPI (Python) — 14 API routers
├── apps/web/         Next.js (landing page, auth, dashboard)
├── packages/api-client/   Typed TypeScript API client
├── packages/mcp-server/   MCP server for Claude integration
└── supabase/              Database schema & migrations
```

- **Desktop**: Electron 33, React 18, TypeScript 5.6, Tailwind CSS v4, Zustand 5, TipTap editor
- **Backend**: FastAPI, Supabase (Postgres + Auth + Storage), Pydantic
- **Build**: Vite 5.4, electron-builder
- **Testing**: Pytest (API), Vitest (desktop), Playwright (E2E) — 80% coverage gate

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+
- Python 3.11+

### Installation

```bash
git clone https://github.com/Karasowl/Whisperall.git
cd Whisperall
pnpm install
```

### Development

```bash
# Desktop app
pnpm dev:desktop

# API server
pnpm dev:api

# Website
pnpm dev:web
```

### Testing

```bash
# API tests
pnpm test:api

# Desktop tests
cd apps/desktop && pnpm test

# E2E tests
cd apps/desktop && pnpm test:e2e
```

## API Providers

Whisperall connects to multiple AI providers server-side (API keys never leave the backend):

- **OpenAI** — Dictation (STT) + AI text editing (LLM)
- **Groq** — File transcription (Whisper large-v3-turbo)
- **Deepgram** — Live meeting streaming (nova-2 WebSocket)
- **Google Cloud** — Text-to-speech (WaveNet voices)
- **DeepL** — Real-time translation
- **Supabase** — Auth, database, storage

## License

MIT
