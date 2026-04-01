import { useState } from 'react';
import { useT } from '../../lib/i18n';
import type { DebateMessage } from '../../lib/debate-storage';

type Props = {
  items: DebateMessage[];
  participants: string[];
  principalCount: number;
  subagentCount: number;
  toolCount: number;
};

function cleanText(text: string): string {
  return text.replace(/```(?:json)?\s*[\s\S]*?```/gi, '').replace(/\s+/g, ' ').trim();
}

function clip(text: string, max = 180): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trim()}...`;
}

export function DebatePanelTrace({ items, participants, principalCount, subagentCount, toolCount }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  if (!items.length) return null;

  return (
    <div className="rounded-xl border border-edge bg-base/35 p-3 space-y-2" data-testid="debate-trace-card">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted/80">{t('notes.debateTraceTitle')}</p>
          <p className="text-[11px] text-muted/80">
            {subagentCount} {t('notes.debateTraceSubagents')} · {principalCount} {t('notes.debateTracePrincipals')} · {toolCount} {t('notes.debateTraceTools')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-[11px] text-primary hover:text-primary/80 transition-colors"
          data-testid="debate-trace-toggle"
        >
          {open ? t('notes.debateTraceHide') : t('notes.debateTraceShow')}
        </button>
      </div>

      <div className="space-y-1">
        <p className="text-[11px] text-muted/70">{t('notes.debateTraceParticipants')}</p>
        <div className="flex flex-wrap gap-1.5">
          {participants.map((name) => (
            <span key={name} className="rounded-full border border-edge px-2 py-0.5 text-[11px] text-text/85">{name}</span>
          ))}
        </div>
      </div>

      {open && (
        <div className="space-y-2 border-t border-edge/70 pt-2">
          {items.slice(-6).map((item) => (
            <div key={item.id} className="rounded-lg bg-base/45 px-2.5 py-2">
              <p className="text-[11px] text-muted mb-1">
                {item.speaker}
                {item.model ? <span className="ml-1 text-muted/60">· {item.model}</span> : null}
              </p>
              <p className="text-[12px] text-text/90 leading-relaxed">{clip(cleanText(item.text) || item.text.trim())}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
