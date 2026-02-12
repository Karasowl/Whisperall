> **MANDATORY — EXECUTE ON EVERY SESSION START (NO EXCEPTIONS)**
>
> Before doing ANYTHING else, even if the user gives you an urgent task:
> 1. `cat .agent-locks.json` — check what files are locked
> 2. `cat .agent-mail.json` — check for messages from codex-agent
> 3. `git log --oneline -5` — see recent commits
> 4. Report to user: "Coordination check: X locks active, Y unread messages"
> 5. If any file you need is locked by codex-agent, TELL THE USER before proceeding
>
> This is NON-NEGOTIABLE. Do this FIRST, then address the user's request.

# WhisperAll — Claude Code Project Context

> This file is auto-loaded by Claude Code at session start.
> Full spec: `docs/IMPORTANT/STATUS.md`

## What is this app?

All-in-one voice AI desktop app replacing wisprflow.ai + granola.ai + speechify.com + turboscribe.ai.
Overlay widget for quick access from any OS app. Dark-only, minimal, under 2000 LOC per feature batch.

## 7 Features — What WORKS vs What's LEFT

| # | Feature | Status |
|---|---------|--------|
| 1 | Dictation (mic → gpt-4o-mini-transcribe → paste) | WORKS |
| 2 | Live meetings (system audio + gpt-4o-transcribe-diarize) | M11 DONE |
| 3 | File transcription (chunked, groq/whisper-large-v3-turbo) | M10 DONE |
| 4 | Text-to-speech (Google WaveNet, read from anywhere) | M11 DONE |
| 5 | Real-time subtitles (overlay text bar) | M12 DONE |
| 6 | Real-time translation (DeepL in all flows) | M12 DONE |
| 7 | Overlay widget (all-in-one multi-module) | M12 DONE |

## What was DONE (completed milestones)

- **M1-M9** (`rewrite-monorepo` branch): Full backend + electron + stores + providers + tests
- **M1-M3 UI** (`v3-ui-rewrite` branch): Tailwind v4 rebuild — 20 components, 5 pages, 7 E2E specs
- **M10** (this branch): 4 bug fixes + transcription pipeline wired (split→upload→Groq→combine)
- **M11** (this branch): Live meetings (live store + system audio + source toggle) + TTS (lib/tts.ts + Ctrl+Shift+R hotkey)
- **M12** (this branch): Translation toggle (dictation + live) + subtitle overlay mode + widget 4 modules (dictate/reader/translator/subtitles)
- **M13** (this branch): All features discoverable — ReaderPage, sidebar 5 items, translation settings UI, EditorPage fix, mode badges
- **M14** (this branch): Subtitle streaming wired (live → IPC → overlay), subtitle toggle UI, settings sync fix
- **M14b** (this branch): Electron compilation pipeline fix — TS→CJS via `electron-dist/`, app actually launches now
- **M16** (this branch): Notes system + History fix — documents CRUD (DB + API + store), auto-save from dictation/live/transcription, NotesPage, EditorPage with documentId + debounced auto-save, History query columns fixed

## What's NEXT

- **M17**: TipTap block editor (replace textarea with rich text: bold, italic, headings, lists, blockquote, floating toolbar)
- **M18**: Multi-block content (transcription block, image/audio/PDF blocks, Supabase Storage attachments)
- **M19**: Notion export (OAuth + block mapping)
- Polish, E2E coverage, packaging/release

## Architecture (quick ref)

```
apps/api/app/         FastAPI — routers/ providers/ (7 each), auth.py, db.py, schemas.py
apps/desktop/electron/ Electron main + 7 modules (TS source)
apps/desktop/electron-dist/ Compiled CJS output (tsc -p tsconfig.electron.json)
apps/desktop/src/     React + Tailwind v4 — pages/ stores/ lib/ components/ overlay/
packages/api-client/  Typed TS endpoints for all 9 API routers
packages/mcp-server/  MCP server — 13 tools wrapping api-client (stdio, any MCP client)
supabase/migrations/  DB schema
```

## Key Patterns (DON'T break these)

- `settings` singleton — test with `patch.object(settings, ...)`, NOT monkeypatch.setenv
- Mock providers at router import: `app.routers.dictate.openai_stt.transcribe`
- Import from `@whisperall/api-client` barrel, NOT subpaths
- State-based routing via `useState<Page>`, no react-router
- Overlay = separate Vite entry (overlay.html), plain CSS (not Tailwind)
- Electron mocks: `vi.mock('electron')` + `vi.resetModules()` per test
- `data-testid` attributes for all E2E selectors
- Stitch mockups: `venv/4newApp/stitch_whisperall_transcribe_redesign/*/code.html`

## Design System

- Colors: primary `#137fec`, bg `#101922`, surface `#1c242c`, border `#283039`, muted `#9dabb9`
- Font: Inter 300-900, Icons: Material Symbols Outlined (FILL 0..1)
- Dark-only, glassmorphism overlay, paper-texture dictate bg

## Test Commands

