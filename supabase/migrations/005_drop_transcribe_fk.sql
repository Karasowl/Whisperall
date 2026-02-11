-- Drop FK on transcribe_jobs so dev mode (AUTH_DISABLED) works
-- RLS policies enforce ownership; FKs block when profile doesn't exist
alter table transcribe_jobs drop constraint if exists transcribe_jobs_user_id_fkey;
