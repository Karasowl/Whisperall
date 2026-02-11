import { useEffect } from 'react';
import { usePlanStore } from '../stores/plan';
import { useT } from '../lib/i18n';
import type { UsageRecord } from '@whisperall/api-client';

const LABEL_KEYS: Record<keyof UsageRecord, string> = {
  stt_seconds: 'usage.dictation', tts_chars: 'usage.tts', translate_chars: 'usage.translation',
  transcribe_seconds: 'usage.transcription', ai_edit_tokens: 'usage.aiEditing', notes_count: 'usage.notes',
};

function fmt(resource: keyof UsageRecord, value: number, limit: number): string {
  if (resource === 'stt_seconds' || resource === 'transcribe_seconds')
    return `${Math.round(value / 60)}/${Math.round(limit / 60)} min`;
  if (resource === 'notes_count')
    return `${value}/${limit}`;
  return `${Math.round(value / 1000)}k/${Math.round(limit / 1000)}k`;
}

export function UsageMeter() {
  const t = useT();
  const { plan, usage, loading, fetch, getLimit, usagePercent } = usePlanStore();

  useEffect(() => { fetch(); }, [fetch]);
  if (loading) return null;

  const resources: (keyof UsageRecord)[] = ['stt_seconds', 'transcribe_seconds', 'tts_chars', 'translate_chars', 'ai_edit_tokens', 'notes_count'];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted">{t('usage.plan')}</span>
        <span className={`text-xs font-semibold uppercase px-2 py-0.5 rounded-full ${
          plan === 'pro' ? 'bg-purple-500/15 text-purple-400' : plan === 'basic' ? 'bg-primary/15 text-primary' : 'bg-edge text-muted'
        }`}>{plan}</span>
      </div>
      {resources.map((r) => {
        const pct = usagePercent(r);
        return (
          <div key={r} className="flex items-center gap-3">
            <span className="text-xs text-muted w-24 shrink-0">{t(LABEL_KEYS[r])}</span>
            <div className="flex-1 h-1.5 bg-edge rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-primary'}`} style={{ width: `${pct}%` }} />
            </div>
            <span className="text-[11px] text-muted w-16 text-right shrink-0">{fmt(r, usage[r], getLimit(r))}</span>
          </div>
        );
      })}
    </div>
  );
}
