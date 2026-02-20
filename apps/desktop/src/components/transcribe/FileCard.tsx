import {
  resolveTranscriptionJobProgress,
  resolveTranscriptionJobStage,
  transcriptionStageDetailKey,
  transcriptionStageLabelKey,
  type TranscriptionJob,
} from '../../stores/transcription';
import { useT } from '../../lib/i18n';

type Props = {
  job: TranscriptionJob;
  isActive: boolean;
  onClick: () => void;
};

export function FileCard({ job, isActive, onClick }: Props) {
  const t = useT();
  const stage = resolveTranscriptionJobStage(job);
  const { done, total, pct } = resolveTranscriptionJobProgress(job);
  const stageLabel = t(transcriptionStageLabelKey(stage));
  const stageDetailKey = transcriptionStageDetailKey(stage);
  const stageDetail = stageDetailKey ? t(stageDetailKey) : null;
  const isActiveStage = stage !== 'completed' && stage !== 'paused' && stage !== 'failed';
  const isPaused = stage === 'paused';
  const isFailed = stage === 'failed';
  const isCompleted = stage === 'completed';
  const useUploadCounters = stage === 'uploading';
  const rightCounter = `${done}/${total} ${t('transcribe.chunks')}`;

  return (
    <div
      onClick={onClick}
      data-testid="file-card"
      className={`bg-surface rounded-xl p-5 border transition-colors cursor-pointer ${
        isActive ? 'border-primary' : 'border-edge hover:border-text-secondary'
      }`}
    >
      <div className="flex items-start gap-4">
        <div className="size-12 rounded bg-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined">audio_file</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-center mb-1">
            <h4 className="font-semibold text-text truncate">{job.filename ?? job.id}</h4>
            {isActiveStage && <span className="text-xs text-primary font-medium">{pct}%</span>}
          </div>
          {isActiveStage && (
            <>
              <div className="relative w-full h-2 bg-black/40 rounded-full overflow-hidden mb-2">
                <div className="absolute top-0 left-0 h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                <div className="absolute top-0 left-0 h-full w-full bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full animate-shimmer" />
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-primary font-medium">{stageLabel}</span>
                <span className="text-xs text-muted">{rightCounter}</span>
              </div>
              {stageDetail && (
                <p className="text-xs text-muted mt-1">
                  {stageDetail}
                  {!useUploadCounters && total > 0 ? ` (${rightCounter})` : ''}
                </p>
              )}
            </>
          )}
          {isCompleted && (
            <div className="flex items-center gap-3 mt-1">
              <span className="text-xs font-medium text-green-400 uppercase">{stageLabel}</span>
              <span className="text-xs text-muted">{rightCounter}</span>
            </div>
          )}
          {isPaused && (
            <div className="flex items-center gap-3 mt-1">
              <span className="text-xs font-medium text-amber-400 uppercase">{stageLabel}</span>
              <span className="text-xs text-muted">{rightCounter}</span>
            </div>
          )}
          {isFailed && (
            <div className="flex items-center gap-3 mt-1">
              <span className="text-xs font-medium text-red-400 uppercase">{stageLabel}</span>
              <span className="text-xs text-muted">{rightCounter}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
