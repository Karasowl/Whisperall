import { useEffect, useMemo, useRef, useState } from 'react';
import { useNotificationsStore, type NotifTone } from '../../stores/notifications';
import { useProcessesStore } from '../../stores/processes';
import { useTranscriptionStore } from '../../stores/transcription';
import { combineProcessItems } from '../../lib/processes';
import { useT } from '../../lib/i18n';

const TONE_ICON: Record<NotifTone, string> = { success: 'check_circle', error: 'error', info: 'info' };
const TONE_COLOR: Record<NotifTone, string> = { success: 'text-emerald-400', error: 'text-red-400', info: 'text-primary' };
const TONE_BG: Record<NotifTone, string> = { success: 'bg-emerald-500/10 border-emerald-500/30', error: 'bg-red-500/10 border-red-500/30', info: 'bg-primary/10 border-primary/30' };

type NotificationBellProps = {
  onOpenProcesses?: () => void;
};

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

export function NotificationBell({ onOpenProcesses }: NotificationBellProps = {}) {
  const t = useT();
  const items = useNotificationsStore((s) => s.items);
  const jobs = useTranscriptionStore((s) => s.jobs);
  const localProcesses = useProcessesStore((s) => s.localProcesses);
  const markAllRead = useNotificationsStore((s) => s.markAllRead);
  const dismiss = useNotificationsStore((s) => s.dismiss);
  const clear = useNotificationsStore((s) => s.clear);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const unread = items.filter((n) => !n.read).length;
  const processItems = useMemo(() => combineProcessItems(jobs, localProcesses), [jobs, localProcesses]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  const toggle = () => {
    setOpen((v) => !v);
    if (!open) markAllRead();
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={toggle}
        className="p-2 rounded-lg text-muted hover:text-primary hover:bg-surface transition-colors relative"
        data-testid="notifications-bell"
        title={t('settings.notifications')}
      >
        <span className="material-symbols-outlined text-[18px]">notifications</span>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-80 max-h-80 overflow-y-auto rounded-xl border border-edge bg-[#1a2230] shadow-2xl" data-testid="notifications-panel">
          <div className="flex items-center justify-between px-3 py-2 border-b border-edge">
            <span className="text-xs font-semibold text-muted/70 uppercase tracking-wider">{t('settings.notifications')}</span>
            {items.length > 0 && (
              <button type="button" onClick={clear} className="text-[10px] text-muted/50 hover:text-red-400 transition-colors">Clear all</button>
            )}
          </div>
          {onOpenProcesses && (
            <div className="px-3 py-2 border-b border-edge/70">
              <button
                type="button"
                onClick={() => { onOpenProcesses(); setOpen(false); }}
                className="inline-flex items-center gap-1.5 rounded-md border border-edge bg-surface px-2.5 py-1 text-[11px] text-muted hover:text-primary hover:border-primary/40 transition-colors"
                data-testid="nav-processes"
              >
                <span className="material-symbols-outlined text-[14px]">progress_activity</span>
                <span>{t('nav.processes')}</span>
              </button>
            </div>
          )}
          {processItems.length > 0 && (
            <div className="border-b border-edge/70 px-3 py-2">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted/50">{t('nav.processes')}</div>
              <div className="space-y-1.5">
                {processItems.slice(0, 6).map((process) => (
                  <button
                    key={process.id}
                    type="button"
                    onClick={() => { onOpenProcesses?.(); setOpen(false); }}
                    className="w-full rounded-lg border border-edge/70 bg-surface/50 px-2.5 py-2 text-left hover:border-primary/40"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="min-w-0 truncate text-[12px] text-text/90">{process.title}</span>
                      <span className="shrink-0 text-[11px] text-muted">{t(`processes.filter.${process.status}`)} · {process.pct}%</span>
                    </div>
                    {process.error && (
                      <div className="mt-1 line-clamp-2 text-[11px] text-red-300">{process.error}</div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
          {items.length === 0 && processItems.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted/40">No notifications</p>
          ) : (
            items.map((n) => (
              <div key={n.id} className={`flex items-start gap-2 px-3 py-2 border-b border-edge/50 ${!n.read ? 'bg-white/[0.02]' : ''}`}>
                <span className={`material-symbols-outlined text-[14px] mt-0.5 shrink-0 ${TONE_COLOR[n.tone]}`}>{TONE_ICON[n.tone]}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-text/90 break-words select-text">{n.message}</p>
                  <span className="text-[10px] text-muted/40">{timeAgo(n.timestamp)}</span>
                </div>
                <button type="button" onClick={() => dismiss(n.id)} className="shrink-0 p-0.5 rounded hover:bg-white/10 text-muted/40 hover:text-muted transition-colors">
                  <span className="material-symbols-outlined text-[14px]">close</span>
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function NotificationToast() {
  const items = useNotificationsStore((s) => s.items);
  const dismiss = useNotificationsStore((s) => s.dismiss);
  const latest = items[0];
  const [visible, setVisible] = useState<string | null>(null);

  useEffect(() => {
    if (!latest || latest.read) { setVisible(null); return; }
    setVisible(latest.id);
    if (latest.tone !== 'error') {
      const t = setTimeout(() => setVisible(null), 4000);
      return () => clearTimeout(t);
    }
  }, [latest]);

  if (!visible || !latest || latest.id !== visible) return null;

  return (
    <div className={`fixed bottom-6 right-6 z-[200] flex items-start gap-2 rounded-lg border px-3 py-2.5 shadow-xl max-w-sm animate-in slide-in-from-bottom-2 ${TONE_BG[latest.tone]}`} data-testid="notification-toast">
      <span className={`material-symbols-outlined text-[16px] mt-0.5 shrink-0 ${TONE_COLOR[latest.tone]}`}>{TONE_ICON[latest.tone]}</span>
      <p className="flex-1 text-xs text-text/90 break-words select-text">{latest.message}</p>
      <button type="button" onClick={() => { dismiss(latest.id); setVisible(null); }} className="shrink-0 p-0.5 rounded hover:bg-white/10 text-muted/50 hover:text-muted transition-colors">
        <span className="material-symbols-outlined text-[14px]">close</span>
      </button>
    </div>
  );
}
