# WhisperAll — Project Status & Requirements

Last updated: 2026-04-15 — see `CHANGELOG.md` for the per-version log and `docs/IMPORTANT/REDESIGN-PLAN.md` for the in-flight redesign work (Phases A–F, all complete).

## Current build (v0.7.0)

Phases of the spring-2026 redesign:
- **A — Bugs (B1–B7)** — repaste fantasma, draft fantasma, voice-note redundante, version-badge → modal local, topbar overlap, editor full-width, sidebar Procesos+Logs+collapse+VersionBadge.
- **B — Action System** — `src/stores/actions.ts` + `ActionDock` floating primitive; dictation/live/transcription wired with stop/cancel.
- **C — Typewriter** — `src/lib/typewriter.ts` + `wa-reveal` CSS; record-into-note streams word-by-word with fade+blur.
- **D — Settings rail** — modal con 9 secciones en rail lateral, 1 pane por archivo interno.
- **E1 — Tokens + theme toggle** — palette ElevenLabs en `index.css`, dual-theme con default light, `<ThemeToggle />` en topbar, Geist + Geist Mono cargados.
- **E2 — Primitives + rollout** — `Button` (6 variants) y `Card` (3 variants), aplicados a CTAs visibles (Save, Upgrade, ActionDock).
- **F — Verification** — `tsc --noEmit` 0 errores (4 preexistentes corregidos), `vitest` 251/252 (1 fallo preexistente clipboard debounce), `vite build` OK 10.97s, `pytest` 220/220.

Files added in this redesign: `actions.ts`, `ui.ts`, `typewriter.ts`, `Button.tsx`, `Card.tsx`, `ActionPill.tsx`, `ChangelogModal.tsx`, `ThemeToggle.tsx`, `VersionBadge.tsx`, `LogsPage.tsx`, `ErrorBoundary.tsx`, `docs/IMPORTANT/REDESIGN-PLAN.md`, `docs/design-system/elevenlabs.md`, `CHANGELOG.md`.

## Original Prompt (source of truth)

> Esto es una refactorizacion completa de la app ya que está muy regada y dificil de mantener. Si puedes escribir algo en 100 lineas y la escribiste en mil, fallaste. Te guias por el proyecto y las imagenes y html de ejemplo que estan en `venv/4newApp/stitch_whisperall_transcribe_redesign/`. Esta app es un reemplazo para wisprflow.ai, granola.ai, speechify.com y turboscribe.ai. All in one integrated flow app with an extra minimal overlay widget for do everything in all OS apps. Documenta todo el proceso para que cada paso no se olvide y trabaja con TDD.
>
> La app debe poder:
> 1. Usar hotkeys para transcribir lo que dice el usuario con modelos API como **gpt-4o-mini-transcribe**
> 2. Transcribir reuniones en vivo con modelos como **gpt-4o-transcribe-diarize** para identificar hablantes
> 3. Transcribir videos o enlaces de videos o audios de todo tipo hasta 10h de longitud trabajando internamente por chunks con modelos como **groq/whisper-large-v3-turbo** para archivos largos (12x mas barato que OpenAI, 164x mas rapido que real-time)
> 4. Tener text-to-speech leyendo desde cualquier lugar de la pantalla con **Google WaveNet**
> 5. Subtitular en tiempo real
> 6. Traducir en tiempo real

---

## Vision

