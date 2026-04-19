import { useEffect, useState } from 'react';
import type { ProcessItem } from '../../lib/processes';
import { PROCESS_INTERRUPTED_SENTINEL } from '../../stores/processes';
import { copyText } from '../../lib/clipboard-utils';
import { useT } from '../../lib/i18n';
import { useSettingsStore } from '../../stores/settings';

type Props = {
  process: ProcessItem;
  /** Localized stage label (t(process.stageLabelKey)) resolved by the caller. */
  stageLabel: string;
  /** Backend pipeline stage that raised the failure, if any (e.g. `resolve`). */
  failedStage?: string;
  onClose: () => void;
  onOpenNote?: (() => void) | null;
  onCancel?: (() => void) | null;
  onDismiss?: (() => void) | null;
};

const STATUS_PILL: Record<ProcessItem['status'], string> = {
  completed: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  canceled: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  failed: 'bg-red-500/15 text-red-300 border-red-500/30',
  paused: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  queued: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  running: 'bg-primary/15 text-primary border-primary/30',
};

const STATUS_BAR: Record<ProcessItem['status'], string> = {
  completed: 'bg-emerald-400',
  canceled: 'bg-rose-400',
  failed: 'bg-red-400',
  paused: 'bg-amber-400',
  queued: 'bg-sky-400',
  running: 'bg-primary',
};

