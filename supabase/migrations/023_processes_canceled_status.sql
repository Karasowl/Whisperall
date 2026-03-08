-- M20.3 follow-up: allow explicit canceled status for unified process hub

alter table public.processes
  drop constraint if exists processes_status_check;

alter table public.processes
  add constraint processes_status_check
  check (status in ('queued', 'running', 'paused', 'failed', 'completed', 'canceled'));

update public.processes
set completed_at = coalesce(completed_at, updated_at)
where status = 'canceled';
