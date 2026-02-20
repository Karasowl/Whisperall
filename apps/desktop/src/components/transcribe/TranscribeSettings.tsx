import {
  resolveTranscriptionJobStage,
  transcriptionStageLabelKey,
  useTranscriptionStore,
} from '../../stores/transcription';
import { useT } from '../../lib/i18n';

const LANGUAGES = [
  { code: 'auto', labelKey: 'transcribe.autoDetect' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'de', label: 'German' },
  { code: 'it', label: 'Italian' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'zh', label: 'Chinese' },
];

function Toggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between group cursor-pointer" onClick={() => onChange(!checked)}>
      <div className="flex flex-col gap-1 pr-4">
        <span className="text-sm font-semibold text-text group-hover:text-primary transition-colors">{label}</span>
        <span className="text-xs text-muted">{description}</span>
      </div>
      <div className={`relative w-11 h-6 rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-base'}`}>
        <div className={`absolute top-[2px] h-5 w-5 rounded-full bg-white border border-edge transition-transform ${checked ? 'translate-x-[22px]' : 'translate-x-[2px]'}`} />
      </div>
    </div>
  );
}

type Props = { onOpenInNotes?: () => void };

export function TranscribeSettings({ onOpenInNotes }: Props) {
  const t = useT();
  const {
    diarization, aiSummary, punctuation, language, loading, savedDocumentId,
    stagedFile, stagedUrl, jobs, activeJobId,
    setDiarization, setAiSummary, setPunctuation, setLanguage,
    startTranscription,
  } = useTranscriptionStore();

  const activeJob = activeJobId ? jobs.find((j) => j.id === activeJobId) : null;
  const activeStage = activeJob ? resolveTranscriptionJobStage(activeJob) : null;
  const hasResumableJob = !!activeJob && (
    activeJob.status === 'paused' ||
    activeJob.status === 'processing' ||
    activeJob.status === 'pending'
  );
  const hasInput = !!stagedFile || !!stagedUrl.trim();
  const canStart = (hasInput || hasResumableJob) && !loading;
  const buttonLabel = loading
    ? (activeStage ? t(transcriptionStageLabelKey(activeStage)) : t('transcribe.processing'))
    : hasInput
      ? t('transcribe.start')
      : hasResumableJob
        ? t('transcribe.resume')
        : t('transcribe.start');

  return (
    <div className="bg-surface border border-edge rounded-xl h-full flex flex-col sticky top-0" data-testid="transcribe-settings">
      <div className="p-5 border-b border-edge flex justify-between items-center">
        <h3 className="font-bold text-lg">{t('transcribe.settings')}</h3>
        <span className="material-symbols-outlined text-muted">tune</span>
      </div>
      <div className="p-5 flex-1 flex flex-col gap-6 overflow-y-auto">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-text-secondary">{t('transcribe.spokenLang')}</label>
          <div className="relative">
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              aria-label={t('transcribe.spokenLang')}
              className="w-full bg-base border border-edge text-text text-sm rounded-lg focus:ring-primary focus:border-primary block p-2.5 appearance-none"
              data-testid="transcribe-language"
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>{l.labelKey ? t(l.labelKey) : l.label}</option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-muted">
              <span className="material-symbols-outlined text-sm">expand_more</span>
            </div>
          </div>
        </div>
        <Toggle label={t('transcribe.diarization')} description={t('transcribe.diarizationDesc')} checked={diarization} onChange={setDiarization} />
        <Toggle label={t('transcribe.aiSummary')} description={t('transcribe.aiSummaryDesc')} checked={aiSummary} onChange={setAiSummary} />
        <Toggle label={t('transcribe.punctuation')} description={t('transcribe.punctuationDesc')} checked={punctuation} onChange={setPunctuation} />
      </div>
      <div className="p-5 border-t border-edge flex flex-col gap-2">
        <button
          type="button"
          disabled={!canStart}
          onClick={() => startTranscription()}
          className="w-full bg-primary hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg shadow-lg shadow-primary/25 transition-all flex items-center justify-center gap-2 group"
          data-testid="start-transcription-btn"
        >
          <span>{buttonLabel}</span>
          {!loading && <span className="material-symbols-outlined group-hover:translate-x-1 transition-transform text-[20px]">arrow_forward</span>}
          {loading && <span className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>}
        </button>
        {savedDocumentId && onOpenInNotes && (
          <button
            type="button" onClick={onOpenInNotes}
            className="w-full border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 font-medium py-2.5 px-4 rounded-lg transition-all flex items-center justify-center gap-2 text-sm"
            data-testid="open-in-notes-btn"
          >
            <span className="material-symbols-outlined text-[18px]">open_in_new</span>
            <span>{t('transcribe.openInNotes')}</span>
          </button>
        )}
      </div>
    </div>
  );
}
