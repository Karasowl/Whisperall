# M20 — Notes-Centric Workspace + Process Center

Status: Planned  
Owner: Product + Desktop + API  
Created: 2026-02-20

## 1) Why this milestone

Current functionality is powerful but scattered across multiple pages.  
Target philosophy:

- Notes is the main workspace.
- Reader and Transcribe are actions inside a note.
- Long-running operations are asynchronous, visible globally and per note.
- No regression: all existing features must remain available.

## 2) Non-negotiables

- Do not remove any current capability (dictation, live meeting, transcribe, reader, translate, subtitles, AI edit, export).
- Keep hotkeys and existing overlay behavior.
- Keep background continuity: user can start a process and keep working elsewhere.
- Use phased rollout with feature flags and backwards compatibility.
- Notes organization is based on real folders/subfolders (not tags as primary structure).
- Folders are optional: notes can stay in root.

## 3) UX target model

## 3.1 Main navigation

- `Notes` (primary day-to-day workspace)
- `Processes` (global async dashboard) OR integrated Notifications center with full process view
- `History` (usage/audit logs)
- `Settings`

Reader/Transcribe standalone pages can remain temporarily behind flags during migration.

## 3.1.1 Explorer-style folder tree

- Left/right side tree panel (implementation choice) behaves like a file explorer:
  - `Root` (all notes without required folder)
  - folders
  - subfolders (recursive)
- Folders are real entities; tags are not required for this phase.
- Expected interactions:
  - create folder / subfolder
  - rename
  - move note to folder
  - move folder in tree
  - collapse/expand branches
- Root view is always available and first-class.
- Folders are optional; creating notes in root must stay frictionless.

## 3.2 Note workspace

Inside each note:

- Primary action groups:
  - Capture (dictation/live)
  - Import (file/url/ocr)
  - Read (TTS controls)
  - AI (clean/summarize/formal/custom prompts)
- "Processes for this note" panel:
  - Running/paused/failed/completed items only for current `document_id`
  - Retry/cancel/open result actions
- "Note History" panel:
  - Revision timeline
  - Restore point
  - Diff preview

## 3.3 Notifications + alarms

- Each process type can emit:
  - silent notification
  - toast notification
  - toast + sound alarm
- User controls:
  - global default
  - per-process override (e.g. long transcribe with sound, AI edit without sound)

## 4) Technical architecture

## 4.1 Unified process domain

Keep current `transcribe_jobs`; add unified representation:

- `process_type`: `transcribe_file | transcribe_url | import_ocr | ai_edit_batch | tts_render | ...`
- `status`: `queued | running | paused | failed | completed | canceled`
- `progress_current`, `progress_total`, `progress_pct`
- `document_id` (nullable only for global ops)
- `summary`, `error_message`, `started_at`, `updated_at`, `completed_at`

Mapping strategy:

- Transcribe jobs: adapter layer maps existing job fields to unified DTO
- New async tasks: first-class entries in new process table (or service layer + events table)

## 4.2 Note revisioning

Initial version (safe and simple):

- `note_revisions` table: full content snapshot + metadata (`document_id`, `source_action`, `created_at`, `author`)
- restore any revision
- diff view against current

Follow-up (optional optimization):

- block-level or line-level deltas once baseline timeline is stable

## 4.3 Realtime + resilience

- Realtime updates via Supabase subscriptions
- Recover in-flight jobs after app restart
- Idempotent status transitions
- Retry from failed state when operation supports it

## 4.4 Folder hierarchy model

Baseline data model:

- `folders.id`
- `folders.user_id`
- `folders.name`
- `folders.parent_id` (nullable; `null` = top-level folder)
- `documents.folder_id` (nullable; `null` = root note)

Rules:

- Prevent folder cycles (`A -> B -> C -> A` invalid).
- Subfolders supported recursively.
- Folders are not mandatory for notes.
- Tags can exist later as secondary metadata, not as primary navigation.

Limits (recommended):

- No hard low limit for normal users initially.
- Add guardrails:
  - soft warning for very deep nesting (example depth > 8)
  - soft warning for very large sibling sets (example > 500 children)
- If needed later, enforce server-side limits with explicit error messages.

## 5) Delivery phases

## M20.1 IA foundation

Deliverables:

- Notes-first nav structure
- Reader/Transcribe actions exposed in note toolbar
- Explorer-style folder tree with root + subfolders
- Optional folder usage (notes can stay in root)
- Feature flags for controlled rollout

Tests:

- Nav regression E2E
- Existing feature smoke tests unchanged

## M20.2 Process center

Deliverables:

- Global Process Hub view (or Notifications center extended as full process panel)
- Per-note process panel
- process notifications + optional sound alarms

Tests:

- Store tests for filters/state transitions/retry/cancel
- E2E for "start process in note A, monitor from global panel"

## M20.3 Unified async engine

Deliverables:

- Adapter for `transcribe_jobs` into unified process DTO
- New async process records for non-transcribe operations
- Resume/recovery logic on startup

Tests:

- API router tests for process lifecycle
- Desktop tests for startup recovery + realtime updates

## M20.4 Note history

Deliverables:

- Revision timeline
- Restore point
- Diff preview

Tests:

- API tests for revision create/list/restore
- E2E: edit -> save -> restore specific revision

## M20.5 UX polish and hardening

Deliverables:

- Toolbar cleanup and grouping
- Consistent progress and error language
- Final migration path to retire standalone Reader/Transcribe pages (when telemetry confirms adoption)

Tests:

- Full regression: desktop vitest + API pytest + key E2E flows

## 6) Acceptance criteria

- User can complete all previous workflows from Notes without losing functionality.
- User can monitor all active processes in one place.
- User can inspect processes for current note.
- User can configure notification/sound behavior per process type.
- User can restore a note to an older revision.
- User can organize notes using real folders/subfolders and still keep notes in root when desired.
- No critical regressions in existing test suites.

## 7) Risks and mitigations

- Risk: migration confusion with duplicated entry points.
  - Mitigation: feature flags + phased rollout + in-app affordances.
- Risk: async complexity increases failure states.
  - Mitigation: explicit process state machine and retry semantics.
- Risk: revision storage growth.
  - Mitigation: retention policy + optional compression + future delta storage.
- Risk: deep folder trees can degrade usability/performance.
  - Mitigation: lazy loading/virtualized tree + depth/sibling guardrails.
