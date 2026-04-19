import { useEffect, useMemo, useReducer, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useActionsStore, type ActionInstance, type ActionKind, type ActionStatus } from '../../stores/actions';

const ICON: Record<ActionKind, string> = {
  mic: 'mic', live: 'graphic_eq', transcribe: 'description', tts: 'volume_up',
  'tts-read': 'text_to_speech', 'ai-edit': 'auto_fix', upload: 'cloud_upload',
};
const ACCENT: Record<ActionKind, string> = {
  mic: 'text-red-400', live: 'text-primary', transcribe: 'text-primary',
  tts: 'text-emerald-400', 'tts-read': 'text-emerald-400',
  'ai-edit': 'text-purple-400', upload: 'text-amber-400',
};
const RING: Record<ActionStatus, string> = {
  starting: 'ring-primary/30 animate-pulse',
  running: 'ring-primary/40',
  paused: 'ring-amber-500/40',
  finishing: 'ring-primary/60',
  completed: 'ring-emerald-500/40',
  failed: 'ring-red-500/60',
  canceled: 'ring-muted/30',
};

function formatElapsed(startedAt: number): string {
  const s = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

function ActionEntry({ action }: { action: ActionInstance }) {
  const remove = useActionsStore((s) => s.remove);
  const [expanded, setExpanded] = useState(false);
  // 1-Hz re-render while the action is live so the elapsed timer updates.
  const [, tick] = useReducer((x: number) => (x + 1) & 0xffff, 0);
  const isLive = action.status === 'running' || action.status === 'starting';

  useEffect(() => {
    if (!isLive) return;
    const i = setInterval(tick, 1000);
    return () => clearInterval(i);
  }, [isLive]);

  const progressPct = typeof action.progress === 'number' ? Math.round(Math.min(1, Math.max(0, action.progress)) * 100) : null;

  const handle = async (fn?: () => void | Promise<void>) => { try { await fn?.(); } catch { /* surfaces via notifications */ } };

  return (
    <div data-testid={`action-pill-${action.kind}`} className={`flex flex-col rounded-2xl bg-surface/95 backdrop-blur shadow-[var(--theme-shadow-card),var(--theme-shadow-inset-border)] ring-1 ${RING[action.status]} transition-all`}>
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <button
          type="button"
          onClick={() => (action.navigate ? action.navigate() : setExpanded((v) => !v))}
          className="flex items-center gap-2 min-w-0 flex-1 text-left"
          title={action.label}
        >
          <span className={`material-symbols-outlined text-[18px] shrink-0 ${ACCENT[action.kind]} ${isLive ? 'animate-[pulse_1.5s_ease-in-out_infinite]' : ''}`}>
            {ICON[action.kind]}
          </span>
          <div className="flex flex-col min-w-0">
            <span className="text-[11px] font-semibold text-text truncate">{action.label}</span>
            <span className="text-[10px] text-muted truncate">
              {action.status === 'failed' ? (action.error ?? 'failed')
                : action.status === 'completed' ? 'done'
                : action.status === 'paused' ? 'paused'
                : action.sublabel ?? formatElapsed(action.startedAt)}
            </span>
          </div>
        </button>
        <div className="flex items-center gap-0.5 shrink-0">
          {action.canPause && action.status === 'running' && (
            <button onClick={() => handle(action.pause)} title="Pause" className="p-1 rounded text-muted hover:text-amber-400 hover:bg-white/5" data-testid="action-pause">
              <span className="material-symbols-outlined text-[16px]">pause</span>
            </button>
          )}
          {action.canResume && action.status === 'paused' && (
            <button onClick={() => handle(action.resume)} title="Resume" className="p-1 rounded text-muted hover:text-primary hover:bg-white/5" data-testid="action-resume">
              <span className="material-symbols-outlined text-[16px]">play_arrow</span>
            </button>
          )}
          {action.canStop && (action.status === 'running' || action.status === 'paused') && (
            <button onClick={() => handle(action.stop)} title="Stop" className="p-1 rounded text-muted hover:text-red-400 hover:bg-white/5" data-testid="action-stop">
              <span className="material-symbols-outlined text-[16px]">stop</span>
            </button>
          )}
          {action.canCancel && (action.status === 'running' || action.status === 'paused' || action.status === 'starting') && (
            <button onClick={() => handle(action.cancel)} title="Cancel" className="p-1 rounded text-muted hover:text-red-400 hover:bg-white/5" data-testid="action-cancel">
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          )}
          {(action.status === 'failed' || action.status === 'completed' || action.status === 'canceled') && (
            <button onClick={() => remove(action.id)} title="Dismiss" className="p-1 rounded text-muted hover:text-text hover:bg-white/5">
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          )}
        </div>
      </div>
      {progressPct !== null && (
        <div className="h-0.5 bg-edge/40 mx-2.5 mb-1.5 rounded-full overflow-hidden">
          <div className="h-full bg-primary transition-all duration-200" style={{ width: `${progressPct}%` }} />
        </div>
      )}
      {expanded && (action.preview?.text || action.error) && (
        <div className="px-3 pb-2 pt-1 border-t border-edge/50">
          {action.preview?.text && (
            <p className="text-[11px] text-muted whitespace-pre-wrap break-words select-text max-h-32 overflow-y-auto">{action.preview.text}</p>
          )}
          {action.error && (
            <p className="mt-1 text-[11px] text-red-400 break-words select-text">{action.error}</p>
          )}
        </div>
      )}
    </div>
  );
}

export function ActionDock() {
  // Single subscription with shallow equality so Zustand never sees a "fresh"
  // object on unrelated store mutations and can't drive the consumer into an
  // update loop.
  const { order, itemsMap } = useActionsStore(
    useShallow((s) => ({ order: s.order, itemsMap: s.items })),
  );
  const items = useMemo(
    () => order.map((id) => itemsMap[id]).filter((x): x is ActionInstance => !!x),
    [order, itemsMap],
  );
  const visible = useMemo(() => items.slice(0, 3), [items]);
  const overflow = items.length - visible.length;

  if (items.length === 0) return null;

  return (
    <div
      data-testid="action-dock"
      className="fixed bottom-4 right-4 z-[90] flex flex-col gap-2 w-72 max-w-[calc(100vw-2rem)] no-drag pointer-events-auto"
    >
      {visible.map((a) => <ActionEntry key={a.id} action={a} />)}
      {overflow > 0 && (
        <div className="text-center text-[10px] text-muted/60">+{overflow} more</div>
      )}
    </div>
  );
}
