-- Drop FK constraint on documents.user_id -> profiles(id)
-- RLS policies already enforce ownership; FK blocks dev mode (AUTH_DISABLED)
alter table documents drop constraint if exists documents_user_id_fkey;
