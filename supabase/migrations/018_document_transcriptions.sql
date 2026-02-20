-- Persist per-note transcription history (retranscriptions, diarization variants) in DB.
create table if not exists public.document_transcriptions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  language text not null default 'auto',
  diarization boolean not null default false,
  text text not null default '',
  segments jsonb not null default '[]'::jsonb,
  audio_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists document_transcriptions_doc_created_idx
  on public.document_transcriptions(document_id, created_at desc);

create index if not exists document_transcriptions_user_created_idx
  on public.document_transcriptions(user_id, created_at desc);

alter table public.document_transcriptions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'document_transcriptions' and policyname = 'Users can view own document transcriptions'
  ) then
    create policy "Users can view own document transcriptions"
      on public.document_transcriptions for select using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'document_transcriptions' and policyname = 'Users can create own document transcriptions'
  ) then
    create policy "Users can create own document transcriptions"
      on public.document_transcriptions for insert with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'document_transcriptions' and policyname = 'Users can update own document transcriptions'
  ) then
    create policy "Users can update own document transcriptions"
      on public.document_transcriptions for update using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'document_transcriptions' and policyname = 'Users can delete own document transcriptions'
  ) then
    create policy "Users can delete own document transcriptions"
      on public.document_transcriptions for delete using (auth.uid() = user_id);
  end if;
end $$;

drop trigger if exists document_transcriptions_updated_at on public.document_transcriptions;
create trigger document_transcriptions_updated_at
  before update on public.document_transcriptions
  for each row execute function update_updated_at();
