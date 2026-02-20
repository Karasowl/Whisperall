-- Add per-block metadata for note-embedded transcription blocks.

alter table if exists public.document_transcriptions
  add column if not exists block_id text,
  add column if not exists source text;

create index if not exists document_transcriptions_doc_block_created_idx
  on public.document_transcriptions(document_id, block_id, created_at desc);
