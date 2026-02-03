# Whisperall - Technical Constraints (Explicit)

Date: 2026-02-03

This document is meant to prevent product/UI decisions that fight the technical reality.

## 1) Platform / Runtime

- Primary target: Windows desktop.
- Shell: Electron.
- Frontend: Next.js + React (see `ui/frontend/package.json`).
- Backend: Python services (local inference + APIs).

Implication for UX:
- The app can behave like a native desktop product (tray, global hotkeys, overlays), but we must treat those as first-class UX surfaces (not an afterthought).

## 2) Local-First vs Cloud

- Whisperall supports both:
  - Local models (offline-capable, privacy-first, GPU recommended).
  - Cloud providers (require API keys; network required).

Implications:
- "Offline capable" is a strong differentiator, but only if the default path is smooth (model download UX, hardware checks, sensible defaults).
- BYOK (bring-your-own-key) reduces infra cost but increases setup friction. The UI must hide complexity (Simple mode) and guide setup when needed.

## 3) GPU/CPU Reality

- Many local models are GPU-first (CUDA) and can be slow on CPU.
- We must support:
  - Device selection: auto / cpu / cuda (where relevant).
  - Fallback behavior: if CUDA fails (OOM), degrade gracefully to CPU or smaller model.

UX implications:
- Users do not think in "VRAM" or "CUDA versions". The UI should present "Fast / Balanced / Best quality" and translate that into model/device choices internally.

## 4) Model Downloads and Storage

- Local models require downloading and disk space (often large).
- Storage lives in the OS app data directory (Windows: `%LOCALAPPDATA%\\Whisperall` or legacy `%LOCALAPPDATA%\\ChatterboxUI`).
- History is stored in a local SQLite DB (`history.db`).

UX implications:
- Missing model must never feel like "the app is broken". It must feel like "one step left: Download".
- The Models page is part of the core experience, not a niche settings page.

## 5) Latency Targets (Product Targets, Not Guarantees)

To compete in dictation:
- Time-to-feedback (overlay shows "listening"): ~instant.
- Time-to-first partial transcript: target < 1s (depends on provider/device).
- Time-to-final transcript after stop: target < 3-5s for short utterances.

Implications:
- If local models can't hit these targets on typical hardware, Simple mode should default to the best-performing local model; Pro mode can expose alternatives.

## 6) Privacy / Compliance

- Local-first means we can make a strong privacy posture without building server infrastructure.
- Cloud providers require explicit user consent and key setup; privacy mode should be defined at the product level.

Implications:
- Add a "Privacy Mode" concept in Settings that enforces local-only behavior (and clearly explains tradeoffs).

## 7) Dependency Constraints (Known)

- WhisperX vs diarization dependencies can conflict (example noted in `README.md`: numpy constraints).

Implication:
- Advanced workflows (diarization, WhisperX) need clear install/compat UX or separate environments; otherwise they become support debt.

## 8) Architecture Constraint: UI Consistency Requires Shared Components

- UI must be composed from shared layout + components (`components/module/*`) to avoid drift.

Implications:
- No new module should ship with a bespoke layout.
- Provider/model selection should be centralized (one component, one pattern).

