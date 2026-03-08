-- M20.3: Unified process persistence (local async actions + future adapters)

create table if not exists public.processes (
  id text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  process_type text not null,
  title text not null default 'Untitled process',
  status text not null default 'running',
  stage_label_key text not null default '',
  done integer not null default 0 check (done >= 0),
  total integer not null default 1 check (total >= 1),
  pct integer not null default 0 check (pct >= 0 and pct <= 100),
  document_id uuid references public.documents(id) on delete set null,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint processes_status_check check (status in ('queued', 'running', 'paused', 'failed', 'completed'))
);

create index if not exists processes_user_status_updated_idx
  on public.processes(user_id, status, updated_at desc);

create index if not exists processes_user_document_updated_idx
  on public.processes(user_id, document_id, updated_at desc);

alter table public.processes enable row level security;

create policy "processes_select" on public.processes
  for select using (auth.uid() = user_id);

create policy "processes_insert" on public.processes
  for insert with check (auth.uid() = user_id);

create policy "processes_update" on public.processes
  for update using (auth.uid() = user_id);

create policy "processes_delete" on public.processes
  for delete using (auth.uid() = user_id);

drop trigger if exists processes_updated_at on public.processes;
create trigger processes_updated_at before update on public.processes
  for each row execute function update_updated_at();
