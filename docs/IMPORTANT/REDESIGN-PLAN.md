# WhisperAll — Redesign Plan (single source of truth)

> Living doc. Update on every decision. Read this BEFORE writing code on a new session.
> Cross-refs: `docs/design-system/elevenlabs.md`, `CHANGELOG.md`, `CLAUDE.md`.

---

## 0. Decisions locked in

| Topic | Decision | Source |
|---|---|---|
| Design system | **ElevenLabs design-md** (`docs/design-system/elevenlabs.md`) as the grammar: near-white canvas, warm stone accent, multi-layered sub-0.1 opacity shadows, pill buttons 9999px, letter-spacing aéreo. | User, April 2026 |
| Theme | **Dual theme** (light + dark) with runtime toggle. Default **light**. | User: "c" → "light" |
| Typography | Display/body: **Geist** + **Geist Mono** (open source). Replaces Waldenburg from the design-md. | User: "open source" |
| Initial attack order | **Bugs first → settings redesign → full redesign**. | User, this conversation |
| Versioning policy | Bump `apps/desktop/package.json` + entry in `CHANGELOG.md` on every meaningful change. Version badge in sidebar opens a modal (NOT GitHub). | User, this conversation |
| Language in UI responses | Spanish. | CLAUDE.md |

---

## 1. Outstanding bugs (block before continuing)

| # | Bug | Hypothesis | Files |
|---|---|---|---|
| B1 | **Repaste fantasma**: after a successful record/paste, a second record without speaking → stops → pastes the SAME previous text. | `dictation` store keeps `lastResult`/`text` between cycles and `stop` path reads it when no audio captured. Need to clear result on start, and guard paste-on-stop when no audio was captured (check RMS / duration threshold). | `apps/desktop/src/stores/dictation.ts`, `apps/desktop/src/pages/DictatePage.tsx` (record pipeline) |
| B2 | **"Nueva nota" carries previous unsaved draft.** | Editor state (title/htmlContent/documentId) persists between create-new actions; the new-note handler doesn't reset local state when `documentId` transitions to null. | `apps/desktop/src/pages/EditorPage.tsx` |
| B3 | **No widget during recording** — cannot stop/pause without right-click. | No UI primitive for "action in progress". Covered by the Action System (§2). | new component |
| B4 | **Topbar overlaps action buttons** (copiar/descargar/guardar in editor). | Editor header `pt-12` is not enough for wider button rows; native window chrome bleeds into the action row on some widths. | `apps/desktop/src/pages/EditorPage.tsx`, `src/components/shell/AppShell.tsx` `h-10 drag-region` |
| B5 | **Editor doesn't use full width** when sidebar collapsed. | `EditorPage` container uses `px-8` or `max-w-*` constraints that don't adapt; or flex shrinking math with collapsed sidebar leaves empty rails. | `apps/desktop/src/pages/EditorPage.tsx` |
| B6 | **Version badge opens GitHub** instead of a local changelog modal. | `VersionBadge.tsx` uses `openExternal` with a remote URL. Needs a `ChangelogModal` that reads/parses `CHANGELOG.md` bundled with the app. | `apps/desktop/src/components/shell/VersionBadge.tsx`, new `ChangelogModal.tsx` |
| B7 | **Voice Note button is redundant** — right-click on note already offers voice capture. | Remove button entirely; keep only the "+" nota in sidebar. | `apps/desktop/src/components/shell/Sidebar.tsx` |

### Bug fix order
1. B1 repaste (blocks trusting the app)
2. B2 draft leak (user-facing stale content)
3. B7 drop Voice Note button (trivial cleanup, unblocks sidebar)
4. B6 changelog modal (trivial, user-visible)
5. B4 topbar spacing (trivial)
6. B5 full-width editor (trivial)
7. B3 recording indicator → solved when the Action System ships (§2)

---

## 2. Action System (reusable "action in progress" primitive)

> The recording widget is the first instance of a **generic Action System**. Any long-running user action (record/pause/resume/stop, transcribing a file, reading TTS, live meeting, AI-edit task) exposes its state through the same API and renders the same chrome with per-action variants.

### 2.1 Concept

A single visual primitive — **ActionPill** — that is always visible when at least one action is active. It reflects:
- Action type (mic, transcribe, tts, live, ai-edit)
- Status (starting | running | paused | finishing | failed)
- Progress (0..1 optional) or elapsed time
- Per-action controls (pause, resume, stop, cancel) rendered as icon buttons
- Quick tap → expands to a sheet with detail (live transcript preview, last error, retry)

### 2.2 Data contract

