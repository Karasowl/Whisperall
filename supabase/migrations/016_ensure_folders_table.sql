-- Safety migration: ensure folders schema exists for Notes folder chips.
create table if not exists public.folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null default 'Untitled',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.folders enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'folders' and policyname = 'Users can view own folders'
  ) then
    create policy "Users can view own folders"
      on public.folders for select using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'folders' and policyname = 'Users can create own folders'
  ) then
    create policy "Users can create own folders"
      on public.folders for insert with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'folders' and policyname = 'Users can update own folders'
  ) then
    create policy "Users can update own folders"
      on public.folders for update using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'folders' and policyname = 'Users can delete own folders'
  ) then
    create policy "Users can delete own folders"
      on public.folders for delete using (auth.uid() = user_id);
  end if;
end $$;

alter table public.documents
  add column if not exists folder_id uuid references public.folders(id) on delete set null;
