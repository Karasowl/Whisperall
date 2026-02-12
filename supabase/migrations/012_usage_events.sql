-- usage_events: detailed per-operation metering to attribute costs by provider/model

create table if not exists usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  period date not null default date_trunc('month', now())::date,
  module text not null,
  provider text not null,
  model text,
  resource text not null,
  units int not null default 0,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_usage_events_period on usage_events(period);
create index if not exists idx_usage_events_provider on usage_events(provider);
create index if not exists idx_usage_events_user on usage_events(user_id);

alter table usage_events enable row level security;

-- Only owner/admin can read usage_events. Writes are done by the backend (service role).
create policy "usage_events_select_admin" on usage_events for select to authenticated
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and (p.is_owner or p.is_admin)
    )
  );

