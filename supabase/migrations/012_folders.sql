-- Folders for organizing documents/notes
create table if not exists folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null default 'Untitled',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table folders enable row level security;

create policy "Users can view own folders"   on folders for select using (auth.uid() = user_id);
create policy "Users can create own folders"  on folders for insert with check (auth.uid() = user_id);
create policy "Users can update own folders"  on folders for update using (auth.uid() = user_id);
create policy "Users can delete own folders"  on folders for delete using (auth.uid() = user_id);

-- Add folder_id FK to documents (nullable — docs without a folder are "unfiled")
alter table documents add column if not exists folder_id uuid references folders(id) on delete set null;
