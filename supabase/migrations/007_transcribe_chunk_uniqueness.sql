-- Ensure transcribe chunk registration is idempotent by (job_id, index).
-- 1) Remove historical duplicates, keeping the newest row.
-- 2) Add a unique constraint to prevent future duplicates.
-- 3) Add query index used by transcribe job runner.

with ranked as (
  select
    id,
    row_number() over (
      partition by job_id, index
      order by created_at desc, id desc
    ) as rn
  from transcribe_chunks
)
delete from transcribe_chunks t
using ranked r
where t.id = r.id
  and r.rn > 1;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'transcribe_chunks_job_id_index_key'
  ) then
    alter table transcribe_chunks
      add constraint transcribe_chunks_job_id_index_key unique (job_id, index);
  end if;
end $$;

create index if not exists idx_transcribe_chunks_job_status_index
  on transcribe_chunks (job_id, status, index);
