# Whisperall - Pricing & Plans (Hypothesis Draft)

Date: 2026-02-03

This is a working doc to make monetization discussable. Numbers are placeholders and should be validated with user interviews.

## Core Assumption

If we want to compete with Wispr Flow, we need a **dictation-first** experience that feels premium. Monetization should follow the product value, not the number of modules.

Two practical models exist:

### Model A (Recommended to start): BYOK + Pro UX License

- Free tier ships with local-first capabilities (offline where possible).
- Pro sells: premium dictation UX + productivity features + Pro mode controls.
- Cloud providers remain BYOK (user supplies API keys).

Pros:
- No billing infra for usage-based API costs.
- Easy to launch; strong "privacy + offline" story.

Cons:
- Some users hate BYOK friction; conversion depends on Pro features being clearly valuable.

### Model B (Later): Whisperall Cloud (Credits Included)

- Subscription includes cloud transcription/LLM/TTS credits behind the scenes.
- Whisperall becomes "works out of the box" for everyone (no API keys).

Pros:
- Much higher conversion potential (lower setup friction).
- Can bundle premium providers.

Cons:
- Requires infrastructure: billing, metering, proxying, abuse prevention, margins.

## Cost Reality Check: Can a $7-$9 Subscription Cover Usage?

Short answer: **yes**, for STT (dictation) it is very plausible if we route to a cheap provider (example from our provider guide: Groq at ~$0.04/hour).

Important: prices and terms can change. You must verify provider ToS for reselling/bundling and plan for fallbacks.

### Reference Unit Costs (from `docs/GUIA_MODELOS_IA_APIS.md`)

- STT (Groq): ~$0.04 / hour audio
  - ~$0.000666 / minute audio
- TTS (example cheap): DeepInfra ~$0.80 / 1M characters (if used)

### Rough Scenarios (Illustrative)

Assume $7/mo subscription.
Payment fees (typical card processing) can be roughly ~3% + a fixed fee; net revenue might land around ~$6.5/user/mo (varies by country, taxes, refunds).

STT-only dictation costs at $0.04/hour:
- 10 hours/month dictation: $0.40
- 25 hours/month dictation: $1.00
- 50 hours/month dictation: $2.00

If we also include "Read" (TTS) credits, the cost depends on how many characters users read aloud.
Very rough conversion: ~60k-70k characters per hour of spoken reading (varies widely).
At $0.80 / 1M chars:
- 10 hours/month reading (~0.65M chars): ~$0.52
- 30 hours/month reading (~2.0M chars): ~$1.60

Takeaway:
- Even "heavy" users can fit inside a $7-$9 plan **if** you keep routing to low-cost providers and include guardrails.

### Guardrails (To Avoid Getting Bankrupted by Whales)

Even if unit costs are low, you need limits to protect against abuse and unexpected provider pricing changes:

- Define included monthly allowances (example): 30 hours STT + 2M TTS chars.
- Add soft limits: slow down, queue, or reduce priority after limits (instead of hard cutoffs).
- Add hard limits for abuse (CAPTCHA-ish, rate limits, max requests/min, max audio length per request).
- Add an "Overage" or "Boost" pack (optional) if users exceed usage.

### Why This Is Potentially a Strong Strategy

- Non-technical users don't install models or configure API keys.
- We can route "the cheapest model that is good enough" automatically per language/hardware/latency target.
- We can stay cheaper than competitors while still leaving margin for support + infra.

## Plans (Draft)

### Free

Target: hobbyists, privacy-first users, acquisition.

Includes:
- Dictation (local STT when installed) + Reader + basic Transcribe.
- Basic history (last N entries).
- Simple mode only (no manual provider/model selection).

Limits (examples):
- Some Pro-only features hidden (commands/snippets/vocabulary).
- Optional usage caps for heavy workflows (if needed).

### Pro (Individual)

Target: professionals who dictate daily; power users.

Price hypothesis:
- $9-$12 / month
- $79-$99 / year

Unlocks:
- Pro mode: manual provider/model selection per service (TTS/STT/Translate/AI Edit).
- Dictation productivity features: personal vocabulary, snippets, basic commands.
- Profiles/presets (per workflow: "work", "coding", "Spanish", etc.).
- Better history: search, tags, export.
- Voice tools upgrades: voice training, higher limits, better presets (optional).

### Teams

Target: small teams; shared language + consistency.

Price hypothesis:
- $15-$20 / user / month (annual discount)

Unlocks:
- Team vocabulary + team snippets/commands.
- Central policy: allowed providers, privacy mode enforcement.
- Admin + billing management.
- Usage dashboards (privacy-preserving metrics).

## Feature Gating (What Sells Pro)

The most defensible Pro value is **dictation productivity**, not "more modules".

High-value Pro features:
- Personal dictionary (custom spellings, names, company terms).
- Snippets (voice shortcut expansions).
- Command mode (minimal set first: new paragraph, delete last sentence, undo).
- Profiles/presets (save and switch quickly).
- Pro mode selectors (providers/models/advanced params) for power users.

Secondary Pro features:
- Enhanced History (search, tagging, exports).
- Voice training + management improvements.

## Packaging Recommendation

- Keep the app usable in Free without requiring API keys.
- Make Pro feel like a coherent upgrade: "dictation becomes a superpower".
- De-emphasize Labs modules (Music/SFX) until Core is premium.

## Open Questions (Need Decisions)

1) Do we want "Lifetime" (one-time) pricing for early adopters?
2) Do we want to bundle a small amount of Whisperall Cloud credits as an add-on?
3) Is enterprise compliance a real goal, or a distraction right now?
