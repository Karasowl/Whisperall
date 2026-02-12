'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  AdminInvoiceEntry,
  AdminOverviewResponse,
  AdminPricingEntry,
} from '@whisperall/api-client';
import { ApiError } from '@whisperall/api-client';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { api, setApiToken } from '@/lib/api-client';
import { classifyApiError } from '@/lib/api-errors';
import { createClient } from '@/lib/supabase/client';

function usd(n: number): string {
  if (!Number.isFinite(n)) return '$0.00';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

function clampNum(v: string, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function MonthPill({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] border border-edge bg-base text-muted">
      {text}
    </span>
  );
}

function SummaryCard({ title, value, sub }: { title: string; value: string; sub?: string }) {
  return (
    <div className="p-4 rounded-2xl border border-edge bg-surface">
      <div className="text-xs text-muted">{title}</div>
      <div className="text-2xl font-black tracking-tight text-text mt-1">{value}</div>
      {sub && <div className="text-xs text-muted mt-1">{sub}</div>}
    </div>
  );
}

export default function AdminDashboardPage() {
  return (
    <AuthGuard>
      {() => <AdminDashboardInner />}
    </AuthGuard>
  );
}

function AdminDashboardInner() {
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<AdminOverviewResponse | null>(null);
  const [pricing, setPricing] = useState<AdminPricingEntry[]>([]);
  const [invoices, setInvoices] = useState<AdminInvoiceEntry[]>([]);
  const [error, setError] = useState<{ message: string; kind: string; code?: string } | null>(null);
  const [newPricing, setNewPricing] = useState({
    provider: '',
    resource: 'stt_seconds',
    model: '',
    unit: 'second',
    usd_per_unit: 0,
    effective_from: '',
  });
  const [newInvoice, setNewInvoice] = useState({
    provider: '',
    amount_usd: 0,
    currency: 'USD',
    notes: '',
    period: '',
  });

  const periodLabel = useMemo(() => {
    if (!overview?.period_start) return null;
    const d = new Date(overview.period_start);
    if (Number.isNaN(d.getTime())) return null;
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    return key;
  }, [overview?.period_start]);

  const periodStartDate = useMemo(() => {
    if (!periodLabel) return '';
    return `${periodLabel}-01`;
  }, [periodLabel]);

  useEffect(() => {
    if (!periodStartDate) return;
    setNewPricing((p) => ({ ...p, effective_from: p.effective_from || periodStartDate }));
    setNewInvoice((i) => ({ ...i, period: i.period || periodStartDate }));
  }, [periodStartDate]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const sb = createClient();
      const { data: { session } } = await sb.auth.getSession();
      if (session?.access_token) setApiToken(session.access_token);
      const data = await api.admin.overview();
      setOverview(data);
      setPricing(data.pricing || []);
      setInvoices(data.invoices || []);
      setError(null);
    } catch (e) {
      const base = classifyApiError(e);
      const code = e instanceof ApiError ? e.code : undefined;
      setError({ ...base, code });
      setOverview(null);
      setPricing([]);
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleSavePricing = useCallback(async (row: AdminPricingEntry) => {
    try {
      const saved = await api.admin.upsertPricing({
        provider: row.provider,
        resource: row.resource,
        model: row.model ?? null,
        unit: row.unit,
        usd_per_unit: row.usd_per_unit,
        effective_from: row.effective_from,
      });
      setPricing((prev) => prev.map((p) => (
        p.provider === saved.provider
        && p.resource === saved.resource
        && p.effective_from === saved.effective_from
          ? saved
          : p
      )));
      // Recompute totals from server (pricing affects estimated_cost).
      await refresh();
    } catch (e) {
      const base = classifyApiError(e);
      const code = e instanceof ApiError ? e.code : undefined;
      setError({ ...base, code });
    }
  }, [refresh]);

  const handleSaveInvoice = useCallback(async (row: AdminInvoiceEntry) => {
    try {
      const saved = await api.admin.upsertInvoice({
        provider: row.provider,
        period: row.period,
        amount_usd: row.amount_usd,
        currency: row.currency,
        notes: row.notes ?? null,
      });
      setInvoices((prev) => prev.map((inv) => (
        inv.provider === saved.provider && inv.period === saved.period ? saved : inv
      )));
      await refresh();
    } catch (e) {
      const base = classifyApiError(e);
      const code = e instanceof ApiError ? e.code : undefined;
      setError({ ...base, code });
    }
  }, [refresh]);

  if (loading) {
    return (
      <div className="space-y-4" data-testid="admin-dashboard-loading">
        <div className="h-6 w-40 bg-edge rounded animate-pulse" />
        <div className="h-24 w-full bg-edge rounded-2xl animate-pulse" />
        <div className="h-24 w-full bg-edge rounded-2xl animate-pulse" />
      </div>
    );
  }

  if (error?.kind === 'auth') {
    return (
      <div className="p-5 rounded-2xl border border-edge bg-surface" data-testid="admin-dashboard-auth">
        <div className="text-sm text-text font-semibold mb-1">Sign in required</div>
        <div className="text-sm text-muted">{error.message}</div>
      </div>
    );
  }

  if (error?.code === 'ADMIN_FORBIDDEN') {
    return (
      <div className="p-5 rounded-2xl border border-edge bg-surface" data-testid="admin-dashboard-forbidden">
        <div className="text-sm text-text font-semibold mb-1">Not authorized</div>
        <div className="text-sm text-muted">This page is only for the owner/admin account.</div>
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="p-5 rounded-2xl border border-edge bg-surface" data-testid="admin-dashboard-error">
        <div className="text-sm text-text font-semibold mb-1">Admin dashboard unavailable</div>
        <div className="text-sm text-muted">{error?.message || 'Unknown error'}</div>
        <button
          type="button"
          onClick={() => { void refresh(); }}
          className="mt-4 px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          Retry
        </button>
      </div>
    );
  }

  const usage = overview.usage_total;

  return (
    <div className="space-y-8" data-testid="admin-dashboard-page">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-text">Admin</h1>
          <p className="text-sm text-muted mt-1">
            Real invoices + configurable pricing for estimated cost.
          </p>
        </div>
        {periodLabel && <MonthPill text={periodLabel} />}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SummaryCard title="Users (total)" value={`${overview.users_total}`} />
        <SummaryCard title="Active users (30d)" value={`${overview.users_active_30d}`} />
        <SummaryCard title="Est. cost (month)" value={usd(overview.estimated_cost.total_usd)} sub="From usage + pricing table" />
      </div>

      <div className="p-5 rounded-2xl border border-edge bg-surface">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-text">Costs</h2>
          <button
            type="button"
            onClick={() => { void refresh(); }}
            className="text-xs text-muted hover:text-text transition-colors"
          >
            Refresh
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
          <div className="p-4 rounded-xl border border-edge bg-base/50">
            <div className="text-xs text-muted">Real spend (month)</div>
            <div className="text-xl font-black text-text mt-1">{usd(overview.real_cost.total_usd)}</div>
            <div className="mt-3 space-y-1 text-xs text-muted">
              {Object.entries(overview.real_cost.by_provider || {}).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-2">
                  <span className="truncate">{k}</span>
                  <span className="text-text">{usd(v)}</span>
                </div>
              ))}
              {Object.keys(overview.real_cost.by_provider || {}).length === 0 && (
                <div>No invoices entered yet.</div>
              )}
            </div>
          </div>

          <div className="p-4 rounded-xl border border-edge bg-base/50">
            <div className="text-xs text-muted">Estimated spend (month)</div>
            <div className="text-xl font-black text-text mt-1">{usd(overview.estimated_cost.total_usd)}</div>
            <div className="mt-3 space-y-1 text-xs text-muted">
              {Object.entries(overview.estimated_cost.by_provider || {}).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-2">
                  <span className="truncate">{k}</span>
                  <span className="text-text">{usd(v)}</span>
                </div>
              ))}
              {Object.keys(overview.estimated_cost.by_provider || {}).length === 0 && (
                <div>Set pricing rows (usd_per_unit) to enable estimates.</div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-5 text-xs text-muted">
          Usage totals: STT {Math.round((usage.stt_seconds || 0) / 60)} min · Transcribe {Math.round((usage.transcribe_seconds || 0) / 60)} min ·
          Translate {(usage.translate_chars || 0).toLocaleString()} chars · TTS {(usage.tts_chars || 0).toLocaleString()} chars ·
          AI edit {(usage.ai_edit_tokens || 0).toLocaleString()} tokens
        </div>
      </div>

      <div className="p-5 rounded-2xl border border-edge bg-surface">
        <h2 className="text-sm font-bold text-text mb-4">Pricing (estimated cost)</h2>
        <div className="space-y-3">
          {pricing.map((p) => (
            <div key={`${p.provider}:${p.resource}:${p.effective_from}`} className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-xl border border-edge bg-base/50">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-text truncate">
                  {p.provider} · {p.resource}
                </div>
                <div className="text-xs text-muted truncate">
                  {p.model ? `Model: ${p.model}` : 'Model: (none)'} · Unit: {p.unit} · Effective: {p.effective_from}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  value={String(p.usd_per_unit ?? 0)}
                  onChange={(e) => {
                    const next = clampNum(e.target.value, 0);
                    setPricing((prev) => prev.map((x) => (x === p ? { ...x, usd_per_unit: next } : x)));
                  }}
                  className="w-28 bg-base border border-edge text-text text-sm rounded-lg px-3 py-2 outline-none"
                  inputMode="decimal"
                />
                <button
                  type="button"
                  onClick={() => { void handleSavePricing(p); }}
                  className="px-3 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:opacity-90 transition-opacity"
                >
                  Save
                </button>
              </div>
            </div>
          ))}
          {pricing.length === 0 && (
            <div className="text-sm text-muted">No pricing rows yet.</div>
          )}
        </div>

        <div className="mt-5 pt-5 border-t border-edge">
          <div className="text-xs font-bold tracking-widest uppercase text-muted mb-3">Add or update pricing row</div>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
            <input
              placeholder="provider (openai, deepl...)"
              value={newPricing.provider}
              onChange={(e) => setNewPricing((p) => ({ ...p, provider: e.target.value }))}
              className="bg-base border border-edge text-text text-sm rounded-lg px-3 py-2 outline-none sm:col-span-2"
            />
            <select
              value={newPricing.resource}
              onChange={(e) => setNewPricing((p) => ({ ...p, resource: e.target.value }))}
              className="bg-base border border-edge text-text text-sm rounded-lg px-3 py-2 outline-none"
            >
              <option value="stt_seconds">stt_seconds</option>
              <option value="transcribe_seconds">transcribe_seconds</option>
              <option value="translate_chars">translate_chars</option>
              <option value="tts_chars">tts_chars</option>
              <option value="ai_edit_tokens">ai_edit_tokens</option>
            </select>
            <input
              placeholder="unit (second/char/token)"
              value={newPricing.unit}
              onChange={(e) => setNewPricing((p) => ({ ...p, unit: e.target.value }))}
              className="bg-base border border-edge text-text text-sm rounded-lg px-3 py-2 outline-none"
            />
            <input
              placeholder="usd_per_unit"
              value={String(newPricing.usd_per_unit)}
              onChange={(e) => setNewPricing((p) => ({ ...p, usd_per_unit: clampNum(e.target.value, 0) }))}
              className="bg-base border border-edge text-text text-sm rounded-lg px-3 py-2 outline-none"
              inputMode="decimal"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 mt-2">
            <input
              placeholder="model (optional)"
              value={newPricing.model}
              onChange={(e) => setNewPricing((p) => ({ ...p, model: e.target.value }))}
              className="bg-base border border-edge text-text text-sm rounded-lg px-3 py-2 outline-none sm:col-span-3"
            />
            <input
              type="date"
              value={newPricing.effective_from || periodStartDate}
              onChange={(e) => setNewPricing((p) => ({ ...p, effective_from: e.target.value }))}
              className="bg-base border border-edge text-text text-sm rounded-lg px-3 py-2 outline-none"
            />
            <button
              type="button"
              onClick={async () => {
                const provider = newPricing.provider.trim();
                if (!provider) return;
                try {
                  await api.admin.upsertPricing({
                    provider,
                    resource: newPricing.resource,
                    model: newPricing.model.trim() ? newPricing.model.trim() : null,
                    unit: newPricing.unit.trim() || 'unit',
                    usd_per_unit: newPricing.usd_per_unit,
                    effective_from: (newPricing.effective_from || periodStartDate || '').trim() || undefined,
                  });
                  setNewPricing((p) => ({ ...p, provider: '', model: '' }));
                  await refresh();
                } catch (e) {
                  const base = classifyApiError(e);
                  const code = e instanceof ApiError ? e.code : undefined;
                  setError({ ...base, code });
                }
              }}
              className="px-3 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              Save
            </button>
          </div>
          <div className="text-xs text-muted mt-2">
            Tip: for a new month, set a new <span className="font-mono">effective_from</span> and it will override estimates for that month.
          </div>
        </div>
      </div>

      <div className="p-5 rounded-2xl border border-edge bg-surface">
        <h2 className="text-sm font-bold text-text mb-4">Real invoices (month)</h2>
        <div className="space-y-3">
          {invoices.map((inv) => (
            <div key={`${inv.provider}:${inv.period}`} className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-xl border border-edge bg-base/50">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-text truncate">
                  {inv.provider}
                </div>
                <div className="text-xs text-muted truncate">
                  Period: {inv.period}{inv.notes ? ` · ${inv.notes}` : ''}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  value={String(inv.amount_usd ?? 0)}
                  onChange={(e) => {
                    const next = clampNum(e.target.value, 0);
                    setInvoices((prev) => prev.map((x) => (x === inv ? { ...x, amount_usd: next } : x)));
                  }}
                  className="w-28 bg-base border border-edge text-text text-sm rounded-lg px-3 py-2 outline-none"
                  inputMode="decimal"
                />
                <button
                  type="button"
                  onClick={() => { void handleSaveInvoice(inv); }}
                  className="px-3 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:opacity-90 transition-opacity"
                >
                  Save
                </button>
              </div>
            </div>
          ))}
          {invoices.length === 0 && (
            <div className="text-sm text-muted">No invoices entered yet.</div>
          )}
        </div>

        <div className="mt-5 pt-5 border-t border-edge">
          <div className="text-xs font-bold tracking-widest uppercase text-muted mb-3">Add or update invoice</div>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
            <input
              placeholder="provider (openai, deepgram...)"
              value={newInvoice.provider}
              onChange={(e) => setNewInvoice((i) => ({ ...i, provider: e.target.value }))}
              className="bg-base border border-edge text-text text-sm rounded-lg px-3 py-2 outline-none sm:col-span-2"
            />
            <input
              type="date"
              value={newInvoice.period || periodStartDate}
              onChange={(e) => setNewInvoice((i) => ({ ...i, period: e.target.value }))}
              className="bg-base border border-edge text-text text-sm rounded-lg px-3 py-2 outline-none"
            />
            <input
              placeholder="amount_usd"
              value={String(newInvoice.amount_usd)}
              onChange={(e) => setNewInvoice((i) => ({ ...i, amount_usd: clampNum(e.target.value, 0) }))}
              className="bg-base border border-edge text-text text-sm rounded-lg px-3 py-2 outline-none"
              inputMode="decimal"
            />
            <button
              type="button"
              onClick={async () => {
                const provider = newInvoice.provider.trim();
                if (!provider) return;
                try {
                  await api.admin.upsertInvoice({
                    provider,
                    period: (newInvoice.period || periodStartDate || '').trim() || undefined,
                    amount_usd: newInvoice.amount_usd,
                    currency: newInvoice.currency || 'USD',
                    notes: newInvoice.notes?.trim() || null,
                  });
                  setNewInvoice((i) => ({ ...i, provider: '', notes: '', amount_usd: 0 }));
                  await refresh();
                } catch (e) {
                  const base = classifyApiError(e);
                  const code = e instanceof ApiError ? e.code : undefined;
                  setError({ ...base, code });
                }
              }}
              className="px-3 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              Save
            </button>
          </div>
          <div className="mt-2">
            <input
              placeholder="notes (optional)"
              value={newInvoice.notes}
              onChange={(e) => setNewInvoice((i) => ({ ...i, notes: e.target.value }))}
              className="w-full bg-base border border-edge text-text text-sm rounded-lg px-3 py-2 outline-none"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
