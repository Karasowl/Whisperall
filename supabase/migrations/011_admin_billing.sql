-- Admin / Billing tables for business analytics
-- Adds owner/admin flags, real invoice tracking, and configurable pricing for cost estimates.

-- Ensure helper exists for updated_at triggers (also defined in 002_documents.sql).
create or replace function update_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ── profiles: add admin flags (server-managed) ───────────────────────────────
alter table if exists profiles
  add column if not exists is_owner boolean not null default false,
  add column if not exists is_admin boolean not null default false;

-- Prevent privilege escalation: end-users should not be able to update profiles.
drop policy if exists "profiles_update" on profiles;

-- ── provider_pricing: configurable cost model (for estimated cost) ─────────
create table if not exists provider_pricing (
  id uuid primary key default gen_random_uuid(),
  provider text not null,                -- e.g. openai, deepl, groq, google
  resource text not null,                -- maps to usage keys: stt_seconds, tts_chars, translate_chars, transcribe_seconds, ai_edit_tokens
  model text,                            -- optional, for tracking model-specific pricing changes
  unit text not null,                    -- second | char | token
  usd_per_unit numeric(18, 8) not null default 0,
  effective_from date not null default date_trunc('month', now())::date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, resource, effective_from)
);

alter table provider_pricing enable row level security;

create policy "provider_pricing_select" on provider_pricing for select to authenticated
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and (p.is_owner or p.is_admin)
    )
  );

create policy "provider_pricing_insert" on provider_pricing for insert to authenticated
  with check (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and (p.is_owner or p.is_admin)
    )
  );

create policy "provider_pricing_update" on provider_pricing for update to authenticated
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and (p.is_owner or p.is_admin)
    )
  );

create policy "provider_pricing_delete" on provider_pricing for delete to authenticated
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and (p.is_owner or p.is_admin)
    )
  );

-- Reuse update_updated_at() trigger function if present (created in 002_documents.sql).
create trigger provider_pricing_updated_at before update on provider_pricing
  for each row execute function update_updated_at();

-- Seed a minimal default price sheet (0 = fill in via admin UI).
insert into provider_pricing (provider, resource, model, unit, usd_per_unit)
values
  ('openai', 'stt_seconds', 'gpt-4o-mini-transcribe', 'second', 0),
  ('groq', 'transcribe_seconds', 'whisper-large-v3-turbo', 'second', 0),
  ('deepl', 'translate_chars', 'deepl', 'char', 0),
  ('google', 'tts_chars', 'wavenet', 'char', 0),
  ('openai', 'ai_edit_tokens', 'gpt', 'token', 0)
on conflict (provider, resource, effective_from) do nothing;

-- ── provider_invoices: manual entry for real spend (source of truth) ───────
create table if not exists provider_invoices (
  id uuid primary key default gen_random_uuid(),
  period date not null,                  -- first day of month (UTC)
  provider text not null,
  amount_usd numeric(12, 2) not null default 0,
  currency text not null default 'USD',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(period, provider)
);

alter table provider_invoices enable row level security;

create policy "provider_invoices_select" on provider_invoices for select to authenticated
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and (p.is_owner or p.is_admin)
    )
  );

create policy "provider_invoices_insert" on provider_invoices for insert to authenticated
  with check (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and (p.is_owner or p.is_admin)
    )
  );

create policy "provider_invoices_update" on provider_invoices for update to authenticated
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and (p.is_owner or p.is_admin)
    )
  );

create policy "provider_invoices_delete" on provider_invoices for delete to authenticated
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and (p.is_owner or p.is_admin)
    )
  );

create index if not exists idx_provider_invoices_period on provider_invoices(period);

create trigger provider_invoices_updated_at before update on provider_invoices
  for each row execute function update_updated_at();
