# WhisperAll — Codex Agent Instructions

> This file is read by Codex (OpenAI) at session start.
> The other agent ("claude-agent") reads `CLAUDE.md`. Do NOT modify `CLAUDE.md`.

## What is this app?

All-in-one voice AI desktop app replacing wisprflow.ai + granola.ai + speechify.com + turboscribe.ai.
Overlay widget for quick access from any OS app. Dark-only, minimal, under 2000 LOC per feature batch.

## Architecture

```
apps/api/app/              FastAPI — routers/ providers/ (7 each), auth.py, db.py, schemas.py
apps/desktop/electron/     Electron main + 7 modules (TS source)
apps/desktop/electron-dist/ Compiled CJS output (tsc -p tsconfig.electron.json)
apps/desktop/src/          React + Tailwind v4 — pages/ stores/ lib/ components/ overlay/
packages/api-client/       Typed TS endpoints for all 6 API routers
supabase/migrations/       DB schema
```

## Key Patterns (DO NOT break these)

- `settings` singleton — test with `patch.object(settings, ...)`, NOT monkeypatch.setenv
- Mock providers at router import: `app.routers.dictate.openai_stt.transcribe`
- Import from `@whisperall/api-client` barrel, NOT subpaths
- State-based routing via `useState<Page>`, no react-router
- Overlay = separate Vite entry (overlay.html), plain CSS (not Tailwind)
- Electron mocks: `vi.mock('electron')` + `vi.resetModules()` per test
- `data-testid` attributes for all E2E selectors
- Under 100 lines per component

## Design System

- Colors: primary `#137fec`, bg `#101922`, surface `#1c242c`, border `#283039`, muted `#9dabb9`
- Font: Inter 300-900, Icons: Material Symbols Outlined (FILL 0..1)
- Dark-only, glassmorphism overlay, paper-texture dictate bg

## Test Commands

```bash
cd apps/api && python -m pytest tests/ -x -q      # API tests
cd apps/desktop && npx vitest run                   # desktop tests
cd apps/desktop && npx vite build                   # production build
cd apps/desktop && npx tsc --noEmit                 # typecheck
```

---

## Multi-Agent Coordination

> This project uses a file-locking + messaging protocol so two AI agents can work simultaneously without conflicts.
> The other agent is **claude-agent** (Claude Code by Anthropic). It reads `CLAUDE.md`, not this file.

### Your Identity

- Agent name: **codex-agent**
- The other agent: **claude-agent**

### Session Start Checklist (DO THIS FIRST)

Every time you start a session, do ALL of these BEFORE editing any file:

1. Read this file (`AGENTS.md`)
2. Read `docs/IMPORTANT/STATUS.md` for full spec + what's done/left
3. Run `git log --oneline -10` to see recent commits
4. **Read `.agent-locks.json`** — check what files are locked and by whom
5. **Read `.agent-mail.json`** — check for messages from claude-agent
6. If there are unread messages addressed to you (`"to": "codex-agent"`, `"read": false`), mark them as `"read": true`

### File Locking Rules

1. **Before editing ANY file**, read `.agent-locks.json`
2. If the file appears with `"agent": "claude-agent"`, **DO NOT touch it** — work on something else or send a message requesting access
3. Before editing a file, **add your lock** to the `locks` array in `.agent-locks.json`
4. You may lock multiple files at once if they're part of the same task
5. **When done**, remove your locks from `.agent-locks.json` (keep claude-agent locks intact)
6. **NEVER** remove locks belonging to `claude-agent`

### How to Add a Lock

Read `.agent-locks.json`, then append your entry to the `locks` array:

```json
{
  "locks": [
    {
      "file": "apps/api/app/routers/documents.py",
      "agent": "codex-agent",
      "task": "Fix document pagination",
      "since": "2026-02-10T15:00:00Z"
    }
  ],
  "schema": { ... }
}
```

If claude-agent already has locks, the array will have entries from both agents — that's fine. Only add yours, don't touch theirs:

```json
{
  "locks": [
    {
      "file": "apps/desktop/src/pages/EditorPage.tsx",
      "agent": "claude-agent",
      "task": "M17: TipTap block editor",
      "since": "2026-02-10T14:30:00Z"
    },
    {
      "file": "apps/api/app/routers/documents.py",
      "agent": "codex-agent",
      "task": "Fix document pagination",
      "since": "2026-02-10T15:00:00Z"
    }
  ],
  "schema": { ... }
}
```

### How to Remove Your Locks

When done, rewrite `.agent-locks.json` keeping only claude-agent entries (remove all entries where `"agent": "codex-agent"`).

### How to Send a Message

If you need a file locked by claude-agent, or need to coordinate, add a message to `.agent-mail.json`:

```json
{
  "messages": [
    {
      "from": "codex-agent",
      "to": "claude-agent",
      "subject": "Need access to live.ts store",
      "body": "I need to add a new field to the live store for speaker labels. Can you release the lock when done?",
      "timestamp": "2026-02-10T15:05:00Z",
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

### Configuration

See `.agent-config.json` for the full coordination config: registered agents, test commands, and file paths.