```bash
cd apps/api && python -m pytest tests/ -x -q      # 82 API tests
cd apps/desktop && npx vitest run                   # 102 desktop tests
cd apps/desktop && npx vite build                   # production build
cd apps/desktop && npx tsc --noEmit                 # typecheck
cd packages/mcp-server && npx vitest run            # 25 MCP server tests
cd packages/mcp-server && npx tsc --noEmit          # MCP typecheck
```

## Rules

- "Si puedes escribir algo en 100 lineas y la escribiste en mil, fallaste"
- TDD: write tests alongside code
- Reuse existing infrastructure (stores, api-client, IPC channels, providers)
- MANDATORY: After each milestone, update BOTH `docs/IMPORTANT/STATUS.md` AND this file
- See `.claude/rules/` for path-specific rules (testing, code-style, milestone-updates)

## On Context Loss / New Session

If you're starting fresh or context was compacted, ALWAYS:
1. Read this file (auto-loaded)
2. Read `docs/IMPORTANT/STATUS.md` for full spec + checkboxes of what's done/left
3. Check git log for recent commits: `git log --oneline -10`
4. **Read `.agent-locks.json`** — check what files are locked and by whom
5. **Read `.agent-mail.json`** — check for messages from codex-agent
6. The feature table above is the single source of truth for project state

---

## Multi-Agent Coordination

> This project uses a file-locking + messaging protocol so two AI agents can work simultaneously without conflicts.
> The other agent is **codex-agent** (OpenAI Codex). It reads `AGENTS.md`, not this file.

### Your Identity

- Agent name: **claude-agent**
- The other agent: **codex-agent**

### Session Start Checklist (DO THIS FIRST)

Every time you start a session, do ALL of these BEFORE editing any file:

1. Read this file (`CLAUDE.md`) — auto-loaded
2. Read `docs/IMPORTANT/STATUS.md` for full spec
3. Run `git log --oneline -10` to see recent commits
4. **Read `.agent-locks.json`** — check what files are locked and by whom
5. **Read `.agent-mail.json`** — check for messages from codex-agent
6. If there are unread messages addressed to you (`"to": "claude-agent"`, `"read": false`), mark them as `"read": true`

### File Locking Rules

1. **Before editing ANY file**, read `.agent-locks.json`
2. If the file appears with `"agent": "codex-agent"`, **DO NOT touch it** — work on something else or send a message requesting access
3. Before editing a file, **add your lock** to the `locks` array in `.agent-locks.json`
4. You may lock multiple files at once if they're part of the same task
5. **When done**, remove your locks from `.agent-locks.json` (keep codex-agent locks intact)
6. **NEVER** remove locks belonging to `codex-agent`

### How to Add a Lock

Read `.agent-locks.json`, then append your entry to the `locks` array:

```json
{
  "locks": [
    {
      "file": "apps/desktop/src/pages/EditorPage.tsx",
      "agent": "claude-agent",
      "task": "M17: TipTap block editor integration",
      "since": "2026-02-10T14:30:00Z"
    }
  ],
  "schema": { ... }
}
```

If codex-agent already has locks, the array will have entries from both agents — that's fine. Only add yours, don't touch theirs:

```json
{
  "locks": [
    {
      "file": "apps/api/app/routers/documents.py",
      "agent": "codex-agent",
      "task": "Fix document pagination",
      "since": "2026-02-10T15:00:00Z"
    },
    {
      "file": "apps/desktop/src/pages/EditorPage.tsx",
      "agent": "claude-agent",
      "task": "M17: TipTap block editor integration",
      "since": "2026-02-10T14:30:00Z"
    }
  ],
  "schema": { ... }
}
```

### How to Remove Your Locks

When done, rewrite `.agent-locks.json` keeping only codex-agent entries (remove all entries where `"agent": "claude-agent"`).

### How to Send a Message

If you need a file locked by codex-agent, or need to coordinate, add a message to `.agent-mail.json`:

```json
{
  "messages": [
    {
      "from": "claude-agent",
      "to": "codex-agent",
      "subject": "Need access to EditorPage.tsx",
      "body": "I need to modify EditorPage.tsx for M17 TipTap integration. Can you release the lock when done?",
      "timestamp": "2026-02-10T14:35:00Z",
      "read": false
    }
  ],
  "schema": { ... }
}
```

When you see messages addressed to you with `"read": false`, update them to `"read": true`.

### Pre-Commit Checks (MANDATORY)

Before every commit, run ALL of these:

```bash
cd apps/desktop && npx tsc --noEmit        # typecheck
cd apps/desktop && npx vitest run           # desktop tests
cd apps/desktop && npx vite build           # production build
cd apps/api && python -m pytest tests/ -x -q # API tests
```

### Conflict Resolution

- If both agents edited the same file, the **first commit wins**. The second agent must rebase and resolve.
- Always `git pull --rebase` before committing.
- If you detect a merge conflict in `.agent-locks.json` or `.agent-mail.json`, **merge both arrays** (union of locks, union of messages).
