-- WhisperAll v2 - Documents (notes system)

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  title text not null default 'Untitled',
  content text not null default '',
  source text,
  source_id uuid,
  tags text[] default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table documents enable row level security;

create policy "documents_select" on documents for select using (auth.uid() = user_id);
create policy "documents_insert" on documents for insert with check (auth.uid() = user_id);
create policy "documents_update" on documents for update using (auth.uid() = user_id);
create policy "documents_delete" on documents for delete using (auth.uid() = user_id);

-- Auto-update updated_at on every UPDATE
create or replace function update_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger documents_updated_at before update on documents
  for each row execute function update_updated_at();
