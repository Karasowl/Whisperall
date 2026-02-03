# Whisperall - Metrics & Usage Baseline (Template + Local Snapshot)

Date: 2026-02-03

Goal: define the minimum data needed to decide what to cut, what to polish, and what can be monetized.

## 1) Minimal Metrics (Product)

These are the "north star" metrics to track even before monetization:

- Installs (unique devices) and activation rate (first successful dictation within 60s).
- DAU / WAU / MAU.
- Dictation sessions per user per day.
- Time to first transcript (TTFT) and failure rate.
- Retention: D1 / D7 / D30.
- Feature adoption: % of users who ever use Transcribe, Reader, Voices, etc.
- Conversion (once pricing exists): Free -> Pro.

## 1.1) Installs / Users (Fill These)

If there is no telemetry yet, keep these as "unknown" but explicitly tracked:

| Metric | Value | Source / How to estimate |
|---|---:|---|
| Total installs (unique devices) | unknown | Installer analytics, auto-update pings, or opt-in telemetry |
| Activated installs | unknown | First successful dictation event |
| Weekly active devices | unknown | Opt-in telemetry or proxy via History DB presence + timestamps |
| Paying users | 0 | (future) billing system |

## 2) Minimal Metrics (Quality / Support)

- Error rate by module/provider (missing model, API key missing, CUDA OOM).
- Average latency (per provider and per device mode).
- Crash rate / unexpected app quits.

## 3) What We Can Measure Today (Without New Telemetry)

Whisperall already stores a local History SQLite DB with one entry per completed run.

Default DB path (Windows):
- `%LOCALAPPDATA%\\Whisperall\\history.db`
- Legacy: `%LOCALAPPDATA%\\ChatterboxUI\\history.db`

We can use it to estimate:
- Module usage (counts by module).
- Provider usage (counts by provider).
- Time range (first use -> last use).

### Local Snapshot (This Machine)

NOTE: This section is just an example snapshot. Remove it before sharing publicly if you don't want to leak usage patterns.

- History DB: `%LOCALAPPDATA%\\ChatterboxUI\\history.db`
- Total entries: 130
- Date range: 2026-01-23 -> 2026-02-02

By module (last 30 days):
- `stt`: 109
- `reader`: 21

By provider:
- `elevenlabs`: 83
- `openai`: 24
- `kokoro`: 21
- `faster-whisper`: 2

Modules with 0 history entries (this machine):
- `tts`, `transcribe`, `translate`, `ai-edit`, `dubbing`, `voice-changer`, `voice-isolator`, `music`, `sfx`, `voices`

## 4) How To Generate This Report

Option A (recommended): run the helper script:

```powershell
python scripts/history_usage_report.py
```

Option B: raw SQL (example):

```sql
select module, count(*) as c
from history_entries
group by module
order by c desc;
```

## 5) What's Missing (If We Want Real Monetization Decisions)

History counts are not enough to measure:
- Unique users/devices.
- Retention cohorts.
- Time-to-first-success.
- Funnel steps (install -> onboard -> first dictation -> repeated use).

Recommendation:
- Add opt-in, privacy-preserving telemetry (local-first default) that tracks only event counts + coarse timing (no transcript content).
