-- WhisperAll v2 - Reader V2 synced features

create table if not exists reader_progress (
  user_id uuid not null references profiles(id) on delete cascade,
  document_id uuid not null references documents(id) on delete cascade,
  char_offset integer not null default 0 check (char_offset >= 0),
  playback_seconds double precision not null default 0 check (playback_seconds >= 0),
  section_index integer not null default 0 check (section_index >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, document_id)
);

create table if not exists reader_bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  document_id uuid not null references documents(id) on delete cascade,
  char_offset integer not null default 0 check (char_offset >= 0),
  label text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists reader_annotations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  document_id uuid not null references documents(id) on delete cascade,
  start_offset integer not null check (start_offset >= 0),
  end_offset integer not null check (end_offset >= start_offset),
  note text not null default '',
  color text not null default '#137fec',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists documents_reader_source_idx
  on documents(user_id, source, updated_at desc);

create index if not exists reader_bookmarks_doc_created_idx
  on reader_bookmarks(document_id, created_at desc);

create index if not exists reader_annotations_doc_created_idx
  on reader_annotations(document_id, created_at desc);

alter table reader_progress enable row level security;
alter table reader_bookmarks enable row level security;
alter table reader_annotations enable row level security;

create policy "reader_progress_select" on reader_progress
  for select using (auth.uid() = user_id);
create policy "reader_progress_insert" on reader_progress
  for insert with check (auth.uid() = user_id);
create policy "reader_progress_update" on reader_progress
  for update using (auth.uid() = user_id);
create policy "reader_progress_delete" on reader_progress
  for delete using (auth.uid() = user_id);

create policy "reader_bookmarks_select" on reader_bookmarks
  for select using (auth.uid() = user_id);
create policy "reader_bookmarks_insert" on reader_bookmarks
  for insert with check (auth.uid() = user_id);
create policy "reader_bookmarks_update" on reader_bookmarks
  for update using (auth.uid() = user_id);
create policy "reader_bookmarks_delete" on reader_bookmarks
  for delete using (auth.uid() = user_id);

create policy "reader_annotations_select" on reader_annotations
  for select using (auth.uid() = user_id);
create policy "reader_annotations_insert" on reader_annotations
  for insert with check (auth.uid() = user_id);
create policy "reader_annotations_update" on reader_annotations
  for update using (auth.uid() = user_id);
create policy "reader_annotations_delete" on reader_annotations
  for delete using (auth.uid() = user_id);

create trigger reader_annotations_updated_at before update on reader_annotations
  for each row execute function update_updated_at();
