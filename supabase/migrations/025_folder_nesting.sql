-- Add parent_id for nested folders (tree structure)
alter table public.folders
  add column if not exists parent_id uuid references public.folders(id) on delete cascade;
