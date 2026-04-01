import { useState, useEffect } from 'react';
import {
  resolveTranscriptionJobProgress,
  resolveTranscriptionJobStage,
  transcriptionStageDetailKey,
  transcriptionStageLabelKey,
  useTranscriptionStore,
} from '../stores/transcription';
import { useDocumentsStore } from '../stores/documents';
import { UploadZone } from '../components/transcribe/UploadZone';
import { FileCard } from '../components/transcribe/FileCard';
import { TranscribeSettings } from '../components/transcribe/TranscribeSettings';
import { useT } from '../lib/i18n';
import { usePricing } from '../lib/pricing-context';
import type { Page } from '../App';

type Props = { onNavigate?: (page: Page) => void };

export function TranscribePage({ onNavigate }: Props) {
  const t = useT();
  const openPricing = usePricing();
  const { jobs, activeJobId, loading, error, fullText, stagedFile, stagedUrl, savedDocumentId, stageFile, stageUrl, setActiveJob, urlStartedAt, cancelUrlTranscription } = useTranscriptionStore();
  const isPlanLimitError = !!error && (
    error.toLowerCase().includes('plan limit') ||
    error.toLowerCase().includes('monthly transcription limit')
  );

  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!urlStartedAt) { setElapsed(0); return; }
    setElapsed(Math.floor((Date.now() - urlStartedAt) / 1000));
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - urlStartedAt) / 1000)), 1000);
    return () => clearInterval(id);
  }, [urlStartedAt]);

  const handleOpenInNotes = () => {
    if (savedDocumentId && onNavigate) {
      useDocumentsStore.getState().setPendingOpen(savedDocumentId);
      onNavigate('dictate');
    }
  };

  const activeJob = activeJobId ? jobs.find((j) => j.id === activeJobId) : null;
  const activeStage = activeJob ? resolveTranscriptionJobStage(activeJob) : null;
  const activeProgress = activeJob ? resolveTranscriptionJobProgress(activeJob) : null;
  const activeStageLabel = activeStage
    ? t(transcriptionStageLabelKey(activeStage))
    : stagedFile
      ? t('transcribe.stagePreparing')
      : t('transcribe.processing');
  const activeStageDetailKey = activeStage ? transcriptionStageDetailKey(activeStage) : null;
  const activeStageDetail = activeStageDetailKey ? t(activeStageDetailKey) : null;

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-8 pt-12" data-testid="transcribe-page">
      <div className="mb-8">
        <h2 className="text-3xl font-black tracking-tight mb-2">{t('transcribe.title')}</h2>
        <p className="text-muted text-lg max-w-2xl">{t('transcribe.desc')}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1 overflow-y-auto">
        <div className="lg:col-span-8 flex flex-col gap-6">
          <UploadZone
            onFile={stageFile} onUrl={stageUrl}
            stagedFileName={stagedFile?.name} stagedUrl={stagedUrl}
          />
          {error && (
            <div
              className={`rounded-xl border px-4 py-3 flex items-start justify-between gap-4 ${
                isPlanLimitError ? 'bg-amber-50 border-amber-300 dark:bg-amber-500/10 dark:border-amber-500/30' : 'bg-red-50 border-red-300 dark:bg-red-500/10 dark:border-red-500/30'
              }`}
            >
              <div className="min-w-0">
                <p className={`text-sm ${isPlanLimitError ? 'text-amber-800 dark:text-amber-200' : 'text-red-700 dark:text-red-300'}`}>{error}</p>
                {isPlanLimitError && (
                  <p className="text-xs text-amber-700 dark:text-amber-300/90 mt-1">{t('transcribe.limitHelp')}</p>
                )}
              </div>
              {isPlanLimitError && (
                <button
                  type="button"
                  onClick={openPricing}
                  className="shrink-0 px-3 py-1.5 text-xs font-semibold text-white bg-primary hover:bg-blue-600 rounded-lg transition-colors"
                >
                  {t('upgrade.button')}
                </button>
              )}
            </div>
          )}
          {loading && (
            <div className="flex items-center gap-3">
              <div className="min-w-0">
                <p className="text-primary text-sm animate-pulse">{activeStageLabel}</p>
                {activeStageDetail && activeProgress && (
                  <p className="text-xs text-muted">
                    {activeStageDetail} ({activeProgress.done}/{activeProgress.total} {t('transcribe.chunks')})
                  </p>
                )}
              </div>
              {urlStartedAt != null && (
                <>
                  <span className="text-xs text-muted font-mono">{Math.floor(elapsed / 60)}:{(elapsed % 60).toString().padStart(2, '0')}</span>
                  <button type="button" onClick={cancelUrlTranscription} data-testid="transcribe-cancel-btn"
                    className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 transition-colors">
                    <span className="material-symbols-outlined text-[14px]">close</span>
                    {t('reader.stop') || 'Cancel'}
                  </button>
                </>
              )}
            </div>
          )}
          {jobs.map((job) => (
            <FileCard key={job.id} job={job} isActive={job.id === activeJobId} onClick={() => setActiveJob(job.id)} />
          ))}
          {fullText && (
            <div className="bg-surface border border-edge rounded-xl p-5" data-testid="transcribe-result">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-green-400 text-[20px]">check_circle</span>
                  <h3 className="font-semibold text-text">{t('transcribe.resultTitle')}</h3>
                </div>
                {savedDocumentId && (
                  <span className="text-xs text-emerald-400 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">bookmark_added</span>
                    {t('transcribe.savedToNotes')}
                  </span>
                )}
              </div>
              <p className="text-sm text-muted leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto">{fullText}</p>
              <div className="flex gap-3 mt-3">
                <button type="button" onClick={() => navigator.clipboard.writeText(fullText)}
                  className="text-xs text-muted hover:text-primary flex items-center gap-1 transition-colors">
                  <span className="material-symbols-outlined text-[14px]">content_copy</span>
                  {t('dictate.copy')}
                </button>
                {savedDocumentId && onNavigate && (
                  <button type="button" onClick={handleOpenInNotes}
                    className="text-xs text-primary hover:text-blue-400 flex items-center gap-1 transition-colors">
                    <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                    {t('transcribe.openInNotes')}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="lg:col-span-4">
          <TranscribeSettings onOpenInNotes={savedDocumentId ? handleOpenInNotes : undefined} />
        </div>
      </div>
    </div>
  );
}
