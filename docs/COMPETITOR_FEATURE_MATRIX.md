# Competitor Feature Matrix: Wispr Flow vs Whisperall (Draft)

Date: 2026-02-03

Goal: identify the real product gaps (especially Dictation UX) and translate them into a prioritized plan.

Notes:
- Wispr Flow details below are taken from publicly available pages as of this date (see Sources at bottom). They may change.
- Whisperall status is "as implemented today" + observed UX issues (not aspirational).

## High-Level Positioning

- Wispr Flow: dictation-first product, premium UX, cloud transcription, cross-device (Mac/Windows/iPhone), personalization (dictionary/snippets/styles), teams/enterprise controls.
- Whisperall: local-first speech suite (many modules) with BYOK APIs; powerful but fragmented UX and inconsistent UI architecture.

## Feature Matrix (Core Dictation / UX)

| Feature | Wispr Flow | Whisperall (today) | Gap / Opportunity | Priority |
|---|---|---|---|---|
| Works in any text field | Yes ("any app or website") | Yes (Electron overlay + paste into focused app) | Needs reliability + polish (focus/paste edge cases) | P0 |
| Global hotkey start/stop dictation | Yes | Yes (global hotkeys exist) | Must be rock-solid + discoverable + editable in UI | P0 |
| Overlay / feedback while listening | Yes (implied; product UX) | Yes (STT overlay states exist) | Needs better visual design + zero glitch; should feel premium | P0 |
| Auto punctuation | Yes | Partially (depends on provider / settings) | Standardize user-facing toggle and defaults | P0 |
| Smart formatting (lists, etc.) | Yes (numbered lists, formatting) | Partial / inconsistent | Implement formatting pipeline for dictation output | P1 |
| Backtrack / real-time correction | Yes ("actually..." correction) | Partial (backend might support partials; UX unclear) | Needs core UX feature to compete | P1 |
| Remove filler words | Yes | Has "filler_removal" setting in STT | Make it visible + predictable; show "what changed" if needed | P1 |
| Whisper mode (dictate quietly) | Yes | Unknown / not explicit | Decide if we can/should support (model + UX) | P2 |
| 100+ languages | Yes | Yes via Whisper models (local/API) | Needs a clean language selector + auto mode | P0 |
| Personal dictionary (learn spellings) | Yes | Not implemented as product feature | Big retention + differentiation, even offline | P1 |
| Manual dictionary entries | Yes | Not implemented | Add "Vocabulary" feature (personal + optional team) | P1 |
| Snippets (voice shortcuts) | Yes | Not implemented | Powerful upsell feature; minimal implementation possible | P1 |
| Styles (tone adaptation by context) | Yes (English/desktop only) | Not implemented | Optional; can be Pro via LLM, but after core stability | P2 |
| Command mode for editing | Pro feature | Not implemented | Consider lightweight "commands" first (delete last sentence, new paragraph) | P2 |
| Usage dashboards | Team/Enterprise | Not implemented | Can be local-first: basic usage metrics + privacy controls | P2 |

## Architecture / Provider Strategy

| Feature | Wispr Flow | Whisperall (today) | Gap / Opportunity | Priority |
|---|---|---|---|---|
| Cloud transcription vs local | Cloud-first (states cloud transcription) | Local-first + optional APIs | This is Whisperall's main differentiation: offline + cost | P0 |
| Provider/model choice exposed to user | Mostly hidden (productized) | Highly exposed (providers/models everywhere) | Move to Simple/Pro mode + auto-selection | P0 |
| Setup friction (first-run) | Low | Medium/High | Reduce "pick provider/model" steps; guide to one next action | P0 |
| Error handling when model missing | Guided | Often noisy / confusing | Standardize "missing model" UX and actionable CTAs | P0 |

## System Integration / Distribution

| Feature | Wispr Flow | Whisperall (today) | Gap / Opportunity | Priority |
|---|---|---|---|---|
| Platforms | Mac + Windows + iPhone | Windows-first (Electron); backend Python | Decide platform focus; ship Windows premium first | P1 |
| Tray/menu bar quality | Polished | Exists but branding/UX weak (per feedback) | Needs pro-grade tray UX + branding | P1 |
| Onboarding | Strong marketing + trial flow | Mostly developer-oriented | Build onboarding + first successful dictation in < 60s | P1 |

## Privacy / Compliance

| Feature | Wispr Flow | Whisperall (today) | Gap / Opportunity | Priority |
|---|---|---|---|---|
| Privacy mode (Zero Data Retention) | Yes | Local-first implies privacy, but not productized | Add explicit Privacy Mode toggle + behavior definitions | P1 |
| HIPAA | Yes (BAA + ZDR) | Not supported as product | If you want healthcare: needs policy + docs + controls | P3 |
| Data controls page / trust posture | Yes | Not present | Create a simple "Data & Privacy" page + local-only story | P2 |

## Pricing / Packaging (Public)

| Plan | Wispr Flow | Whisperall (today) | Notes for Whisperall |
|---|---|---|---|
| Free | Basic, free tier with weekly word limits | Free, no plan structure | Add Free tier narrative: "Local-first, offline" |
| Pro | $15/user/mo (and $12/mo billed annually) | Not defined | Recommend Pro = Simple/Pro mode + advanced workflows + presets |
| Enterprise | Contact sales; SOC2/ISO/SSO/usage dashboards | Not defined | Later; only if you commit to B2B |

## Sources (Wispr Flow)

- Features: https://wisprflow.ai/features
- Pricing: https://wisprflow.ai/pricing
- Privacy: https://wisprflow.ai/privacy
- Data Controls (Privacy Mode / Cloud transcription statement): https://wisprflow.ai/data-controls
- Help Center (Privacy Mode setup): https://docs.wisprflow.ai/articles/3967724454-how-to-setup-privacy-mode
- Help Center (HIPAA support): https://docs.wisprflow.ai/articles/4608289566-hipaa-support