```ts
type ActionKind = 'mic' | 'transcribe' | 'tts' | 'live' | 'ai-edit' | 'tts-read';
type ActionStatus = 'starting' | 'running' | 'paused' | 'finishing' | 'completed' | 'failed';

interface ActionInstance {
  id: string;                // unique per instance
  kind: ActionKind;
  status: ActionStatus;
  label: string;             // human-readable ("Recording note", "Transcribing foo.m4a")
  progress?: number;         // 0..1 (undefined = indeterminate)
  startedAt: number;
  error?: string;
  canPause: boolean;
  canResume: boolean;
  canStop: boolean;
  canCancel: boolean;
  // Handlers (run inside the owning store)
  pause?: () => void | Promise<void>;
  resume?: () => void | Promise<void>;
  stop?: () => void | Promise<void>;
  cancel?: () => void | Promise<void>;
  // Optional live preview payload (last partial transcript, etc.)
  preview?: { text?: string; timer?: number };
}
```

### 2.3 Stores + wiring

- `src/stores/actions.ts` — Zustand store with `register/update/remove/get` per instance. Subscribes nothing; OTHER stores call into it.
- `dictation`, `live`, `tts`, `transcription`, `ai-edit` stores each **register** an `ActionInstance` on start, **update** progress/status, **remove** on completion. They already hold the handlers (pause/resume/stop), so the store just wires them.

### 2.4 UI surfaces that consume Actions store

- **ActionPill** (bottom-right fixed, stacks up to 3 concurrent; collapses to a single "+N" badge beyond). Shows icon+label+controls. Respects drag region / tray.
- **ActionSheet** (click ActionPill → expands inline sheet with preview, timer, full controls, Copy last error).
- **Overlay Widget** — the existing overlay.html can subscribe to the same Actions store (via an electron IPC bridge) so a floating OS-level control is consistent with the in-app pill.
- **Editor inline banner** — when an action is bound to the current document (e.g. a "record into this note" mic session), the editor shows a thin inline banner with the same controls, anchored above the content area.

### 2.5 Bounded UI tokens per kind

| kind | icon | accent |
|---|---|---|
| mic | `mic` | red-500 pulse during `running` |
| live | `graphic_eq` | primary |
| transcribe | `graphic_eq` / `description` | primary |
| tts | `volume_up` | emerald-400 |
| tts-read | `text_to_speech` | emerald-400 |
| ai-edit | `auto_fix` | purple-400 |

### 2.6 Animations

- Status transitions: 200ms ease-out, no bounce.
- Running state: subtle 1.5s loop (breathing) on the icon; NOT on the container.
- Pause: icon freezes at mid-breath, controls swap to `play_arrow`.
- Progress: linear bar inside the pill at `2px` height.
- Error: flash red 600ms, then hold red until user dismisses or retries.

---

## 3. "Typewriter reveal" for record-into-note

> Required by user: when recording dictates into the editor, don't snap-paste at the end. Stream in real-time, with a fade-blur animation à la Claude-web.

- **Source of truth**: real-time partial transcripts from the STT provider (OpenAI gpt-4o-mini-transcribe supports streaming; Deepgram live stream is already wired). When the user records INTO a note, the flow must be the live streaming flow, NOT the file flow that waits-then-pastes.
- **Reveal mechanism**: every new finalized word is appended inside a span with classes `opacity-0 blur-[3px]` that transition to `opacity-100 blur-0` in 220ms. Partial/interim text renders with `text-muted/60 italic` and is replaced in place as the STT refines it.
- **Speed guard**: if the stream delivers too fast, buffer and reveal at max 8 words/sec to preserve the "writing" feel.
- **Accessibility**: honor `prefers-reduced-motion` by dropping blur and dropping duration to 80ms (instant fade).

Implementation note: this is a TipTap/editor-level concern. Until M17 introduces TipTap, we render the streaming text as a separate overlay span pinned to the caret in the plain textarea.

---

## 4. Settings redesign

> User said "el que creas que mejor funciona". Plan: **rail lateral de pestañas** inside the same modal surface.

- **Left rail** (160px): icon + label per section. Sticky. Sections:
  1. General (language, theme, startup)
  2. Hotkeys
  3. Dictation (voice, punctuation, cue sounds, auto-paste)
  4. Transcription (provider, diarization, default language)
  5. Text-to-Speech (voice, speed, language)
  6. Live meetings (source, diarization)
  7. Translation (target languages, provider)
  8. Overlay / Widget
  9. Appearance (theme toggle, density, typography sample)
  10. Account + Plan
  11. Advanced (debug mode, logs location, clear cache)
- **Right pane**: scrollable content for the active section, single column, max-w-xl, consistent spacing.
- **Header**: title + close. Sticky footer (optional) for "Discard / Save".
- Keyboard: `Cmd/Ctrl+,` opens, `Esc` closes, `Tab` navigates rail, `Enter` activates.
- Each setting row uses the ElevenLabs card grammar (inset border-shadow, subtle outline).

---

## 5. Full redesign (post-bug phase)

Applies the ElevenLabs grammar (adapted to Geist, dual-theme) across the app.

### 5.1 Tokens (Tailwind v4, `@theme`)

- Palettes **light** and **dark** as CSS variables. Swap via `data-theme="light|dark"` on `<html>`.
- Scales:
  - `--color-base` (canvas), `--color-surface`, `--color-surface-alt`, `--color-edge`, `--color-text`, `--color-muted`, `--color-primary`, `--color-warm`, `--color-accent`
