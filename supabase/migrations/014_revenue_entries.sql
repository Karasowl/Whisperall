-- Revenue entries (manual source-of-truth) for profitability tracking.
-- Owner/admin only.

-- Ensure helper exists for updated_at triggers.
create or replace function update_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create table if not exists revenue_entries (
  id uuid primary key default gen_random_uuid(),
  period date not null,                  -- first day of month (UTC)
  source text not null default 'total',  -- e.g. total | stripe | appstore
  amount_usd numeric(12, 2) not null default 0,
  currency text not null default 'USD',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(period, source)
);

alter table revenue_entries enable row level security;

create policy "revenue_entries_select" on revenue_entries for select to authenticated
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and (p.is_owner or p.is_admin)
    )
  );

create policy "revenue_entries_insert" on revenue_entries for insert to authenticated
  with check (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and (p.is_owner or p.is_admin)
    )
  );

create policy "revenue_entries_update" on revenue_entries for update to authenticated
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and (p.is_owner or p.is_admin)
    )
  );

create policy "revenue_entries_delete" on revenue_entries for delete to authenticated
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and (p.is_owner or p.is_admin)
    )
  );

create index if not exists idx_revenue_entries_period on revenue_entries(period);

create trigger revenue_entries_updated_at before update on revenue_entries
  for each row execute function update_updated_at();