function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}m ${r.toString().padStart(2, '0')}s` : `${r}s`;
}

/**
 * Absolute timestamp formatted for the user's locale. Shows only the time
 * for same-day timestamps, otherwise `dd MMM HH:MM` so the user can tell
 * how old a failure is without parsing a full date.
 */
function formatTimestamp(ts: number, locale: string): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate();
  return sameDay
    ? d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleString(locale, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/**
 * "N ago" helper in the locale's short form. Falls back gracefully if all
 * the ago keys happen to be missing.
 */
function formatAgo(ts: number, t: (key: string) => string): string {
  const seconds = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (seconds < 60) return t('processes.agoSeconds').replace('{n}', String(seconds));
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t('processes.agoMinutes').replace('{n}', String(minutes));
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('processes.agoHours').replace('{n}', String(hours));
  const days = Math.floor(hours / 24);
  return t('processes.agoDays').replace('{n}', String(days));
}

function useTickWhile(active: boolean, intervalMs: number): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick((n) => n + 1), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs]);
  return tick;
}

/**
 * Read-only detail view for a single transcription job.
 *
 * Intentionally does NOT include any of the "start a new transcription"
 * affordances (upload, paste URL, language picker, diarization toggle, start
 * button) — those belong in the Transcribe dialog on DictatePage. This modal
 * exists so the user can inspect an in-flight job without being re-offered the
 * configuration UI. The header links back to the Processes hub, which is
 * the "source of truth" list and the expected way to navigate between jobs.
 */
export function JobDetailModal({ process, stageLabel, failedStage, onClose, onOpenNote, onCancel, onDismiss }: Props) {
  const t = useT();
  const uiLanguage = useSettingsStore((s) => s.uiLanguage);
  const uiLocale = uiLanguage === 'es' ? 'es-ES' : 'en-US';
  const isRunning = process.status === 'running' || process.status === 'queued';
  const isSynthetic = process.synthetic === true;
  // Re-render every 30 s so the `hace Xs` / `N ago` labels stay fresh for
  // terminal jobs too (running jobs already re-render via their own ticker).
  useTickWhile(true, 30_000);
  const showChunks = !isSynthetic && process.total > 0;
  // Live elapsed ticker for synthetic URL jobs.
  useTickWhile(isRunning && isSynthetic && !!process.startedAt, 1000);
  const elapsedLabel = isSynthetic && process.startedAt && isRunning
    ? formatElapsed(Date.now() - process.startedAt)
    : '';
  const errorText = process.error === PROCESS_INTERRUPTED_SENTINEL
    ? t('processes.interruptedOnClose')
    : process.error;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Transient success flag so the icon flips to a checkmark for ~1s after
  // a successful copy. More immediate than a toast, which can be missed or
  // suppressed if the user already dismissed notifications.
  const [copyFlash, setCopyFlash] = useState<'source' | 'error' | 'logs' | null>(null);
  // On-demand backend log tail — lazy fetch for terminal jobs, live-stream
  // for running jobs. The live stream is the big one: every test no longer
  // requires waiting for the 30-min timeout; the user sees stage transitions
  // (resolve → extract → upload → chunk batch) in real time and can cancel
  // as soon as anything looks stuck.
  const [logTail, setLogTail] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(isRunning);  // auto-open for running jobs
  const [logLoading, setLogLoading] = useState(false);
  const [logsFilter, setLogsFilter] = useState<'human' | 'relevant' | 'all'>('human');
  const [liveTailing, setLiveTailing] = useState(false);
  // Timestamp of the most recent log line appended. Compared against now()
  // to drive the "backend idle for Xs" warning for running jobs.
  const [lastLogActivityAt, setLastLogActivityAt] = useState<number>(Date.now());

  const fetchLogs = async () => {
    setLogLoading(true);
    try {
      const api = (window as Window).whisperall?.backend;
      const text = api?.getLogTail ? await api.getLogTail(500) : '';
      setLogTail(text || t('transcribe.serverLogsEmpty'));
    } catch {
      setLogTail(t('transcribe.serverLogsUnavailable'));
    } finally {
      setLogLoading(false);
    }
  };

  // Auto-fetch + live-stream for running jobs. When the job is terminal,
  // fetch once; when it's running, fetch once (to get history) and then
  // subscribe to live additions. Cleanup stops the main-process watcher.
  useEffect(() => {
    if (!logOpen) return;
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;
    (async () => {
      if (logTail === null) await fetchLogs();
      if (cancelled) return;
      if (isRunning) {
        const api = (window as Window).whisperall?.backend;
        if (api?.startLogStream) {
          setLiveTailing(true);
          setLastLogActivityAt(Date.now());
          unsubscribe = api.startLogStream((lines) => {
            if (!lines || lines.length === 0) return;
            setLastLogActivityAt(Date.now());
            setLogTail((prev) => {
              const base = prev && prev !== t('transcribe.serverLogsEmpty') && prev !== t('transcribe.serverLogsUnavailable') ? prev : '';
              return base + (base && !base.endsWith('\n') ? '\n' : '') + lines.join('\n');
            });
          });
        }
      }
    })();
    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
      setLiveTailing(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logOpen, isRunning]);

  // Idle-seconds ticker for the warning. Recomputes every 5 s — enough
  // granularity without spamming re-renders.
  useTickWhile(isRunning && logOpen && liveTailing, 5_000);
  const idleSeconds = isRunning && liveTailing
    ? Math.floor((Date.now() - lastLogActivityAt) / 1000)
    : 0;
  // Threshold: 60 s without a log line DURING running = probably stuck.
  const showIdleWarning = isRunning && liveTailing && idleSeconds >= 60;
  /**
   * Keep only lines that are likely to explain a transcribe failure:
   * — anything from our `[transcribe*` loggers (URL pipeline stages)
   * — WARNING / ERROR / CRITICAL from any source
   * — HTTP status codes >= 400 in uvicorn access lines
   * — unhandled tracebacks (lines starting with `Traceback` + File refs)
   * Noise from GETs /v1/usage, /v1/documents, etc. is already filtered
   * server-side by `_AccessLogFilter` but keeping this client-side filter
   * means legacy backends (pre-filter) still produce useful output.
   */
  const relevantLines = (raw: string): string => {
    if (!raw) return raw;
    const keepRe = /(\[transcribe|WARN|ERROR|CRITICAL|Traceback|File "|ffmpeg|yt[_-]?dlp|HTTP\/1\.1" [4-5]\d\d|get_debate_state failed)/i;
    const lines = raw.split('\n');
    const filtered = lines.filter((l) => keepRe.test(l));
    return filtered.length > 0 ? filtered.join('\n') : '';
  };
  /**
   * Translate raw backend log lines into a user-language summary.
   *
   * The backend emits tagged events like `[transcribe.urljob] stage=extract
   * done chunks=5` or `[transcribe.url] stage=resolve download progress
   * bytes=4194304 mb=4.0 …`. That vocabulary is useful for an engineer but
   * noisy for a user who just wants to know "where are we?". Each regex
   * captures ONE event flavour, pulls the useful parameter (MB, chunk count,
   * elapsed seconds), and formats it via an i18n key. Events that don't
   * match are dropped — the Summary tab is curated, not a dump.
   */
  const humanize = (raw: string): string => {
    if (!raw) return '';
    const rules: Array<{ re: RegExp; key: string; vars?: (m: RegExpMatchArray) => Record<string, string> }> = [
      { re: /\[transcribe\.urljob\] start url=/, key: 'transcribe.humanLog.urljobStart' },
      { re: /stage=resolve download begin url=https?:\/\/(?:www\.)?(?:youtu|googlevideo)/, key: 'transcribe.humanLog.resolveDownloadBegin' },
      {
        re: /stage=resolve download progress bytes=\d+ mb=([\d.]+) .*throughput=([\d.]+) Mbps/,
        key: 'transcribe.humanLog.progress',
        vars: (m) => ({ mb: m[1], mbps: m[2] }),
      },
      {
        re: /stage=resolve download done bytes=\d+ ct=[^\s]+ elapsed=([\d.]+)s/,
        key: 'transcribe.humanLog.resolveDownloadDone',
        vars: (m) => {
          const byteMatch = m.input?.match(/bytes=(\d+)/);
          const bytes = byteMatch ? parseInt(byteMatch[1], 10) : 0;
          return { mb: (bytes / (1024 * 1024)).toFixed(1), s: m[1] };
        },
      },
      { re: /yt_dlp_download begin/, key: 'transcribe.humanLog.ytDlpDownloadBegin' },
      {
        re: /yt_dlp_download done elapsed=([\d.]+)s path=/,
        key: 'transcribe.humanLog.ytDlpDownloadDone',
        vars: (m) => {
          const byteMatch = m.input?.match(/bytes=(\d+)/);
          const bytes = byteMatch ? parseInt(byteMatch[1], 10) : 0;
          return { mb: (bytes / (1024 * 1024)).toFixed(1), s: m[1] };
        },
      },
      { re: /yt_dlp_download failed/, key: 'transcribe.humanLog.ytDlpDownloadFailed' },
      {
        re: /stage=extract done chunks=(\d+)/,
        key: 'transcribe.humanLog.extractDone',
        vars: (m) => ({ n: m[1] }),
      },
      { re: /stage=register job=/, key: 'transcribe.humanLog.registerJob' },
      {
        re: /stage=upload chunk=(\d+) attempt=(\d+)\/(\d+) err_type=/,
        key: 'transcribe.humanLog.uploadRetry',
        vars: (m) => ({ n: m[1] }),
      },
      { re: /stage=upload failed|TRANSCRIBE_URL_UPLOAD_FAILED/, key: 'transcribe.humanLog.uploadFailed' },
      { re: /stage=upload done/, key: 'transcribe.humanLog.uploadDone' },
      { re: /stage=diarize begin/, key: 'transcribe.humanLog.diarizeBegin' },
      { re: /stage=diarize (failed|http_error)/, key: 'transcribe.humanLog.diarizeFailed' },
      { re: /stage=transcribe (failed|http_error)/, key: 'transcribe.humanLog.transcribeFailed' },
      {
        re: /\[transcribe\.run_job\] starting STT on (\d+) chunks/,
        key: 'transcribe.humanLog.runChunk',
        vars: (m) => ({ n: m[1] }),
      },
      { re: /stage=save begin/, key: 'transcribe.humanLog.saveBegin' },
      { re: /\[transcribe\.urljob\] done url=|stage=save.*text_len=|notifyCompleted/, key: 'transcribe.humanLog.done' },
      { re: /TRANSCRIBE_URL_YTDLP_TIMEOUT|TRANSCRIBE_URL_DOWNLOAD_TIMEOUT|timed out/i, key: 'transcribe.humanLog.timeout' },
    ];
    const out: string[] = [];
    const seenKeys = new Set<string>();
    for (const line of raw.split('\n')) {
      for (const rule of rules) {
        const m = line.match(rule.re);
        if (!m) continue;
        let text = t(rule.key);
        if (rule.vars) {
          const vars = rule.vars(m);
          for (const [k, v] of Object.entries(vars)) text = text.replace(`{${k}}`, v);
        }
        // Dedupe exact repeats (e.g. multiple upload-done lines from
        // rapid-fire chunk retries) while keeping progress events.
        const isProgress = rule.key === 'transcribe.humanLog.progress';
        const dedupeKey = isProgress ? `${rule.key}::${text}` : rule.key;
        if (!isProgress && seenKeys.has(dedupeKey)) break;
        seenKeys.add(dedupeKey);
        out.push(`• ${text}`);
        break;
      }
    }
    return out.join('\n') || t('transcribe.humanLog.empty');
  };
  const displayedLog = (() => {
    if (!logTail) return '';
    if (logsFilter === 'all') return logTail;
    if (logsFilter === 'human') return humanize(logTail);
    const filtered = relevantLines(logTail);
    return filtered || t('transcribe.logsNothingRelevant');
  })();
  const copyToClipboard = async (text: string, which: 'source' | 'error') => {
    // copyText() falls back through Electron native → web Clipboard API →
    // document.execCommand so it works even when one path is blocked. Using
    // navigator.clipboard directly (as this function did before) silently
    // failed in some Electron window states.
    const ok = await copyText(text, which === 'source' ? 'link' : 'error');
    if (ok) {
      setCopyFlash(which);
      setTimeout(() => setCopyFlash((v) => (v === which ? null : v)), 1200);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      data-testid="job-detail-modal"
    >
      <div className="w-full max-w-lg rounded-2xl border border-edge bg-surface shadow-2xl overflow-hidden">
        {/* Header with Back-to-Processes affordance + close */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-edge">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted transition-colors hover:bg-white/[0.06] hover:text-text"
            data-testid="job-detail-back"
          >
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            <span>{t('transcribe.backToProcesses')}</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-white/[0.06] hover:text-text"
            aria-label="Close"
            data-testid="job-detail-close"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
          {/* Title row: source + status pill */}
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted/60">{t('transcribe.source')}</p>
                <button
                  type="button"
                  onClick={() => void copyToClipboard(process.title, 'source')}
                  className={`flex h-5 w-5 items-center justify-center rounded transition-colors hover:bg-white/[0.06] ${copyFlash === 'source' ? 'text-emerald-400' : 'text-muted/60 hover:text-text'}`}
                  title={t('transcribe.copySource')}
                  aria-label={t('transcribe.copySource')}
                  data-testid="job-detail-copy-source"
                >
                  <span className="material-symbols-outlined text-[13px]">
                    {copyFlash === 'source' ? 'check' : 'content_copy'}
                  </span>
                </button>
              </div>
              <p className="mt-0.5 break-all text-sm font-semibold text-text select-text" data-testid="job-detail-source">
                {process.title}
              </p>
            </div>
            <span
              className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_PILL[process.status]}`}
              data-testid="job-detail-status"
            >
              {t(`processes.filter.${process.status}`)}
            </span>
          </div>

          {/* Timestamps — tells the user when the job started and (if terminal) when it ended */}
          {(process.startedAt || process.endedAt) && (
            <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 rounded-md border border-edge/60 bg-base/40 px-3 py-2 text-[11px]" data-testid="job-detail-timestamps">
              {process.startedAt && (
                <span className="flex items-baseline gap-1.5">
                  <span className="text-muted/60">{t('processes.startedAt')}:</span>
                  <span className="font-medium tabular-nums text-text/90">{formatTimestamp(process.startedAt, uiLocale)}</span>
                  <span className="text-muted/50">· {formatAgo(process.startedAt, t)}</span>
                </span>
              )}
              {process.endedAt && (
                <span className="flex items-baseline gap-1.5">
                  <span className="text-muted/60">{t('processes.endedAt')}:</span>
                  <span className="font-medium tabular-nums text-text/90">{formatTimestamp(process.endedAt, uiLocale)}</span>
                  <span className="text-muted/50">· {formatAgo(process.endedAt, t)}</span>
                </span>
              )}
              {process.startedAt && process.endedAt && (
                <span className="flex items-baseline gap-1.5">
                  <span className="text-muted/60">{t('processes.duration')}:</span>
                  <span className="font-medium tabular-nums text-text/90">{formatElapsed(process.endedAt - process.startedAt)}</span>
                </span>
              )}
            </div>
          )}

          {/* Stage + progress */}
          <div className="mb-3">
            <div className="flex items-center justify-between text-[12px] text-text/85">
              <span data-testid="job-detail-stage">{stageLabel}</span>
              {showChunks && (
                <span className="tabular-nums text-muted">
                  {process.done}/{process.total} {t('transcribe.chunks')} · {process.pct}%
                </span>
              )}
              {isSynthetic && elapsedLabel && (
                <span className="tabular-nums text-muted">
                  {t('transcribe.elapsed')}: {elapsedLabel}
                </span>
              )}
            </div>
            {isRunning && (
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-base">
                {showChunks ? (
                  <div
                    className={`h-full rounded-full transition-all ${STATUS_BAR[process.status]}`}
                    style={{ width: `${process.pct}%` }}
                  />
                ) : (
                  <div className={`h-full w-1/3 rounded-full wa-indeterminate ${STATUS_BAR[process.status]}/70`} />
                )}
              </div>
            )}
          </div>

          {/* Stage detail text — only shown for running synthetic jobs since
              it's the only signal we have while the backend does the work */}
          {isRunning && isSynthetic && (
            <p className="mb-3 text-[11px] leading-relaxed text-muted/70" data-testid="job-detail-hint">
              {t('transcribe.jobMissingBackend')}
            </p>
          )}

          {errorText && (
            <div className="mb-3 rounded-lg border border-red-500/25 bg-red-500/8 px-3 py-2" data-testid="job-detail-error">
              {failedStage && (
                <p className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-red-300/90" data-testid="job-detail-failed-stage">
                  <span className="material-symbols-outlined text-[12px]">report</span>
                  <span>{t('transcribe.failedAtStage')}: </span>
                  <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-red-200 normal-case tracking-normal">
                    {t(`transcribe.stageName.${failedStage}`) || failedStage}
                  </span>
                </p>
              )}
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 flex-1 break-words text-xs leading-relaxed text-red-200 select-text">{errorText}</p>
                <button
                  type="button"
                  onClick={() => void copyToClipboard(errorText, 'error')}
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors hover:bg-red-500/15 ${copyFlash === 'error' ? 'text-emerald-400' : 'text-red-200/70 hover:text-red-100'}`}
                  title={t('transcribe.copyError')}
                  aria-label={t('transcribe.copyError')}
                  data-testid="job-detail-copy-error"
                >
                  <span className="material-symbols-outlined text-[14px]">
                    {copyFlash === 'error' ? 'check' : 'content_copy'}
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* Backend log tail — collapsible, available for EVERY terminal or
              running job so the user can always review what happened. For
              running jobs it opens by default so pipeline stages are visible
              in real time; for completed/failed/canceled jobs it's collapsed
              but one click away. Previously we hid it on success, which meant
              successful runs had no diagnostic trail for "wait, what exactly
              did it do?" style follow-ups. */}
          {(process.status === 'failed' || process.status === 'canceled' || process.status === 'completed' || isRunning) && (
            <div className="mb-3 rounded-lg border border-edge/60 bg-base/40 px-3 py-2" data-testid="job-detail-logs">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const next = !logOpen;
                    setLogOpen(next);
                    if (next && logTail === null) void fetchLogs();
                  }}
                  className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted/70 transition-colors hover:text-text"
                  data-testid="job-detail-logs-toggle"
                >
                  <span className="material-symbols-outlined text-[14px]">
                    {logOpen ? 'expand_more' : 'chevron_right'}
                  </span>
                  <span>{logOpen ? t('transcribe.serverLogsHide') : t('transcribe.serverLogsShow')}</span>
                  {liveTailing && (
                    <span className="ml-1 inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-emerald-300" data-testid="job-detail-live-tailing">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 wa-pulse" />
                      {t('transcribe.liveTailing')}
                    </span>
                  )}
                </button>
                {logOpen && logTail && (
                  <div className="flex items-center gap-1">
                    {/* Two-button segmented control for the filter. A select
                        would require more markup for a 2-choice scenario. */}
                    <div className="flex items-center rounded-md border border-edge/70 bg-base/40 p-0.5 text-[10px]" data-testid="job-detail-logs-filter">
                      <button
                        type="button"
                        onClick={() => setLogsFilter('human')}
                        className={`rounded px-1.5 py-0.5 transition-colors ${logsFilter === 'human' ? 'bg-white/[0.08] text-text' : 'text-muted/70 hover:text-text'}`}
                      >
                        {t('transcribe.logsFilterHuman')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setLogsFilter('relevant')}
                        className={`rounded px-1.5 py-0.5 transition-colors ${logsFilter === 'relevant' ? 'bg-white/[0.08] text-text' : 'text-muted/70 hover:text-text'}`}
                      >
                        {t('transcribe.logsFilterRelevant')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setLogsFilter('all')}
                        className={`rounded px-1.5 py-0.5 transition-colors ${logsFilter === 'all' ? 'bg-white/[0.08] text-text' : 'text-muted/70 hover:text-text'}`}
                      >
                        {t('transcribe.logsFilterAll')}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => void copyText(displayedLog || logTail, 'logs').then((ok) => {
                        if (ok) {
                          setCopyFlash('logs');
                          setTimeout(() => setCopyFlash((v) => (v === 'logs' ? null : v)), 1200);
                        }
                      })}
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors hover:bg-white/[0.06] ${copyFlash === 'logs' ? 'text-emerald-400' : 'text-muted/70 hover:text-text'}`}
                      title={t('transcribe.copyLogs')}
                      aria-label={t('transcribe.copyLogs')}
                      data-testid="job-detail-copy-logs"
                    >
                      <span className="material-symbols-outlined text-[14px]">
                        {copyFlash === 'logs' ? 'check' : 'content_copy'}
                      </span>
                    </button>
                  </div>
                )}
              </div>
              {logOpen && showIdleWarning && (
                <p
                  className="mt-2 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[11px] leading-snug text-amber-200"
                  data-testid="job-detail-idle-warning"
                >
                  <span className="material-symbols-outlined mr-1 align-middle text-[12px]">hourglass_empty</span>
                  {t('transcribe.backendIdle').replace('{seconds}', String(idleSeconds))}
                </p>
              )}
              {logOpen && (
                <pre
                  className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap break-all rounded bg-black/25 px-2 py-2 text-[10px] leading-snug font-mono text-muted/85 select-text"
                  data-testid="job-detail-logs-text"
                >
                  {logLoading ? '…' : displayedLog}
                </pre>
              )}
            </div>
          )}
        </div>

        {/* Footer actions — contextual, no "Start new transcription" here */}
        <div className="flex items-center justify-end gap-2 border-t border-edge px-4 py-3">
          {onDismiss && !isRunning && (
            <button
              type="button"
              onClick={() => { onDismiss(); onClose(); }}
              className="rounded-lg border border-edge px-2.5 py-1.5 text-xs text-muted transition-colors hover:border-red-500/30 hover:text-red-300"
              data-testid="job-detail-dismiss"
            >
              {t('processes.dismiss')}
            </button>
          )}
          {onCancel && isRunning && (
            <button
              type="button"
              onClick={() => { onCancel(); onClose(); }}
              className="rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-xs text-red-300 transition-colors hover:bg-red-500/15"
              data-testid="job-detail-cancel"
            >
              {t('processes.cancel')}
            </button>
          )}
          {onOpenNote && (
            <button
              type="button"
              onClick={() => { onOpenNote(); onClose(); }}
              className="rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/15"
              data-testid="job-detail-open-note"
            >
              {t('processes.openNote')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
