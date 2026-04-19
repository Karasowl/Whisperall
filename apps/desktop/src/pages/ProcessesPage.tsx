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
import { JobDetailModal } from '../components/processes/JobDetailModal';
import type { ProcessItem } from '../lib/processes';

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
  const { jobs, pollJob, setActiveJob, pauseJob, cancelJob, resumeJob, dismissJob } = useTranscriptionStore();
  const localProcesses = useProcessesStore((s) => s.localProcesses);
  const removeLocalProcess = useProcessesStore((s) => s.remove);
  const clearFinishedProcesses = useProcessesStore((s) => s.clearFinished);
  const [filter, setFilter] = useState<ProcessFilter>('all');
  const [prefs, setPrefs] = useState<NotifyPrefs>(loadPrefs);
  const [detailJobId, setDetailJobId] = useState<string | null>(null);
  const prevStatus = useRef<Record<string, ProcessStatus>>({});
  const processes = useMemo(
    () => combineProcessItems(jobs, localProcesses),
    [jobs, localProcesses],
  );
  const visible = useMemo(() => processes.filter((item) => processMatchesFilter(item, filter)), [filter, processes]);
  const terminalCount = useMemo(
    () => processes.filter((p) => p.status === 'completed' || p.status === 'failed' || p.status === 'canceled').length,
    [processes],
  );

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
  const detailProcess: ProcessItem | null = detailJobId ? processes.find((p) => p.id === detailJobId) ?? null : null;
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
    <div className="flex-1 overflow-auto p-8 pt-6" data-testid="processes-page">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black tracking-tight">{t('processes.title')}</h2>
          <p className="mt-1 text-muted">{t('processes.desc')}</p>
        </div>
        <div className="flex items-center gap-2">
          {terminalCount > 0 && (
            <button
              type="button"
              onClick={() => {
                // Clear terminal transcription jobs AND local processes in one
                // pass so the "Clear finished" count always matches reality.
                const terminalJobIds = jobs
                  .filter((j) => j.status === 'completed' || j.status === 'failed' || j.status === 'canceled')
                  .map((j) => j.id);
                for (const id of terminalJobIds) dismissJob(id);
                clearFinishedProcesses();
              }}
              className="rounded-lg border border-edge bg-surface px-2.5 py-1.5 text-xs text-muted transition-colors hover:border-red-500/30 hover:text-red-300"
              title={t('processes.clearFinishedHint')}
              data-testid="clear-finished-processes"
            >
              <span className="material-symbols-outlined mr-1 align-middle text-[14px]">delete_sweep</span>
              {t('processes.clearFinished')} <span className="opacity-60">({terminalCount})</span>
            </button>
          )}
        </div>
      </div>

      {/* Notification preferences — clearly separated from the filter chips */}
      <div className="mb-4 rounded-xl border border-edge/70 bg-surface/50 px-4 py-3" data-testid="process-notify-prefs">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted/60">
          {t('processes.notifyHeader')}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {(['completed', 'failed', 'paused', 'canceled'] as const).map((status) => (
            <label key={status} className="flex items-center gap-1.5 rounded-lg border border-edge bg-base px-2 py-1 text-xs text-text/80">
              <span className="text-muted/70">{t(`processes.filter.${status}`)}</span>
              <select
                value={prefs.defaults[status]}
                onChange={(e) => setPrefs((p) => ({
                  ...p,
                  defaults: { ...p.defaults, [status]: e.target.value as NotifyMode },
                }))}
                className="rounded bg-surface px-1 py-0.5 text-xs"
              >
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
          {visible.map((item) => {
            const openNoteFn = openNote(item.documentId);
            const isTranscribe = item.type === 'transcribe_file';
            const isActive = item.status === 'running' || item.status === 'queued';
            const isResumable = item.status === 'paused' || item.status === 'failed' || item.status === 'canceled';
            // Primary action: open the resulting note if we have one, else
            // open the read-only JobDetailModal. The legacy TranscribePage
            // workspace (with upload/URL/settings UI) is kept as a fallback
            // in the overflow menu only.
            const primaryAction = openNoteFn
              ? { label: t('processes.openNote'), onClick: openNoteFn }
              : (isTranscribe ? { label: t('transcribe.viewTranscription'), onClick: () => setDetailJobId(item.id) } : null);
            // Secondary: pause (while running) or retry (when terminal/paused).
            const secondaryAction = isTranscribe && isActive
              ? { label: t('processes.pause'), onClick: () => pauseJob(item.id) }
              : (isTranscribe && isResumable && !item.synthetic
                ? { label: t('processes.retry'), onClick: () => void resumeJob(item.id) }
                : null);
            const dangerAction = isTranscribe && (isActive || item.status === 'paused')
              ? { label: t('processes.cancel'), onClick: () => cancelJob(item.id) }
              : null;
            // Dismiss routes by job origin: transcription jobs (synthetic URL
            // OR real file jobs in `jobs[]`) → `dismissJob` which removes
            // from the transcription store + aborts runtime if active.
            // LocalProcesses → `removeLocalProcess`. We detect transcription
            // jobs by presence in `jobs[]`.
            const canDismiss = item.status === 'completed' || item.status === 'failed' || item.status === 'canceled';
            const isTranscriptionJob = jobs.some((j) => j.id === item.id);
            const onDismiss = canDismiss
              ? (isTranscriptionJob ? () => dismissJob(item.id) : () => removeLocalProcess(item.id))
              : null;
            return (
              <ProcessCard
                key={item.id}
                process={item}
                stageLabel={t(item.stageLabelKey)}
                primaryAction={primaryAction}
                secondaryAction={secondaryAction}
                dangerAction={dangerAction}
                onOpenNote={openNoteFn}
                onOpenTranscription={isTranscribe && !item.synthetic ? () => openTranscribe(item.id) : null}
                onRefresh={isTranscribe && !item.synthetic ? (() => void pollJob(item.id)) : null}
                onDismiss={onDismiss}
                notifyMode={processNotifyMode(item.id)}
                onNotifyModeChange={(mode) => setProcessNotifyMode(item.id, mode)}
              />
            );
          })}
        </div>
      )}
      {detailProcess && (
        <JobDetailModal
          process={detailProcess}
          stageLabel={t(detailProcess.stageLabelKey)}
          failedStage={detailProcess.failedStage}
          onClose={() => setDetailJobId(null)}
          onOpenNote={openNote(detailProcess.documentId)}
          onCancel={detailProcess.type === 'transcribe_file' && (detailProcess.status === 'running' || detailProcess.status === 'queued' || detailProcess.status === 'paused')
            ? () => cancelJob(detailProcess.id)
            : null}
          onDismiss={detailProcess.status === 'completed' || detailProcess.status === 'failed' || detailProcess.status === 'canceled'
            ? (jobs.some((j) => j.id === detailProcess.id) ? () => dismissJob(detailProcess.id) : () => removeLocalProcess(detailProcess.id))
            : null}
        />
      )}
    </div>
  );
}
