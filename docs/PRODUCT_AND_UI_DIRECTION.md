# Whisperall - Product + UI Direction (Draft)

Date: 2026-02-03

This doc is meant to align product, UX, and frontend architecture so the app can feel "one product" instead of many unrelated tools.

## Vision Decision (Recommended)

Whisperall should be **dictation-first** (a Wispr Flow competitor) with the rest of the modules positioned as **Tools** (and some as **Labs**) instead of "everything is equally important".

What this means in practice:
- Navigation, onboarding, and defaults optimize for Dictation/STT first.
- Provider/model complexity is hidden in Simple mode and unlocked in Pro mode.
- Music/SFX can exist, but should not compete for attention with the core dictation loop.

## 1) What Whisperall Is (One Sentence)

Whisperall is a local-first speech suite for Windows (Electron) that makes dictation, transcription, and voice workflows fast, private, and affordable, with optional cloud upgrades.

## 2) The Core Problem We Need To Fix

Today the app feels "technically capable" but not "product-ready":

- UX: users are forced into provider/model decisions too early; controls feel cramped; key actions are not visually obvious.
- UI: inconsistent layouts and patterns between modules; dropdowns/overlays break the page flow; repeated code creates drift.
- Product: unclear positioning (dictation app vs full audio suite), so the UI tries to serve too many mental models at once.

## 3) Product Positioning (vs Wispr Flow)

Wispr Flow is the "dictation-first" state of the art experience.

Whisperall should win on:

- Local-first privacy (offline capable).
- Lower cost (cloud optional, not required).
- Power tools for voice workflows (transcribe, voice library, dubbing, voice changer, etc.) without sacrificing the dictation experience.

But to compete, we must make Dictation/STT feel effortless and premium. Everything else should be "tools" layered on top, not equal-weight noise.

## 4) UX Principles (Non-Negotiables)

1) Default to "Works" (No setup required)
   - If a local model is installed, the app should pick a sane default automatically.
   - If not installed, the UI should guide the user to the single next step (download/install) without dumping provider lists.

2) Progressive disclosure
   - Most users want "quality/speed/language" not "provider/model/params".
   - Provider/model selection is advanced and should not dominate the UI.

3) One primary action per screen
   - Every module must have one obvious CTA and one obvious result area.

4) Consistent layout and spacing
   - The user should recognize "Whisperall pages" instantly.

5) Works out of the box (non-technical users)
   - Default path must not require model installs, Python knowledge, or API keys.
   - Offer local/offline mode as an optional "Privacy Mode" (beta) instead of the default.

## 5) Proposed Interaction Model: Simple vs Pro

Add a global "Mode":

- Simple Mode (default)
  - Hide provider/model selectors by default.
  - Show: language, quality (fast/quality), device (auto/cpu/cuda), and the primary CTA.
  - The app picks the best provider automatically (local preferred; fallback to cloud only if configured).

- Pro Mode
  - Unlock provider/model selection and advanced params.
  - Per-service overrides (TTS/STT/Translate/etc.).

This aligns with monetization: Pro Mode can be part of a paid tier.

## 6) Monetization / Plans (Draft)

This is intentionally simple and "product-shaped" (not feature soup):

- Free
  - Local-only providers (when available)
  - Basic dictation/transcribe/reader
  - Limited advanced controls (no manual provider selection)

- Pro
  - Manual provider/model selection (per module or global)
  - Cloud providers (bring-your-own-key)
  - Advanced params, presets, profiles, and workflows

- Teams (later)
  - Central settings, policy (disable providers), shared profiles, seat licensing

## 7) UI Architecture Rules (Frontend)

We already have a good direction in `ui/frontend/src/components/module/`.

Rules:

- Every module page must use `ModuleShell` (no custom top-level layouts).
- Provider selection must go through `UnifiedProviderSelector` (no bespoke provider dropdowns).
- Page-level controls belong in the settings slot; outputs belong in the output slot.
- Prefer shared components (engine selector, output panels, status alerts) over custom markup.

## 8) Module Inventory (User Jobs)

- Dictate (STT): speak -> paste into focused app (primary product experience).
- Transcribe: file -> transcript (long-form, jobs/progress).
- Reader (TTS): clipboard/text -> audio output (quick utility).
- Voice Library: manage voices/presets (supporting workflow).
- Voice Changer / Voice Isolator: audio -> transformed output (power tools).
- Dubbing: video/audio -> multi-language output (advanced workflow).
- Translate / AI Edit: text utilities (supporting).
- Music / SFX: optional creative tools (can be "Labs" to reduce product confusion).
- Models / Settings: setup and diagnostics.

Recommendation: group "Music/SFX" under a "Labs" or "Creative" section so the navigation communicates priorities.

## 9) Near-Term Execution (What We Do First)

Phase 1 (days):
- Fix broken dropdown positioning (provider selectors must not blow up layout).
- Reduce cramped controls (voice lists and selectors must be readable).
- Standardize ModuleShell usage and CTA placement.

Phase 2 (weeks):
- Introduce Simple/Pro mode and default provider selection logic.
- Add presets/profiles (per module) so users don't reconfigure repeatedly.
- Branding pass (logo, tray icon, consistent naming, polished copy).

Phase 3 (later):
- Pricing + licensing UX.
- Teams/policies.
- "Marketplace" style provider catalog (optional).
