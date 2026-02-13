import type { TTSProgress } from '../../lib/tts';
import { useT } from '../../lib/i18n';
import { ReaderSeek } from './ReaderSeek';
import { ReaderSectionNav } from './ReaderSectionNav';
import { ReaderTransport } from './ReaderTransport';

type Props = {
  progress: TTSProgress;
  hasText: boolean;
  ttsLanguage: string;
  onTtsLanguageChange: (lang: string) => void;
  onToggle: () => void;
  onStop: () => void;
  onReadSelection: () => void;
  onJump: (deltaSeconds: number) => void;
  onSeek: (seconds: number) => void;
  onCycleSpeed: () => void;
  onPrevSection: () => void;
  onNextSection: () => void;
  onDownload: () => void;
  canDownload: boolean;
};

const TTS_LANGS = [
  { value: 'auto', label: 'Auto' },
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Espanol' },
  { value: 'fr', label: 'Francais' },
  { value: 'de', label: 'Deutsch' },
  { value: 'pt', label: 'Portugues' },
  { value: 'it', label: 'Italiano' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
  { value: 'zh', label: '中文' },
] as const;

export function ReaderControls(props: Props) {
  const t = useT();
  const active = props.progress.status !== 'idle';
  const sectionText = active && props.progress.total > 1
    ? `${t('reader.section')} ${props.progress.current + 1} / ${props.progress.total}`
    : t('reader.playbackHint');

  return (
    <aside className="w-[360px] max-w-full bg-surface border border-edge rounded-2xl shadow-soft p-5 flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text">{t('reader.playback')}</p>
          <p className="text-xs text-muted truncate">{sectionText}</p>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-2">
          <button
            type="button"
            onClick={props.onCycleSpeed}
            className="px-2.5 py-1.5 rounded-lg bg-base border border-edge text-xs font-semibold text-text-secondary hover:border-primary/40 hover:text-primary transition-colors"
            data-testid="reader-speed-btn"
            title={t('reader.speed')}
          >
            {props.progress.rate}x
          </button>
          <select
            value={props.ttsLanguage}
            onChange={(e) => props.onTtsLanguageChange(e.target.value)}
            className="bg-base border border-edge text-text text-xs rounded-lg px-2.5 py-1.5 outline-none appearance-none hover:border-primary/40 transition-colors"
            data-testid="reader-language-select"
            title={t('settings.ttsLanguage')}
          >
            {TTS_LANGS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.value === 'auto' ? t('settings.auto') : l.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <ReaderTransport
        progress={props.progress}
        hasText={props.hasText}
        onToggle={props.onToggle}
        onStop={props.onStop}
        onJump={props.onJump}
      />

      <ReaderSeek
        progress={props.progress}
        hasText={props.hasText}
        onSeek={props.onSeek}
        onReadSelection={props.onReadSelection}
        onDownload={props.onDownload}
        canDownload={props.canDownload}
      />

      <ReaderSectionNav progress={props.progress} onPrevSection={props.onPrevSection} onNextSection={props.onNextSection} />

      {props.progress.error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400" data-testid="reader-error">
          {props.progress.error}
        </div>
      )}
    </aside>
  );
}
