# Database Schema (Supabase)

## Consolidated Migration
All tables defined in `supabase/migrations/001_schema.sql` (single migration).

## Tables
- `profiles` - User plan info, auto-created on signup via trigger
- `usage` - Monthly usage counters per user (unique per user+month)
- `transcribe_jobs` - Long transcription job lifecycle
- `transcribe_chunks` - Individual audio chunks within a job
- `transcripts` - Final transcription output (segments + plain text)
- `history` - Cross-module operation log
- `live_segments` - Real-time transcription segments (Realtime broadcasts on INSERT)

## RLS Policies
Every table has `auth.uid() = user_id` (or `= id` for profiles) policies for SELECT/INSERT/UPDATE.
Chunks and transcripts use subquery to verify job ownership.

## Functions
- `handle_new_user()` - Trigger: auto-creates profile row on auth.users insert
- `increment_usage(p_user_id, ...)` - Atomic upsert for monthly usage counters

## Plan Limits
| Resource | Free | Basic ($4) | Pro ($10) |
|----------|------|-----------|-----------|
| STT | 30 min | 10 hr | 30 hr |
| TTS | 50k chars | 500k | 2M |
| Translate | 50k chars | 500k | 2M |
| Transcribe | 10 min | 5 hr | 30 hr |
| AI Edit | 50k tokens | 500k | 2M |
