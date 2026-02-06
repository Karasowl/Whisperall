-- WhisperAll v2 - Consolidated Schema
-- Replaces: 001_profiles, 002_usage, 003_transcribe_jobs, 004_history, 005_rls_policies

-- profiles (auto-created via trigger on auth.users)
create table if not exists profiles (
  id uuid primary key references auth.users(id),
  plan text not null default 'free' check (plan in ('free', 'basic', 'pro')),
  created_at timestamptz not null default now()
);

-- usage (monthly counters)
create table if not exists usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  month date not null,
  stt_seconds int not null default 0,
  tts_chars int not null default 0,
  translate_chars int not null default 0,
  transcribe_seconds int not null default 0,
  ai_edit_tokens int not null default 0,
  unique(user_id, month)
);

-- transcribe_jobs
create table if not exists transcribe_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  status text not null default 'pending',
  language text,
  enable_diarization boolean not null default false,
  enable_translation boolean not null default false,
  target_language text,
  total_chunks integer not null,
  processed_chunks integer not null default 0,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

-- transcribe_chunks
create table if not exists transcribe_chunks (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references transcribe_jobs(id) on delete cascade,
  index integer not null,
  storage_path text not null,
  status text not null default 'pending',
  provider text,
  result_json jsonb,
  created_at timestamptz not null default now()
);

-- transcripts (final output)
create table if not exists transcripts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references transcribe_jobs(id) on delete cascade,
  segments jsonb,
  plain_text text,
  created_at timestamptz not null default now()
);

-- history (cross-module operation log)
create table if not exists history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  module text not null,
  input_text text,
  output_text text,
  audio_url text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

-- live_segments (realtime transcription)
create table if not exists live_segments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  text text,
  translated_text text,
  speaker text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- RLS policies
-- ============================================================

alter table profiles enable row level security;
alter table usage enable row level security;
alter table transcribe_jobs enable row level security;
alter table transcribe_chunks enable row level security;
alter table transcripts enable row level security;
alter table history enable row level security;
alter table live_segments enable row level security;

-- profiles
create policy "profiles_select" on profiles for select using (auth.uid() = id);
create policy "profiles_update" on profiles for update using (auth.uid() = id);

-- usage
create policy "usage_select" on usage for select using (auth.uid() = user_id);
create policy "usage_insert" on usage for insert with check (auth.uid() = user_id);
create policy "usage_update" on usage for update using (auth.uid() = user_id);

-- transcribe_jobs
create policy "jobs_select" on transcribe_jobs for select using (auth.uid() = user_id);
create policy "jobs_insert" on transcribe_jobs for insert with check (auth.uid() = user_id);
create policy "jobs_update" on transcribe_jobs for update using (auth.uid() = user_id);

-- transcribe_chunks (via job ownership)
create policy "chunks_select" on transcribe_chunks for select using (
  exists (select 1 from transcribe_jobs j where j.id = job_id and j.user_id = auth.uid())
);
create policy "chunks_insert" on transcribe_chunks for insert with check (
  exists (select 1 from transcribe_jobs j where j.id = job_id and j.user_id = auth.uid())
);

-- transcripts (via job ownership)
create policy "transcripts_select" on transcripts for select using (
  exists (select 1 from transcribe_jobs j where j.id = job_id and j.user_id = auth.uid())
);
create policy "transcripts_insert" on transcripts for insert with check (
  exists (select 1 from transcribe_jobs j where j.id = job_id and j.user_id = auth.uid())
);

-- history
create policy "history_select" on history for select using (auth.uid() = user_id);
create policy "history_insert" on history for insert with check (auth.uid() = user_id);

-- live_segments
create policy "live_select" on live_segments for select using (auth.uid() = user_id);
create policy "live_insert" on live_segments for insert with check (auth.uid() = user_id);

-- ============================================================
-- Triggers & Functions
-- ============================================================

-- Auto-create profile on signup
create or replace function handle_new_user() returns trigger as $$
begin
  insert into profiles(id) values(new.id);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- Atomic usage increment
create or replace function increment_usage(
  p_user_id uuid,
  p_stt_seconds int default 0,
  p_tts_chars int default 0,
  p_translate_chars int default 0,
  p_transcribe_seconds int default 0,
  p_ai_edit_tokens int default 0
) returns void as $$
begin
  insert into usage (user_id, month, stt_seconds, tts_chars, translate_chars, transcribe_seconds, ai_edit_tokens)
  values (
    p_user_id,
    date_trunc('month', now())::date,
    p_stt_seconds,
    p_tts_chars,
    p_translate_chars,
    p_transcribe_seconds,
    p_ai_edit_tokens
  )
  on conflict (user_id, month) do update set
    stt_seconds = usage.stt_seconds + excluded.stt_seconds,
    tts_chars = usage.tts_chars + excluded.tts_chars,
    translate_chars = usage.translate_chars + excluded.translate_chars,
    transcribe_seconds = usage.transcribe_seconds + excluded.transcribe_seconds,
    ai_edit_tokens = usage.ai_edit_tokens + excluded.ai_edit_tokens;
end;
$$ language plpgsql security definer;
