-- Add storage usage quota metering and enforce per-user audio object ownership.

alter table if exists usage
  add column if not exists storage_bytes bigint not null default 0;

-- Remove old increment_usage overloads to avoid RPC ambiguity.
drop function if exists increment_usage(
  uuid,
  int,
  int,
  int,
  int,
  int
);

drop function if exists increment_usage(
  uuid,
  int,
  int,
  int,
  int,
  int,
  int
);

drop function if exists increment_usage(
  uuid,
  int,
  int,
  int,
  int,
  int,
  int,
  bigint
);

create or replace function increment_usage(
  p_user_id uuid,
  p_stt_seconds int default 0,
  p_tts_chars int default 0,
  p_translate_chars int default 0,
  p_transcribe_seconds int default 0,
  p_ai_edit_tokens int default 0,
  p_notes_count int default 0,
  p_storage_bytes bigint default 0
) returns void as $$
begin
  insert into usage (
    user_id,
    month,
    stt_seconds,
    tts_chars,
    translate_chars,
    transcribe_seconds,
    ai_edit_tokens,
    notes_count,
    storage_bytes
  )
  values (
    p_user_id,
    date_trunc('month', now())::date,
    p_stt_seconds,
    p_tts_chars,
    p_translate_chars,
    p_transcribe_seconds,
    p_ai_edit_tokens,
    p_notes_count,
    p_storage_bytes
  )
  on conflict (user_id, month) do update set
    stt_seconds = usage.stt_seconds + excluded.stt_seconds,
    tts_chars = usage.tts_chars + excluded.tts_chars,
    translate_chars = usage.translate_chars + excluded.translate_chars,
    transcribe_seconds = usage.transcribe_seconds + excluded.transcribe_seconds,
    ai_edit_tokens = usage.ai_edit_tokens + excluded.ai_edit_tokens,
    notes_count = usage.notes_count + excluded.notes_count,
    storage_bytes = usage.storage_bytes + excluded.storage_bytes;
end;
$$ language plpgsql security definer;

-- Restrict storage access so each user can only create/manage files under
-- the "<auth.uid()>/..." key prefix inside the audio bucket.
drop policy if exists "audio_insert" on storage.objects;
drop policy if exists "audio_select" on storage.objects;
drop policy if exists "audio_update" on storage.objects;
drop policy if exists "audio_delete" on storage.objects;

create policy "audio_insert" on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'audio'
    and coalesce((storage.foldername(name))[1], '') = auth.uid()::text
  );

create policy "audio_select" on storage.objects for select
  to authenticated
  using (
    bucket_id = 'audio'
    and coalesce((storage.foldername(name))[1], '') = auth.uid()::text
  );

create policy "audio_update" on storage.objects for update
  to authenticated
  using (
    bucket_id = 'audio'
    and coalesce((storage.foldername(name))[1], '') = auth.uid()::text
  )
  with check (
    bucket_id = 'audio'
    and coalesce((storage.foldername(name))[1], '') = auth.uid()::text
  );

create policy "audio_delete" on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'audio'
    and coalesce((storage.foldername(name))[1], '') = auth.uid()::text
  );
