# Whisperall - AI Context Pack (Upload This)

Date: 2026-02-03

Purpose: a minimal-but-complete set of context you can upload to another AI to get a real analysis (product + monetization + UX + architecture).

## 1) Files To Upload (Recommended)

Core product + UX direction:
- `README.md`
- `docs/PRODUCT_AND_UI_DIRECTION.md`
- `docs/FEATURE_INVENTORY.md`
- `docs/PAIN_POINTS.md`
- `docs/TECHNICAL_CONSTRAINTS.md`
- `docs/PRICING_AND_PLANS_DRAFT.md`
- `docs/COMPETITOR_FEATURE_MATRIX.md`
- `docs/METRICS_AND_USAGE_BASELINE.md`
- `docs/UI_AUDIT_AND_REFACTOR_PLAN.md`
- `docs/MODULES_QA.md`
- `docs/GUIA_MODELOS_IA_APIS.md`

Screenshots:
- 8-12 screenshots showing: Dictate, Reader, TTS, Models, Settings, the provider selector dropdown issue, and one "busy" module (Dubbing/Transcribe).

Optional code (only if the AI needs architecture clarity):
- `ui/frontend/src/components/module/ModuleShell.tsx`
- `ui/frontend/src/components/UnifiedProviderSelector.tsx`
- `ui/frontend/src/app/layout.tsx`
- `ui/frontend/src/components/Sidebar.tsx`
- `ui/backend/main.py`

## 2) Prompt (Copy/Paste)

```text
Act as Product Lead + UX Lead + Frontend Architect for a Windows Electron app called Whisperall.
Goal: make it a coherent, sellable product (Wispr Flow competitor) with consistent UI and a clear core loop.

You have these inputs: product/UX docs, feature inventory, competitor matrix, technical constraints, pain points, screenshots, and module docs.

Deliverables:
1) Product definition in 5-7 lines: target user, core promise, what it is NOT.
2) Diagnosis: top 10 reasons it is not monetizable today (product + UX + UI + architecture).
3) Strategy: choose the "core product" (what module leads) and reframe the rest as Tools/Labs; propose what to cut or postpone.
4) Monetization: propose 2-3 plans (Free/Pro/Teams) with what is gated and why (include BYOK strategy).
5) UX: propose 2 critical flows (Dictation and Transcribe) with clear steps; show where provider/model selection is hidden (progressive disclosure).
6) UI architecture: concrete rules for layout/components and a phased refactor plan that reduces duplication.
7) Roadmap: next 7 days and next 6 weeks with deliverables and risks.
8) Questions: 8-12 high-leverage questions that change decisions.

Rules:
- Be specific and prioritized (impact vs effort).
- State assumptions and uncertainty explicitly.
- Prefer tables when useful.
```

## 3) Sanity Checklist (Before Sharing)

- Remove any secrets (API keys, tokens).
- Do not upload `node_modules`, `.next`, logs, or large model files.
- If you share `docs/METRICS_AND_USAGE_BASELINE.md`, remove the local snapshot section if you consider it sensitive.

