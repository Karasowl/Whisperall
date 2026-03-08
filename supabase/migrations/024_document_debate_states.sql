-- Per-note persistent AI debate state (chat sessions + compacted memory)

create table if not exists public.document_debate_states (
  document_id uuid primary key references public.documents(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  state_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists document_debate_states_user_updated_idx
  on public.document_debate_states(user_id, updated_at desc);

alter table public.document_debate_states enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'document_debate_states' and policyname = 'Users can view own document debate states'
  ) then
    create policy "Users can view own document debate states"
      on public.document_debate_states for select using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'document_debate_states' and policyname = 'Users can create own document debate states'
  ) then
    create policy "Users can create own document debate states"
      on public.document_debate_states for insert with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'document_debate_states' and policyname = 'Users can update own document debate states'
  ) then
    create policy "Users can update own document debate states"
      on public.document_debate_states for update using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'document_debate_states' and policyname = 'Users can delete own document debate states'
  ) then
    create policy "Users can delete own document debate states"
      on public.document_debate_states for delete using (auth.uid() = user_id);
  end if;
end $$;

drop trigger if exists document_debate_states_updated_at on public.document_debate_states;
create trigger document_debate_states_updated_at
  before update on public.document_debate_states
  for each row execute function update_updated_at();
