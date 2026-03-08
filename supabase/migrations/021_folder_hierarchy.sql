-- M20.1: Explorer-style folder hierarchy (subfolders + root notes)

create table if not exists public.folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null default 'Untitled',
  parent_id uuid references public.folders(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.folders
  add column if not exists parent_id uuid references public.folders(id) on delete cascade;

alter table public.folders
  drop constraint if exists folders_parent_not_self;

alter table public.folders
  add constraint folders_parent_not_self check (parent_id is null or parent_id <> id);

create index if not exists folders_user_parent_created_idx
  on public.folders(user_id, parent_id, created_at);
