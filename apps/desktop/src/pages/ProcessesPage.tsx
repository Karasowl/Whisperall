import { useEffect, useMemo, useRef, useState } from 'react';
import type { Page } from '../App';
import { useT } from '../lib/i18n';
import { electron } from '../lib/electron';
import { useDocumentsStore } from '../stores/documents';
import { useTranscriptionStore } from '../stores/transcription';
import { useProcessesStore } from '../stores/processes';
import { combineProcessItems, processMatchesFilter, type ProcessFilter, type ProcessStatus } from '../lib/processes';
import { ProcessFilters } from '../components/processes/ProcessFilters';
import { ProcessCard } from '../components/processes/ProcessCard';

type Props = { onNavigate?: (page: Page) => void };
type NotifyMode = 'silent' | 'notify' | 'notify_sound';
type NotifyOverrideMode = 'inherit' | NotifyMode;
type NotifyPrefs = {
  defaults: { completed: NotifyMode; failed: NotifyMode; paused: NotifyMode; canceled: NotifyMode };
  perProcess: Record<string, NotifyMode>;
};
const PREFS_KEY = 'whisperall-process-notify-v1';

function loadPrefs(): NotifyPrefs {
  const fallback: NotifyPrefs = {
    defaults: { completed: 'notify', failed: 'notify_sound', paused: 'notify', canceled: 'notify' },
    perProcess: {},
  };
  try {
    const parsed = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '');
    if (!parsed || typeof parsed !== 'object') return fallback;
    // Backward compatibility for the old flat shape.
    if (!('defaults' in parsed)) {
      return {
        defaults: {
          completed: parsed.completed ?? fallback.defaults.completed,
          failed: parsed.failed ?? fallback.defaults.failed,
          paused: parsed.paused ?? fallback.defaults.paused,
          canceled: parsed.canceled ?? fallback.defaults.canceled,
        },
        perProcess: {},
      };
    }
    const defaults = parsed.defaults ?? {};
    const perProcess = parsed.perProcess && typeof parsed.perProcess === 'object' ? parsed.perProcess : {};
    return {
      defaults: {
        completed: defaults.completed ?? fallback.defaults.completed,
        failed: defaults.failed ?? fallback.defaults.failed,
        paused: defaults.paused ?? fallback.defaults.paused,
        canceled: defaults.canceled ?? fallback.defaults.canceled,
      },
      perProcess,
    };
  } catch {
    return fallback;
  }
}
function beep() {
  const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return;
  const ctx = new Ctx(); const osc = ctx.createOscillator(); const gain = ctx.createGain();
  osc.type = 'triangle'; osc.frequency.value = 840; gain.gain.value = 0.02;
  osc.connect(gain).connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.12);
}

export function ProcessesPage({ onNavigate }: Props) {
  const t = useT();
  const { jobs, pollJob, setActiveJob, pauseJob, cancelJob, resumeJob } = useTranscriptionStore();
  const localProcesses = useProcessesStore((s) => s.localProcesses);
  const [filter, setFilter] = useState<ProcessFilter>('all');
  const [prefs, setPrefs] = useState<NotifyPrefs>(loadPrefs);
  const prevStatus = useRef<Record<string, ProcessStatus>>({});
  const processes = useMemo(
    () => combineProcessItems(jobs, localProcesses),
    [jobs, localProcesses],
  );
  const visible = useMemo(() => processes.filter((item) => processMatchesFilter(item, filter)), [filter, processes]);

  useEffect(() => { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); }, [prefs]);
  useEffect(() => {
    for (const item of processes) {
      const prev = prevStatus.current[item.id];
      prevStatus.current[item.id] = item.status;
      if (!prev || prev === item.status) continue;
      if (item.status !== 'completed' && item.status !== 'failed' && item.status !== 'paused' && item.status !== 'canceled') continue;
      const mode = prefs.perProcess[item.id] ?? prefs.defaults[item.status];
      if (mode === 'silent') continue;
      electron?.notify?.({ title: t('processes.notifyTitle'), body: `${item.title}: ${t(`processes.filter.${item.status}`)}` });
      if (mode === 'notify_sound') beep();
    }
  }, [prefs, processes, t]);

  const openTranscribe = (id: string) => { setActiveJob(id); onNavigate?.('transcribe'); };
  const openNote = (documentId: string | null) => {
    if (!documentId) return null;
    return () => { useDocumentsStore.getState().setPendingOpen(documentId); onNavigate?.('dictate'); };
  };
  const processNotifyMode = (id: string): NotifyOverrideMode => prefs.perProcess[id] ?? 'inherit';
  const setProcessNotifyMode = (id: string, mode: NotifyOverrideMode) => {
    setPrefs((p) => {
      const nextPerProcess = { ...p.perProcess };
      if (mode === 'inherit') delete nextPerProcess[id];
      else nextPerProcess[id] = mode;
      return { ...p, perProcess: nextPerProcess };
    });
  };

  return (
    <div className="flex-1 overflow-auto p-8 pt-12" data-testid="processes-page">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black tracking-tight">{t('processes.title')}</h2>
          <p className="mt-1 text-muted">{t('processes.desc')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(['completed', 'failed', 'paused', 'canceled'] as const).map((status) => (
            <label key={status} className="flex items-center gap-1.5 rounded-lg border border-edge bg-surface px-2 py-1 text-xs text-text/75">
              <span>{t(`processes.filter.${status}`)}</span>
              <select value={prefs.defaults[status]} onChange={(e) => setPrefs((p) => ({
                ...p,
                defaults: { ...p.defaults, [status]: e.target.value as NotifyMode },
              }))}
                className="rounded bg-base px-1 py-0.5 text-xs">
                <option value="silent">{t('processes.notifySilent')}</option>
                <option value="notify">{t('processes.notifyOnly')}</option>
                <option value="notify_sound">{t('processes.notifySound')}</option>
              </select>
            </label>
          ))}
        </div>
      </div>
      <ProcessFilters value={filter} items={processes} onChange={setFilter} />
      {visible.length === 0 ? (
        <div className="mt-6 rounded-xl border border-edge bg-surface p-6 text-sm text-muted">{t('processes.empty')}</div>
      ) : (
        <div className="mt-4 space-y-3">
          {visible.map((item) => (
            // Transcribe jobs open in Transcribe; local processes usually open in note context.
            <ProcessCard
              key={item.id}
              process={item}
              stageLabel={t(item.stageLabelKey)}
              primaryAction={item.type === 'transcribe_file'
                ? { label: t('processes.openTranscribe'), onClick: () => openTranscribe(item.id) }
                : (item.documentId ? { label: t('processes.openNote'), onClick: openNote(item.documentId)! } : null)}
              secondaryAction={item.type === 'transcribe_file' && (item.status === 'running' || item.status === 'queued')
                ? { label: t('processes.pause'), onClick: () => pauseJob(item.id) }
                : (item.type === 'transcribe_file' && (item.status === 'paused' || item.status === 'failed' || item.status === 'canceled')
                  ? { label: t('processes.retry'), onClick: () => void resumeJob(item.id) }
                  : null)}
              dangerAction={item.type === 'transcribe_file' && (item.status === 'running' || item.status === 'queued' || item.status === 'paused')
                ? { label: t('processes.cancel'), onClick: () => cancelJob(item.id) }
                : null}
              onOpenNote={item.type === 'transcribe_file' ? openNote(item.documentId) : null}
              onRefresh={item.type === 'transcribe_file' ? (() => void pollJob(item.id)) : null}
              notifyMode={processNotifyMode(item.id)}
              onNotifyModeChange={(mode) => setProcessNotifyMode(item.id, mode)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
