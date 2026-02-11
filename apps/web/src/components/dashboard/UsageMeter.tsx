'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { api, setApiToken } from '@/lib/api-client';
import { createClient } from '@/lib/supabase/client';
import { classifyApiError, relativeTime, daysUntil } from '@/lib/api-errors';

type UsageRow = { label: string; used: number; limit: number; unit: string };

const RESOURCE_LABELS: Record<string, { label: string; unit: string }> = {
  stt_seconds: { label: 'Dictation', unit: 'min' },
  transcribe_seconds: { label: 'Transcription', unit: 'min' },
  tts_chars: { label: 'Text-to-Speech', unit: 'chars' },
  translate_chars: { label: 'Translation', unit: 'chars' },
  ai_edit_tokens: { label: 'AI Editing', unit: 'tokens' },
  notes_count: { label: 'Notes', unit: '' },
};

function formatValue(val: number, unit: string): string {
  if (unit === 'min') return `${Math.round(val / 60)}`;
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(0)}k`;
  return `${val}`;
}

function barColor(pct: number): string {
  if (pct >= 90) return 'bg-red-500';
  if (pct >= 70) return 'bg-amber-500';
  return 'bg-primary';
}

export function UsageMeter() {
  const [lastData, setLastData] = useState<UsageRow[] | null>(null);
  const [error, setError] = useState<{ message: string; kind: string } | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [nextReset, setNextReset] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const fetchUsage = useCallback(async () => {
    try {
      const sb = createClient();
      const { data: { session } } = await sb.auth.getSession();
      if (session?.access_token) setApiToken(session.access_token);
      const data = await api.usage.get();
      const parsed: UsageRow[] = Object.entries(RESOURCE_LABELS).map(([key, { label, unit }]) => ({
        label, unit,
        used: (data.usage as Record<string, number>)[key] ?? 0,
        limit: (data.limits as Record<string, number>)[key] ?? 0,
      }));
      setLastData(parsed);
      setError(null);
      setGeneratedAt(data.generated_at ?? null);
      setNextReset(data.next_reset_at ?? null);
    } catch (e) {
      setError(classifyApiError(e));
    }
  }, []);

  useEffect(() => {
    fetchUsage();
    intervalRef.current = setInterval(fetchUsage, 60_000);
    return () => clearInterval(intervalRef.current);
  }, [fetchUsage]);

  if (!lastData && !error) {
    return (
      <div data-testid="usage-meter" className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="space-y-2">
            <div className="h-3 w-24 rounded bg-edge animate-pulse" />
            <div className="h-1.5 rounded-full bg-edge animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div data-testid="usage-meter" className="space-y-4">
      {nextReset && (
        <p className="text-xs text-muted">Resets {daysUntil(nextReset)}</p>
      )}
      {error && (
        <div data-testid="usage-error" className={`flex items-center gap-2 p-2 rounded-lg text-xs ${error.kind === 'plan_limit' ? 'bg-amber-500/10 text-amber-400' : error.kind === 'auth' ? 'bg-purple-500/10 text-purple-400' : 'bg-red-500/10 text-red-400'}`}>
          <span className="material-symbols-outlined text-[16px]">{error.kind === 'plan_limit' ? 'warning' : error.kind === 'auth' ? 'lock' : 'error'}</span>
          <span className="flex-1">{error.message}</span>
          {error.kind === 'auth' ? (
            <a href="/?signin=1" className="font-semibold hover:underline">Sign in</a>
          ) : (
            <button type="button" data-testid="usage-retry" onClick={fetchUsage} className="font-semibold hover:opacity-80 transition-opacity">Retry</button>
          )}
        </div>
      )}
      {error && lastData && generatedAt && (
        <p className="text-xs text-muted">Updated {relativeTime(generatedAt)}</p>
      )}
      {lastData?.map(({ label, used, limit, unit }) => {
        const pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
        return (
          <div key={label}>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-muted">{label}</span>
              <span className="text-text font-medium">{formatValue(used, unit)} / {formatValue(limit, unit)}{unit === 'min' ? ' min' : ''}</span>
            </div>
            <div className="h-1.5 rounded-full bg-edge overflow-hidden">
              <div className={`h-full rounded-full transition-all ${barColor(pct)}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
