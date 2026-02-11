'use client';

import { useEffect, useState, useCallback } from 'react';
import { api, setApiToken } from '@/lib/api-client';
import { createClient } from '@/lib/supabase/client';
import { classifyApiError, daysUntil } from '@/lib/api-errors';
import { Button } from '../shared/Button';

const PLAN_COLORS: Record<string, string> = { free: 'text-muted', basic: 'text-primary', pro: 'text-purple-400' };

export function PlanCard() {
  const [plan, setPlan] = useState<string | null>(null);
  const [nextReset, setNextReset] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; kind: string } | null>(null);

  const fetchPlan = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sb = createClient();
      const { data: { session } } = await sb.auth.getSession();
      if (session?.access_token) setApiToken(session.access_token);
      const data = await api.usage.get();
      setPlan(data.plan as string);
      setNextReset(data.next_reset_at ?? null);
    } catch (e) {
      setError(classifyApiError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPlan(); }, [fetchPlan]);

  if (loading) {
    return (
      <div data-testid="plan-card" className="p-5 rounded-2xl border border-edge bg-surface">
        <div className="h-3 w-20 rounded bg-edge animate-pulse mb-2" />
        <div className="h-5 w-16 rounded bg-edge animate-pulse" />
      </div>
    );
  }

  if (error) {
    return (
      <div data-testid="plan-card" className="flex items-center justify-between p-5 rounded-2xl border border-edge bg-surface">
        <p className="text-sm text-red-400">{error.message}</p>
        {error.kind === 'auth' ? (
          <a href="/?signin=1" className="text-sm font-semibold text-primary hover:text-primary/80 transition-colors">Sign in</a>
        ) : (
          <button type="button" data-testid="plan-retry" onClick={fetchPlan} className="text-sm font-semibold text-primary hover:text-primary/80 transition-colors">Retry</button>
        )}
      </div>
    );
  }

  const displayPlan = plan ?? 'free';
  return (
    <div data-testid="plan-card" className="flex items-center justify-between p-5 rounded-2xl border border-edge bg-surface">
      <div>
        <p className="text-xs text-muted uppercase tracking-wider mb-1">Current Plan</p>
        <p className={`text-lg font-bold capitalize ${PLAN_COLORS[displayPlan] ?? 'text-text'}`}>{displayPlan}</p>
        {nextReset && <p className="text-xs text-muted mt-0.5">Resets {daysUntil(nextReset)}</p>}
      </div>
      {displayPlan !== 'pro' && <Button href="/pricing" size="sm">Upgrade</Button>}
    </div>
  );
}