- Shadow stacks as `--shadow-*` tokens (inset-border, outline-ring, soft-elevation, warm-elevation, edge).
- Radius: `--radius-pill: 9999px`, `--radius-card: 14px`, `--radius-input: 10px`.
- Fonts: `--font-display`, `--font-body` → Geist; `--font-mono` → Geist Mono.
- Letter-spacing presets for the "aéreo" body feel.

### 5.2 Theme store + toggle

- `src/stores/theme.ts` (Zustand + persist). Initial: `prefers-color-scheme` → fallback to `light`.
- Toggle button in top-right, next to notifications bell.
- `ThemeProvider` sets `data-theme` on `<html>` and listens to OS changes only while user picked "auto".

### 5.3 Component rewrites (in order)

1. `AppShell` — topbar drag region, theme toggle, notifications bell
2. `Sidebar` — rail look, softer borders, Geist
3. `EditorPage` — full-width-aware layout, inline recording banner, editor block padding
4. `DictatePage` — simplified, delegates to streaming transcript
5. `ActionPill` + `ActionSheet`
6. `SettingsModal` with rail
7. `ChangelogModal`
8. Buttons / inputs / cards primitives in `src/components/ui/`
9. Overlay widget (plain CSS) — port tokens

### 5.4 Out of scope (deferred)

- TipTap rich editor (M17) — redesign must survive the eventual swap.
- New icon system — keep Material Symbols Outlined.

---

## 6. Phases & order of execution

1. **Phase A — Bugs** (this turn or next): B1 → B2 → B7 → B6 → B4 → B5.
2. **Phase B — Action System**: store + ActionPill + wiring from dictation/live/transcription/tts.
3. **Phase C — Typewriter streaming** for record-into-note.
4. **Phase D — Settings modal redesign** (rail + sections).
5. **Phase E — Full redesign** (tokens → theme store → AppShell → Sidebar → EditorPage → DictatePage → buttons/inputs).
6. **Phase F — Verification**: typecheck, vitest, vite build, pytest, `Whisperall.bat` smoke test, e2e.

Every phase ends with a **CHANGELOG entry + version bump + commit**.

---

## 7.bis Bugs found in the v0.18.3-alpha portable (2026-04-17 smoke)

Claude ran `e2e-ai/claude-smoke.mjs` — a Playwright-driven launch of the built
portable (`release/win-unpacked/Whisperall.exe`) against an isolated user-data
dir. Findings to fix next cycle:

| # | Severity | Bug | File(s) / key |
|---|---|---|---|
| 1 | **high** | Default theme renders **dark** despite Phase E1 default=light. With empty localStorage the app still loads dark. Root cause likely `applyTheme('system')` falling through to OS preference (which is dark on this machine). Default must be hard-`light`, not `system`, on first boot. | `src/stores/settings.ts:172` initial `theme: 'light'` + bootstrap in `index.html:18` |
| 2 | **high** | **UTF-8 mojibake** in `auth.heroDesc` — string shows `ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â` where an em-dash should be. The file got double-encoded at some point. | `src/lib/i18n.ts` (search for `ÃƒÂ¢` to find all affected keys) |
| 3 | low | Footer on AuthPage shows hardcoded **`WHISPERALL v2`** — should use the live version from `package.json` or drop the label. | `src/pages/AuthPage.tsx` |
| 4 | **medium** | Overlay window opens at **`x: -948`** (off-screen, negative X) — persisted position from a monitor that's no longer attached. `intersectsAnyDisplay` isn't catching it. | `electron/modules/overlay.ts` `resolveSafeBounds` |
| 5 | low | CSP meta tag uses `frame-ancestors` directive which Chromium ignores in meta (must be HTTP header). Warning only, not a security hole. | `overlay.html` (the meta CSP block) |
| 6 | blocker for tests | Auth gate blocks E2E tests. Need a `WHISPERALL_TEST_MODE=1` env that mocks the Supabase user so tests can drive Notes/Dictation/Settings without real credentials. | `src/stores/auth.ts` + `src/App.tsx` authLoading gate |

Script + screenshots preserved under `apps/desktop/e2e-ai/out/<ts>/`.

## 7. Known pre-existing type errors (NOT introduced by this redesign)

- `apps/desktop/src/pages/DictatePage.tsx:1336` — label/labelKey discriminated union mismatch.
- `apps/desktop/src/stores/transcription.ts:469` — `audioUrl` typed `string | null` vs store expects `string | undefined`.

Fix opportunistically, do not gate Phase A on them.

---

## 8. Log for future sessions

| Date | Change | Version |
|---|---|---|
| 2026-04-15 | Baseline: i18n fix, Sidebar rebuild, Logs page, ErrorBoundary, notifications v2, backend IPC bridge, design-md installed. | 0.1.0 |
| _pending_ | Phase A bug fixes | 0.1.1+ |
