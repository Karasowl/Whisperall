-- Seed Deepgram pricing rows (0 by default; update via /dashboard/admin UI).
-- This is a convenience migration so Deepgram shows up immediately in the pricing table.

insert into provider_pricing (provider, resource, model, unit, usd_per_unit)
values
  ('deepgram', 'stt_seconds', 'nova-2', 'second', 0),
  ('deepgram', 'transcribe_seconds', 'nova-2', 'second', 0)
on conflict (provider, resource, effective_from) do nothing;

