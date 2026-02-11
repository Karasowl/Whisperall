-- Drop FK constraints on history, usage, live_segments
-- RLS policies enforce ownership; FKs block dev mode (AUTH_DISABLED)
alter table history drop constraint if exists history_user_id_fkey;
alter table usage drop constraint if exists usage_user_id_fkey;
alter table live_segments drop constraint if exists live_segments_user_id_fkey;
