# Whisperall Desktop Design System (Working Spec)

Last updated: 2026-02-11
Scope: `apps/desktop/src/*` and `apps/desktop/src/overlay/*`

This document is the shared UI/UX contract for parallel agent work. It is intentionally based on the current implementation, not an aspirational redesign.

## 1. Source of Truth Files

- Tokens and global styles: `apps/desktop/src/index.css`
- App shell and navigation layout: `apps/desktop/src/components/shell/AppShell.tsx`, `apps/desktop/src/components/shell/Sidebar.tsx`
- Main page patterns: `apps/desktop/src/pages/DictatePage.tsx`, `apps/desktop/src/pages/TranscribePage.tsx`
- Settings and theme controls: `apps/desktop/src/components/shell/SettingsModal.tsx`, `apps/desktop/src/stores/settings.ts`
- Overlay widget styles: `apps/desktop/src/overlay/widget.css`

If code and this doc diverge, code is currently authoritative. Update this doc in the same PR.

## 2. Core Visual Tokens

### 2.1 Theme Variables (semantic layer)

Defined in `index.css`:

- `--theme-base`
- `--theme-surface`
- `--theme-surface-alt`
- `--theme-edge`
- `--theme-muted`
- `--theme-text`
- `--theme-text-secondary`

Dark values are in `html.dark`; light values are in `:root`.

### 2.2 Tailwind v4 Token Mapping

Use these semantic classes first:

- Backgrounds: `bg-base`, `bg-surface`, `bg-surface-alt`
- Text: `text-text`, `text-text-secondary`, `text-muted`
- Borders: `border-edge`
- Accent: `text-primary`, `bg-primary`, `border-primary`

### 2.3 Typography and Iconography

- Font family: `Inter` via `font-display`
- Material icons: `material-symbols-outlined` class
- Fill variant for active icons: `fill-1`

### 2.4 Motion

Global animations already available:

- `animate-blink`
- `animate-shimmer`
- `animate-fade-in-down`

Do not add new animation styles unless reused in at least 2 places.

## 3. Layout and Composition Rules

### 3.1 Shell

- Root app uses `AppShell` with left sidebar and one active page.
- Page body standard: `flex-1 flex flex-col overflow-hidden`.
- Top drag region exists and must not be covered by interactive controls.

### 3.2 Spacing Rhythm

Current pattern to keep:

- Page horizontal padding: `p-8`
- Top content padding under drag region: `pt-12`
- Section gaps: `gap-6` or `gap-8`
- Card radius: `rounded-xl` to `rounded-2xl`

### 3.3 Feedback Surfaces

- Errors: red or amber banner blocks with border + muted text.
- Success inline: compact green check + label.
- Action feedback (copy/export) should be short-lived and visible near action controls.

## 4. Interaction and UX Consistency Rules

- Every clickable icon-only action needs one of:
  - visible text label, or
  - tooltip/title plus nearby inline feedback.
- Any operation that can fail (copy, export, API action) must surface a user-facing message.
- Destructive actions (delete note/document) require confirmation.
- New user-visible strings must go through i18n keys.

## 5. Light Mode Status (Known Issue)

Light mode exists in settings (`light | dark | system`) but is currently not production-ready.

### 5.1 Why it is broken right now

Several views still hardcode dark visuals instead of semantic tokens. Example patterns:

- Hardcoded page background: `bg-[#161b22]`
- Hardcoded ring contrast: `ring-white` with `ring-offset-[#161b22]`
- Dark-tinted hover/notification backgrounds such as `bg-blue-900/20`

Primary known location: `apps/desktop/src/pages/DictatePage.tsx` (list and edit wrappers, tag ring, hover states).

### 5.2 Rule until fixed

- Treat dark mode as stable default.
- Treat light/system as beta.
- No new hardcoded dark hex values in TSX classes.

### 5.3 Fix acceptance criteria

Light mode can be considered fixed when:

1. Dictate list + edit pages render with semantic theme tokens only.
2. Icon button contrast is readable in both themes.
3. Ring/offset and chip states do not assume dark backgrounds.
4. Manual QA confirms `light`, `dark`, and `system` all readable.

## 6. Engineering Guardrails for Parallel Work

- Prefer semantic token classes over raw palette classes for neutral surfaces.
- If a new color/token is needed, add it in `index.css` and consume semantically.
- Keep overlay styles isolated in `overlay/widget.css`.
- Before merging UI work:
  - run `npx tsc --noEmit`
  - run `npx vitest run`
  - run `npx vite build`

## 7. PR Checklist for UI Changes

- Uses existing semantic tokens (`base/surface/edge/text/muted/primary`)
- Includes loading/error/success UX for user-triggered actions
- i18n keys added for new text
- Screenshot checked in dark mode
- Screenshot checked in light mode (even if marked beta)
- No hardcoded dark-only hex values added in TSX