All-in-one voice AI desktop app. Replaces:
- [wisprflow.ai](https://wisprflow.ai/) (dictation)
- [granola.ai](https://granola.ai/) (meeting transcription)
- [speechify.com](https://speechify.com/) (text-to-speech)
- [turboscribe.ai](https://turboscribe.ai/) (file transcription)

Extra minimal overlay widget for quick access from any app.

---

## 7 Core Features — Status

| # | Feature | Model/Provider | Status | Notes |
|---|---------|---------------|--------|-------|
| 1 | **Dictation** (mic → text → paste) | `gpt-4o-mini-transcribe` | **WORKS** | Full pipeline: hotkey → record → API → clipboard paste |
| 2 | **Live meetings** (system audio + diarization) | Deepgram nova-2 (real-time WS) | **M15 DONE** | Real-time Deepgram streaming, interim text + final segments |
| 3 | **File transcription** (chunked, up to 10h) | `groq/whisper-large-v3-turbo` | **M10 DONE** | Pipeline fixed: split → upload → Groq → combine |
| 4 | **Text-to-speech** (read aloud from anywhere) | Google WaveNet | **M11 DONE** | Hotkey Ctrl+Shift+R → read clipboard via TTS |
| 5 | **Real-time subtitles** (overlay text) | — | **M12 DONE** | Subtitle mode in overlay widget (800x80 transparent bar) |
| 6 | **Real-time translation** | DeepL | **M12 DONE** | Toggle in dictation + live flows, auto-translate on stop |
| 7 | **Overlay widget** (all-in-one) | — | **M12 DONE** | 4 modules: dictate, reader, translator, subtitles |

---

## Architecture

```
whisperall/
├── apps/api/          FastAPI on Vercel (7 routers, 7 providers)
├── apps/desktop/      Electron + React/Vite + Tailwind v4
│   ├── electron/      main.ts + 7 modules (TS source)
│   ├── electron-dist/ compiled CJS output (main.js + modules/*.js + preload.js)
│   ├── src/           React app (7 pages, 22 components, 6 stores, 4 lib modules)
│   └── e2e/           7 Playwright spec files
├── packages/api-client/  Typed TS endpoints for all 7 routers
└── supabase/          Schema + migrations
```

### Providers
| Provider | Function | Model | Used by |
|----------|----------|-------|---------|
| `openai_stt.transcribe()` | Dictation STT | `gpt-4o-mini-transcribe` | `/v1/dictate` |
| `openai_stt.diarize()` | Speaker diarization | `gpt-4o-transcribe-diarize` | `/v1/live/chunk` |
| `groq_stt.transcribe_chunk()` | Fast file STT | `whisper-large-v3-turbo` | `/v1/transcribe/*/run` |
| `google_tts.synthesize()` | Text-to-speech | WaveNet | `/v1/tts` |
| `deepl.translate()` | Translation | DeepL v2 | `/v1/translate`, `/v1/live/chunk` |
| `openai_llm.edit_text()` | AI text editing | GPT | `/v1/ai-edit` |
| `deepgram` (WS proxy) | Real-time live streaming | nova-2 | `/v1/live/stream` (WebSocket) |

### API Client Endpoints
| Endpoint | Desktop Wired? |
|----------|---------------|
| `api.dictate.send()` | YES — dictation store + widget |
| `DeepgramStream` (WebSocket) | YES — live store + real-time Deepgram streaming |
| `api.transcribe.*` | YES — M10 fixed pipeline |
| `api.tts.synthesize()` | YES — tts.ts + hotkey |
| `api.translate.translate()` | YES — dictation auto-translate + widget translator |
| `api.aiEdit.edit()` | YES — EditorPage AI edit buttons |

### Hotkeys
| Key | Action | Wired? |
|-----|--------|--------|
| `Alt+X` | Dictate toggle/hold | YES |
| `Alt+Shift+S` | Paste last dictation | YES |
| `Ctrl+Shift+R` | Read clipboard (TTS) | YES |

---

## Milestones

### M10: Bug Fixes + Transcription Pipeline — DONE
- [x] Fix `preload.ts:54` — openExternal missing url arg
- [x] Fix `live.py` — switch from Deepgram to `openai_stt.diarize()`
- [x] Fix `transcribe.py:67` — read chunk bytes from Supabase Storage (was `b""`)
- [x] Fix `transcription.ts` — wire `splitFileIntoChunks()` + Storage upload + polling
- [x] Update tests (conftest.py, test_live.py, test_usage_limits.py, transcription.test.ts)
- [x] All tests pass: 82 pytest + 82 vitest, build OK

### M11: Live Meetings + TTS — DONE
- [x] `src/lib/audio.ts` — add `getSystemAudioStream()` + `stopSystemStream()` (desktopCapturer via IPC)
- [x] `src/stores/live.ts` — NEW: session management, 3s chunk streaming, segment accumulation
- [x] `src/lib/tts.ts` — NEW: `playTTS()` / `stopTTS()` using `api.tts.synthesize()`
- [x] `src/pages/DictatePage.tsx` — source toggle (mic/system), live segment display
- [x] `src/components/dictate/CommandBar.tsx` — source toggle button
- [x] `src/App.tsx` — wire `read-clipboard` hotkey → TTS
- [x] Tests: `live.test.ts` (7 tests), `tts.test.ts` (4 tests)
- [x] IPC: `desktop-sources` handler + preload bridge + media permission update
- [x] All tests pass: 82 pytest + 93 vitest, tsc OK, build OK

### M12: Translation + Subtitles + Overlay Modules — DONE
- [x] `src/stores/settings.ts` — add `translateEnabled`, `translateTo` + setters
- [x] `src/stores/dictation.ts` — auto-translate after transcription (best-effort)
- [x] `src/stores/live.ts` — pass `translate_to` to `sendChunk()`
- [x] `src/components/dictate/CommandBar.tsx` — translate toggle button
- [x] `src/components/dictate/EditorArea.tsx` — translated text display
- [x] `src/pages/DictatePage.tsx` — wire translate settings + live translated segments
- [x] `src/overlay/widget-store.ts` — `WidgetModule` type, subtitle mode, `switchModule()`
- [x] `src/overlay/Widget.tsx` — module tabs, 4 module bodies, subtitle render
- [x] `src/overlay/widget.css` — subtitle + tab styles
- [x] Tests: settings (+2), dictation (+2), widget (+3), live mock fix
- [x] All tests pass: 82 pytest + 100 vitest, tsc OK, build OK

### M13: Make All Features Discoverable — DONE
- [x] Create `ReaderPage.tsx` — TTS page with textarea, play/stop, clipboard read
- [x] Add `'reader'` to Page type in App.tsx + import ReaderPage
- [x] Expand Sidebar NAV from 3→5 items (added Reader + Editor)
- [x] Add Translation section to SettingsModal (auto-translate toggle + target language)
- [x] Fix Widget.tsx hardcoded `'es'` → reads `translateTo` from settings store
- [x] Add always-visible mode badge to DictatePage (Dictation / Live Meeting)
- [x] Add text labels to CommandBar source toggle (Mic / System)
- [x] Fix EditorPage — always show textarea + AI edit buttons (no empty dead-end)
- [x] Update E2E navigation spec for 5 nav items
- [x] All tests pass: 82 pytest + 100 vitest, tsc OK, build OK

### M14: Wire Subtitles + Widget Accessibility — DONE
- [x] Add `sendSubtitleText()` to overlay.ts + IPC handler in ipc.ts
- [x] Add `sendSubtitleText` + `onSubtitleText` to preload bridge + global.d.ts
- [x] Wire live.ts → overlay: send subtitle text after each chunk
- [x] Widget.tsx: listen for `onSubtitleText` → update `translatedText`
- [x] Add subtitles toggle button in CommandBar (visible in live/system mode)
- [x] Wire subtitles toggle in DictatePage (show/hide overlay in subtitle mode)
- [x] Fix settings.ts `load()` — sync `overlay_enabled` to Electron on startup
- [x] Tests: ipc (+1 channel), settings (+1 overlay sync), live (+1 subtitle streaming)
- [x] All tests pass: 82 pytest + 102 vitest, tsc OK, build OK

### M14b: Electron Compilation Pipeline Fix — DONE
- [x] Root cause: `package.json` pointed to old `electron/main.cjs` (90-line legacy, 2 IPC channels)
- [x] New TS code in `electron/*.ts` (7 modules, full feature set) was never compiled to JS
- [x] `tsconfig.electron.json` — emit CJS to `electron-dist/` (was type-check-only)
- [x] `electron-dist/package.json` — `{ "type": "commonjs" }` (parent is ESM)
- [x] `package.json` — `"main": "electron-dist/main.js"`, added `build:electron` + `electron:dev` scripts
- [x] `scripts/electron-dev.mjs` — dev launcher (compile + spawn Electron with Vite URL)
- [x] Deleted old `electron/main.cjs` + `electron/preload.cjs`
- [x] `.gitignore` — exclude compiled `electron-dist/*.js` + `electron-dist/modules/`
- [x] Verified: app launches, all modules loaded, 102 tests pass, tsc OK, build OK

### M15: Live Streaming + API Key Security — DONE
- [x] Fix `.env` port mismatch (8090→8080) — root cause of "nothing transcribed"
- [x] Fix `.env.example` variable name (`VITE_API_BASE_URL`→`VITE_API_URL`)
- [x] Create `LiveStreamView.tsx` — live mode UI with interim text, segments, error banner
- [x] Refactor `DictatePage.tsx` — conditional render (LiveStreamView vs EditorArea)
- [x] Add i18n keys for live mode (en + es)
- [x] Add Deepgram WebSocket proxy endpoint (`/v1/live/stream` in `live.py`)
- [x] Create `deepgram-stream.ts` — WebSocket client with MediaRecorder streaming
- [x] Rewrite `live.ts` store — from 3s chunks to real-time Deepgram streaming
- [x] Add `app_config` table to schema (encrypted API key storage)
- [x] Add `load_remote_keys()` to `config.py` with Fernet decryption
- [x] Wire key loading into `main.py` lifespan startup event
- [x] Create `scripts/seed_app_config.py` — encrypts and seeds keys to Supabase
- [x] All tests pass: 81 pytest + 122 vitest, tsc OK, build OK

### M16: Notes System + Documents Foundation — DONE
- [x] `supabase/migrations/002_documents.sql` — documents table + RLS + updated_at trigger
- [x] `apps/api/app/routers/documents.py` — CRUD API (list/get/create/update/delete) with graceful no-table fallback
- [x] `packages/api-client/src/endpoints/documents.ts` — NEW typed endpoint
- [x] `packages/api-client/src/types.ts` — Document, CreateDocumentParams, UpdateDocumentParams types
- [x] `packages/api-client/src/client.ts` — add `putJson()` + `delete()` methods
- [x] `src/stores/documents.ts` — NEW Zustand store (CRUD + currentDocument)
- [x] Auto-save: dictation.ts, live.ts, transcription.ts → auto-create documents on completion
- [x] `src/pages/NotesPage.tsx` — NEW: document list with source badges, new/delete, click→editor
- [x] `src/pages/EditorPage.tsx` — rewrite: documentId prop, auto-save, title editing, save indicator
- [x] EditorPage UX fixes: pt-12 clears drag-region, no-drag header, toolbar below title (not under window controls)
- [x] 4 AI modes (casual, clean_fillers, formal, summarize) with icons
- [x] Insert Dictation button in note editor
- [x] Fix HistoryPage — correct column names (module/output_text instead of operation/detail)
- [x] Sidebar 5→6 items (added Notes)
- [x] i18n keys (en + es) for notes + editor features
- [x] Tests: test_documents.py (8 API tests), documents.test.ts (7 store tests)
- [x] All tests pass: 89 pytest + 129 vitest, tsc OK, build OK

---

## Overlay Widget — Full Plan

The widget is the "all in one" quick-access hub.

### Current State
- `src/overlay/Widget.tsx` — pill mode (72x12) + expanded mode (320x200)
- `src/overlay/widget-store.ts` — WidgetMode: `pill | expanded`, DictateStatus state machine
- `src/overlay/widget.css` — glassmorphism dark theme, pulse animation
- `overlay.html` — separate Vite entry point (plain CSS, no Tailwind)
- IPC: `overlay:switch-module` channel EXISTS but unused

### Target: 4 Modules

| Module | Trigger | What it does |
|--------|---------|-------------|
| **Dictate** | Alt+X or click mic | Record → transcribe → paste (WORKS today) |
| **Reader** | Ctrl+Shift+R or click | Reads clipboard/selection aloud via Google WaveNet TTS |
| **Translator** | Click or hotkey | Reads clipboard → translates via DeepL → shows result |
| **Subtitles** | During live meeting | Shows last 2-3 speaker segments as rolling text overlay |

### Widget Modes After M12
```
pill (72x12)  →  click/hotkey  →  expanded (320x200)  →  module body switches
                                                        │
                                                        ├─ dictate: [mic] [stop] [paste]
                                                        ├─ reader:  [play] [stop] [speed]
                                                        ├─ translator: [input] [lang] [result]
                                                        └─ subtitles mode (800x80): transparent bar at bottom
```

### Implementation (M12)
1. Add `activeModule: 'dictate' | 'reader' | 'translator' | 'subtitles'` to widget-store
2. Wire `onOverlaySwitchModule` IPC → `switchModule()` in widget-store
3. Expanded body renders different content based on `activeModule`:
   - **dictate**: existing UI (no changes)
   - **reader**: `readClipboard() → playTTS()` with play/stop button (~10 LOC)
   - **translator**: `readClipboard() → api.translate.translate()` show result (~10 LOC)
4. Add subtitle mode: `WidgetMode = 'pill' | 'expanded' | 'subtitles'`
   - 800x80 transparent bar, last 2-3 segments, speaker labels
   - Activated during live meeting transcription
5. Module tabs or switcher in expanded header (~15 LOC)

### LOC Budget
| Milestone | Production | Tests | Total |
|-----------|-----------|-------|-------|
| M10 | 45 | 35 | **80** |
| M11 | 150 | 60 | **210** |
| M12 | 150 | 45 | **195** |
| **Total** | **345** | **140** | **485** |

---

## Production Deployment Plan

### Current (Development)
- Backend: local FastAPI (`localhost:8080`) launched by `Whisperall.bat`
- API keys: encrypted with Fernet in Supabase `app_config`, decrypted on startup via `ENCRYPTION_KEY` in `.env`
- Live streaming: Deepgram WebSocket proxy (`/v1/live/stream`)

### Release (Commercial)
- **Desktop**: Electron `.exe` via electron-builder (NO backend bundled, NO API keys)
- **Backend**: Railway (~$5/mes) — FastAPI con WebSocket support nativo
- **API keys**: env vars en Railway (nunca tocan el cliente)
- **Live streaming**: Deepgram WebSocket proxy en Railway (o temp keys para conexion directa cliente→Deepgram)
- **Auth**: Supabase Auth (ya implementado)
- **DB**: Supabase Postgres (ya implementado)

### Why Railway over alternatives
| Option | WebSocket | Cold starts | Cost |
|--------|-----------|-------------|------|
| Vercel (serverless) | NO (30s limit) | YES | Free tier |
| Render (free) | NO | YES (30s) | Free |
| Render (paid) | YES | NO | $7/mes |
| **Railway** | **YES** | **NO** | **~$5/mes** |

### Security Model (Production)
1. User installs `.exe` (Electron only, no keys inside)
2. User authenticates via Supabase Auth
3. All API calls go to Railway backend (keys in server env vars)
4. API keys never leave the server

---

## Test Coverage
- 89 pytest (API) — providers, routers (incl. documents), usage limits, auth
- 129 vitest (desktop) — stores (dictation, live, settings, widget, tts, transcription, documents, plan, auth), ipc, hotkeys, clipboard, i18n
- 19 vitest (api-client) — typed endpoints with MSW
- 26 Playwright E2E — navigation, dictate, transcribe, editor, history, overlay, settings
- Coverage gates: 80% on statements/branches/functions/lines

---

## Design System
- **Colors**: primary `#137fec`, bg-dark `#101922`, surface `#1c242c`, border `#283039`, muted `#9dabb9`
- **Font**: Inter 300-900
- **Icons**: Material Symbols Outlined (FILL 0..1)
- **Theme**: Dark-only, glassmorphism overlay, paper-texture dictate bg
- **CSS**: Tailwind v4 (main app), plain CSS (overlay widget)

---

## Open Follow-ups

### OAuth Trust/Branding (added 2026-02-11)
- Current behavior: Google consent screen shows `zwqfdbhvkumdwibrpxwh.supabase.co` as the app host, which feels untrusted for end users.
- Status: login works technically, but UX/trust is not acceptable for production launch.
- Required fix:
  1. Configure a custom Supabase Auth domain (example: `auth.whisperall.ai`).
  2. Update Google OAuth client redirect URI to `https://auth.whisperall.ai/auth/v1/callback`.
  3. Keep current `supabase.co` redirect only during migration, then remove it.
  4. Update Google OAuth branding (app name/logo/privacy/terms) under Whisperall domain.
  5. Re-test desktop OAuth flow with external browser + `whisperall://auth/callback`.
