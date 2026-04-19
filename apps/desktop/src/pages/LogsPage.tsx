import { useMemo, useState } from 'react';
import { useNotificationsStore, type NotifTone } from '../stores/notifications';
import { useT } from '../lib/i18n';
import { Button } from '../components/ui/Button';
import { copyText } from '../lib/clipboard-utils';

const TONES: (NotifTone | 'all')[] = ['all', 'error', 'warning', 'info', 'success', 'debug'];
const TONE_COLOR: Record<NotifTone, string> = {
  error: 'text-red-400', warning: 'text-amber-400', info: 'text-primary', success: 'text-emerald-400', debug: 'text-muted',
};
const TONE_ICON: Record<NotifTone, string> = {
  error: 'error', warning: 'warning', info: 'info', success: 'check_circle', debug: 'bug_report',
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString();
}

function serialize(items: ReturnType<typeof useNotificationsStore.getState>['items']): string {
  return items
    .map((n) => {
      const head = `[${formatTime(n.timestamp)}] ${n.tone.toUpperCase()} ${n.context ? `(${n.context})` : ''} ${n.source ?? ''}`.trim();
      return `${head}\n${n.message}${n.detail ? `\n---\n${n.detail}` : ''}`;
    })
    .join('\n\n==========\n\n');
}

async function copy(text: string, label?: string): Promise<void> {
  await copyText(text, label);
}

export function LogsPage() {
  const t = useT();
  const items = useNotificationsStore((s) => s.items);
  const dismiss = useNotificationsStore((s) => s.dismiss);
  const clear = useNotificationsStore((s) => s.clear);
  const [filter, setFilter] = useState<NotifTone | 'all'>('all');
  const [search, setSearch] = useState('');
  const [backendTail, setBackendTail] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((n) => {
      if (filter !== 'all' && n.tone !== filter) return false;
      if (!q) return true;
      return (
        n.message.toLowerCase().includes(q) ||
        (n.detail ?? '').toLowerCase().includes(q) ||
        (n.context ?? '').toLowerCase().includes(q)
      );
    });
  }, [items, filter, search]);

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: items.length };
    for (const n of items) map[n.tone] = (map[n.tone] ?? 0) + 1;
    return map;
  }, [items]);

  const loadBackendTail = async () => {
    const api = (window as Window).whisperall?.backend;
    if (!api) { setBackendTail('(Electron backend API not available — running in browser mode)'); return; }
    try {
      const tail = await api.getLogTail(200);
      setBackendTail(tail || '(empty log)');
    } catch (e) {
      setBackendTail(`(failed to load: ${(e as Error).message})`);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden" data-testid="logs-page">
      <div className="shrink-0 px-8 pt-6 pb-4 border-b border-edge bg-base/50 backdrop-blur-sm no-drag">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-2xl font-bold text-text">{t('nav.logs')}</h1>
            <p className="text-[13px] text-text-tertiary tracking-[0.14px] mt-1">All errors and events, copy-friendly.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" leftIcon="content_copy" onClick={() => copy(serialize(filtered))} data-testid="logs-copy-all">Copy visible</Button>
            <Button variant="outline" size="sm" leftIcon="delete_sweep" onClick={clear} data-testid="logs-clear" className="hover:!text-red-400 hover:!border-red-500/40">Clear all</Button>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {TONES.map((tone) => (
            <Button key={tone} variant="chip" size="xs" active={filter === tone} onClick={() => setFilter(tone)} data-testid={`logs-filter-${tone}`}>
              {tone} <span className="ml-1 opacity-60">{counts[tone] ?? 0}</span>
            </Button>
          ))}
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" data-testid="logs-search"
            className="ml-auto flex-1 min-w-[180px] rounded-lg border border-edge bg-surface px-3 py-1.5 text-xs text-text outline-none focus:border-primary/40" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-4">
        {filtered.length === 0 ? (
          <p className="text-center text-sm text-text-quaternary py-12">No entries match.</p>
        ) : (
          <ul className="space-y-2">
            {filtered.map((n) => (
              <li key={n.id} className="rounded-lg border border-edge bg-surface p-3" data-testid="logs-entry">
                <div className="flex items-start gap-2">
                  <span className={`material-symbols-outlined text-[16px] mt-0.5 shrink-0 ${TONE_COLOR[n.tone]}`}>{TONE_ICON[n.tone]}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-[10px] text-muted/70 mb-0.5">
                      <span>{formatTime(n.timestamp)}</span>
                      {n.context && <span className="rounded bg-edge/50 px-1.5 py-0.5">{n.context}</span>}
                      {n.source && <span className="rounded bg-edge/50 px-1.5 py-0.5">{n.source}</span>}
                    </div>
                    <p className="text-xs text-text/90 break-words select-text">{n.message}</p>
                    {n.detail && (
                      <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-base/60 p-2 text-[10px] font-mono text-muted select-text">{n.detail}</pre>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => copy(`${n.message}${n.detail ? `\n\n${n.detail}` : ''}`)} title="Copy" className="p-1 rounded text-muted/60 hover:text-primary hover:bg-white/5">
                      <span className="material-symbols-outlined text-[14px]">content_copy</span>
                    </button>
                    <button onClick={() => dismiss(n.id)} title="Dismiss" className="p-1 rounded text-muted/60 hover:text-red-400 hover:bg-white/5">
                      <span className="material-symbols-outlined text-[14px]">close</span>
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <details className="mt-6 rounded-lg border border-edge bg-surface/50 p-3">
          <summary className="cursor-pointer text-xs font-medium text-muted hover:text-primary flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px]">terminal</span>
            Backend log (tail)
            <button onClick={(e) => { e.preventDefault(); loadBackendTail(); }} className="ml-auto rounded border border-edge px-2 py-0.5 text-[10px] hover:border-primary/40">Load</button>
          </summary>
          <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded bg-base/60 p-2 text-[10px] font-mono text-muted select-text">{backendTail || '(click Load)'}</pre>
          {backendTail && (
            <button onClick={() => copy(backendTail)} className="mt-2 text-[10px] text-muted hover:text-primary">Copy backend log</button>
          )}
        </details>
      </div>
    </div>
  );
}
