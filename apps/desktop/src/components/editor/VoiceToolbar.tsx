import type { DictationStatus } from '../../stores/dictation';
import type { AudioSourceType } from '../../lib/audio';
import { useT } from '../../lib/i18n';

type Props = {
  status: DictationStatus | 'idle' | 'recording' | 'error';
  source: AudioSourceType;
  onToggleRecord: () => void;
  onToggleSource: () => void;
  translateEnabled: boolean;
  onToggleTranslate: () => void;
  subtitlesActive: boolean;
  onToggleSubtitles: () => void;
};

export function VoiceToolbar({ status, source, onToggleRecord, onToggleSource, translateEnabled, onToggleTranslate, subtitlesActive, onToggleSubtitles }: Props) {
  const t = useT();
  const isRecording = status === 'recording';
  const isProcessing = status === 'processing';

  return (
    <div className="flex items-center gap-1.5" data-testid="voice-toolbar">
      <button
        onClick={onToggleRecord}
        disabled={isProcessing}
        data-testid="record-btn"
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
          isRecording
            ? 'bg-red-500/15 text-red-400 border border-red-500/30'
            : 'bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20'
        } disabled:opacity-30`}
      >
        {isRecording && <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />}
        <span className="material-symbols-outlined text-[16px] fill-1">{isRecording ? 'stop' : 'mic'}</span>
        {isRecording ? t('voice.recording') : t('voice.record')}
      </button>

      <button
        onClick={onToggleSource}
        disabled={isRecording}
        title={source === 'mic' ? t('dictate.switchSystem') : t('dictate.switchMic')}
        className="flex items-center gap-1 px-2 py-1.5 text-xs text-muted rounded-lg hover:bg-surface transition-colors disabled:opacity-30"
        data-testid="source-toggle"
      >
        <span className="material-symbols-outlined text-[16px]">{source === 'mic' ? 'mic' : 'desktop_windows'}</span>
        <span>{source === 'mic' ? t('dictate.mic') : t('dictate.system')}</span>
      </button>

      <button
        onClick={onToggleTranslate}
        title={translateEnabled ? t('dictate.disableTranslation') : t('dictate.enableTranslation')}
        className={`p-1.5 rounded-lg transition-colors ${translateEnabled ? 'text-primary bg-blue-900/30' : 'text-muted hover:bg-surface'}`}
        data-testid="translate-toggle"
      >
        <span className="material-symbols-outlined text-[16px]">translate</span>
      </button>

      {source === 'system' && (
        <button
          onClick={onToggleSubtitles}
          title={subtitlesActive ? t('dictate.hideSubtitles') : t('dictate.showSubtitles')}
          className={`p-1.5 rounded-lg transition-colors ${subtitlesActive ? 'text-primary bg-blue-900/30' : 'text-muted hover:bg-surface'}`}
          data-testid="subtitles-toggle"
        >
          <span className="material-symbols-outlined text-[16px]">subtitles</span>
        </button>
      )}
    </div>
  );
}
