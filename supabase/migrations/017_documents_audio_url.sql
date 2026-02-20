-- Store source audio link for transcription notes (download/playback from Notes editor).
alter table public.documents
  add column if not exists audio_url text;
