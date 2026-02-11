-- Fix RPC ambiguity: remove old increment_usage overload (6 params)
drop function if exists increment_usage(
  uuid,
  int,
  int,
  int,
  int,
  int
);

-- Ensure canonical increment_usage signature (7 params incl. notes_count)
create or replace function increment_usage(
  p_user_id uuid,
  p_stt_seconds int default 0,
  p_tts_chars int default 0,
  p_translate_chars int default 0,
  p_transcribe_seconds int default 0,
  p_ai_edit_tokens int default 0,
  p_notes_count int default 0
) returns void as $$
begin
  insert into usage (user_id, month, stt_seconds, tts_chars, translate_chars, transcribe_seconds, ai_edit_tokens, notes_count)
  values (
    p_user_id,
    date_trunc('month', now())::date,
    p_stt_seconds,
    p_tts_chars,
    p_translate_chars,
    p_transcribe_seconds,
    p_ai_edit_tokens,
    p_notes_count
  )
  on conflict (user_id, month) do update set
    stt_seconds = usage.stt_seconds + excluded.stt_seconds,
    tts_chars = usage.tts_chars + excluded.tts_chars,
    translate_chars = usage.translate_chars + excluded.translate_chars,
    transcribe_seconds = usage.transcribe_seconds + excluded.transcribe_seconds,
    ai_edit_tokens = usage.ai_edit_tokens + excluded.ai_edit_tokens,
    notes_count = usage.notes_count + excluded.notes_count;
end;
$$ language plpgsql security definer;
