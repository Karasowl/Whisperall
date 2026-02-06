import { useEffect } from 'react';
import { usePlanStore } from '../stores/plan';
import { useAuthStore } from '../stores/auth';
import type { UsageRecord } from '@whisperall/api-client';

const RESOURCE_LABELS: Record<keyof UsageRecord, string> = {
  stt_seconds: 'Dictation',
  tts_chars: 'Text-to-Speech',
  translate_chars: 'Translation',
  transcribe_seconds: 'Transcription',
  ai_edit_tokens: 'AI Editing',
};

function formatUsage(resource: keyof UsageRecord, value: number, limit: number): string {
  if (resource === 'stt_seconds' || resource === 'transcribe_seconds') {
    const usedMin = Math.round(value / 60);
    const limitMin = Math.round(limit / 60);
    return `${usedMin}/${limitMin} min`;
  }
  const usedK = Math.round(value / 1000);
  const limitK = Math.round(limit / 1000);
  return `${usedK}k/${limitK}k`;
}

export function UsageMeter() {
  const user = useAuthStore((s) => s.user);
  const { plan, usage, loading, fetch, getLimit, usagePercent } = usePlanStore();

  useEffect(() => {
    if (user) fetch();
  }, [user, fetch]);

  if (!user || loading) return null;

  const resources: (keyof UsageRecord)[] = [
    'stt_seconds', 'transcribe_seconds', 'tts_chars', 'translate_chars', 'ai_edit_tokens',
  ];

  return (
    <div className="usage-meter">
      <div className="settings-row">
        <span>Plan</span>
        <span className={`plan-badge ${plan}`}>{plan}</span>
      </div>
      {resources.map((resource) => {
        const pct = usagePercent(resource);
        const fillClass = pct >= 90 ? 'danger' : pct >= 70 ? 'warning' : '';
        return (
          <div key={resource} className="usage-row">
            <span className="usage-label">{RESOURCE_LABELS[resource]}</span>
            <div className="usage-bar">
              <div className={`usage-fill ${fillClass}`} style={{ width: `${pct}%` }} />
            </div>
            <span className="usage-value">
              {formatUsage(resource, usage[resource], getLimit(resource))}
            </span>
          </div>
        );
      })}
    </div>
  );
}
