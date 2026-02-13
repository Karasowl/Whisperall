import { PlanGate } from '../components/PlanGate';
import { useT } from '../lib/i18n';
import { useSettingsStore } from '../stores/settings';
import { ReaderEditor } from '../components/reader/ReaderEditor';
import { ReaderControls } from '../components/reader/ReaderControls';
import { useReaderController } from './reader/useReaderController';

export function ReaderPage() {
  const t = useT();
  const uiLanguage = useSettingsStore((s) => s.uiLanguage);
  const ttsLanguage = useSettingsStore((s) => s.ttsLanguage);
  const setTtsLanguage = useSettingsStore((s) => s.setTtsLanguage);
  const c = useReaderController(uiLanguage, t, ttsLanguage);

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-base" data-testid="reader-page">
      <div className="px-8 pt-12 pb-6">
        <h2 className="text-3xl font-black tracking-tight mb-2 text-text">{t('reader.title')}</h2>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-muted">{t('reader.desc')}</p>
          <div className="text-xs text-muted bg-surface border border-edge rounded-lg px-3 py-1.5">
            <span className="font-mono">Ctrl+Shift+R</span> {t('reader.hotkeyHint')}
          </div>
        </div>
      </div>

      <PlanGate resource="tts_chars">
        <div className="flex-1 min-h-0 px-8 pb-8 flex gap-6">
          <ReaderEditor
            text={c.text}
            onChange={c.setText}
            onFromClipboard={c.onFromClipboard}
            onClear={c.onClear}
            textareaRef={c.textareaRef}
          />
          <ReaderControls
            progress={c.progress}
            hasText={c.hasText}
            onToggle={c.onToggle}
            onStop={c.onStop}
            onReadSelection={c.onReadSelection}
            onJump={c.onJump}
            onSeek={c.onSeek}
            onCycleSpeed={c.onCycleSpeed}
            onPrevSection={c.onPrevSection}
            onNextSection={c.onNextSection}
            onDownload={c.onDownload}
            canDownload={c.canDownload}
            ttsLanguage={ttsLanguage}
            onTtsLanguageChange={setTtsLanguage}
          />
        </div>
      </PlanGate>
    </div>
  );
}
