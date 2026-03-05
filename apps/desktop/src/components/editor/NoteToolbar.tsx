import { useState, type RefObject } from 'react';
import type { DictationStatus } from '../../stores/dictation';
import type { TTSProgress } from '../../lib/tts';
import type { CustomPrompt } from './CustomPromptDialog';
import { PlanGate } from '../PlanGate';
import { VoiceToolbar } from './VoiceToolbar';
import { useT } from '../../lib/i18n';

type ActionGroup = 'capture' | 'import' | 'read' | 'ai' | null;

export type NoteToolbarProps = {
  // capture
  status: DictationStatus;
  source: 'mic' | 'system';
  onToggleRecord: () => void;
  onToggleSource: () => void;
  translateEnabled: boolean;
  onToggleTranslate: () => void;
  subtitlesActive: boolean;
  onToggleSubtitles: () => void;
  // import
  importFileInputRef: RefObject<HTMLInputElement | null>;
  importDocLoading: boolean;
  importDocForceOcr: boolean;
  onImportDocForceOcrChange: (v: boolean) => void;
  // read
  noteReaderHasText: boolean;
  noteReadProgress: TTSProgress;
  noteReaderPlayLabel: string;
  noteCanDownloadRead: boolean;
  onToggleNoteReader: () => void;
  onStopNoteReader: () => void;
  onCycleNoteReaderSpeed: () => void;
  onDownloadNoteRead: () => void;
  // ai
  hasContent: boolean;
  processing: boolean;
  onAiEdit: (mode: string, prompt?: string) => void;
  customPrompts: CustomPrompt[];
  onShowPromptDialog: () => void;
  aiError: string;
  noteReadError?: string;
};

const BUILT_IN_MODES = [
  { id: 'casual', icon: 'chat' },
  { id: 'clean_fillers', icon: 'cleaning_services' },
  { id: 'formal', icon: 'school' },
  { id: 'summarize', icon: 'summarize' },
] as const;

const GROUP_META: { key: ActionGroup & string; icon: string; label: string }[] = [
  { key: 'capture', icon: 'mic', label: 'noteToolbar.capture' },
  { key: 'import', icon: 'upload_file', label: 'noteToolbar.import' },
  { key: 'read', icon: 'volume_up', label: 'noteToolbar.read' },
  { key: 'ai', icon: 'auto_awesome', label: 'noteToolbar.ai' },
];

export function NoteToolbar(props: NoteToolbarProps) {
  const t = useT();
  const [open, setOpen] = useState<ActionGroup>(null);
  const toggle = (g: ActionGroup & string) => setOpen(open === g ? null : g);

  return (
    <div className="flex flex-col gap-2" data-testid="note-toolbar">
      {/* Group toggle buttons */}
      <div className="flex items-center gap-1.5">
        {GROUP_META.map((g) => (
          <button key={g.key} type="button" onClick={() => toggle(g.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${open === g.key ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-surface border-edge text-muted hover:text-text hover:bg-surface-alt'}`}
            data-testid={`toolbar-group-${g.key}`}>
            <span className="material-symbols-outlined text-[16px]">{g.icon}</span>
            {t(g.label)}
          </button>
        ))}
        {props.processing && <span className="text-xs text-primary ml-2">{t('editor.processing')}</span>}
        {props.aiError && <span className="text-xs text-red-400 ml-2">{props.aiError}</span>}
        {props.noteReadError && <span className="text-xs text-red-400 ml-2">{props.noteReadError}</span>}
      </div>

      {/* Expanded panels */}
      {open === 'capture' && (
        <div className="flex items-center gap-2 px-2 py-2 rounded-xl border border-edge bg-surface/50" data-testid="toolbar-panel-capture">
          <PlanGate resource="stt_seconds">
            <VoiceToolbar status={props.status} source={props.source}
              onToggleRecord={props.onToggleRecord} onToggleSource={props.onToggleSource}
              translateEnabled={props.translateEnabled} onToggleTranslate={props.onToggleTranslate}
              subtitlesActive={props.subtitlesActive} onToggleSubtitles={props.onToggleSubtitles} />
          </PlanGate>
        </div>
      )}

      {open === 'import' && (
        <div className="flex items-center gap-2 px-2 py-2 rounded-xl border border-edge bg-surface/50" data-testid="toolbar-panel-import">
          <button type="button" onClick={() => props.importFileInputRef.current?.click()}
            disabled={props.importDocLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted bg-surface border border-edge rounded-lg hover:bg-surface-alt hover:text-text transition-colors disabled:opacity-40"
            data-testid="note-import-file-btn">
            <span className="material-symbols-outlined text-[16px]">upload_file</span>
            {props.importDocLoading ? t('history.loading') : t('notes.importDocument')}
          </button>
          <label className="inline-flex items-center gap-1.5 text-xs text-muted select-none px-2 py-1.5 rounded-lg border border-edge bg-surface">
            <input type="checkbox" checked={props.importDocForceOcr}
              onChange={(e) => props.onImportDocForceOcrChange(e.target.checked)}
              className="accent-primary" data-testid="note-import-force-ocr" />
            {t('notes.importForceOcr')}
          </label>
        </div>
      )}

      {open === 'read' && (
        <div className="flex items-center gap-2 px-2 py-2 rounded-xl border border-edge bg-surface/50" data-testid="toolbar-panel-read">
          <PlanGate resource="tts_chars">
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={props.onToggleNoteReader} disabled={!props.noteReaderHasText}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted bg-surface border border-edge rounded-lg hover:bg-surface-alt hover:text-text transition-colors disabled:opacity-40"
                data-testid="note-reader-toggle-btn">
                <span className="material-symbols-outlined text-[16px]">{props.noteReadProgress.status === 'playing' ? 'pause' : 'play_arrow'}</span>
                {props.noteReaderPlayLabel}
              </button>
              <button type="button" onClick={props.onStopNoteReader} disabled={props.noteReadProgress.status === 'idle'}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-muted bg-surface border border-edge rounded-lg hover:bg-surface-alt hover:text-text transition-colors disabled:opacity-40"
                data-testid="note-reader-stop-btn" title={t('reader.stop')}>
                <span className="material-symbols-outlined text-[16px]">stop</span>
              </button>
              <button type="button" onClick={props.onCycleNoteReaderSpeed}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-muted bg-surface border border-edge rounded-lg hover:bg-surface-alt hover:text-text transition-colors"
                data-testid="note-reader-speed-btn" title={t('reader.speed')}>
                <span className="material-symbols-outlined text-[16px]">speed</span>
                {(props.noteReadProgress.rate || 1).toFixed(2)}x
              </button>
              <button type="button" onClick={props.onDownloadNoteRead} disabled={!props.noteCanDownloadRead}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-muted bg-surface border border-edge rounded-lg hover:bg-surface-alt hover:text-text transition-colors disabled:opacity-40"
                data-testid="note-reader-download-btn" title={t('reader.download')}>
                <span className="material-symbols-outlined text-[16px]">download</span>
              </button>
            </div>
          </PlanGate>
        </div>
      )}

      {open === 'ai' && (
        <div className="flex items-center gap-1.5 flex-wrap px-2 py-2 rounded-xl border border-edge bg-surface/50" data-testid="toolbar-panel-ai">
          {BUILT_IN_MODES.map((m) => (
            <button key={m.id} onClick={() => props.onAiEdit(m.id)} disabled={props.processing || !props.hasContent}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted bg-surface border border-edge rounded-lg hover:bg-surface-alt hover:text-text transition-colors disabled:opacity-30 capitalize"
              data-testid={`ai-${m.id}`}>
              <span className="material-symbols-outlined text-[16px]">{m.icon}</span>{t(`editor.${m.id}`)}
            </button>
          ))}
          {props.customPrompts.map((p) => (
            <button key={p.id} onClick={() => props.onAiEdit('custom', p.prompt)} disabled={props.processing || !props.hasContent}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary/80 bg-primary/5 border border-primary/20 rounded-lg hover:bg-primary/10 hover:text-primary transition-colors disabled:opacity-30">
              <span className="material-symbols-outlined text-[16px]">{p.icon}</span>{p.name}
            </button>
          ))}
          <button onClick={props.onShowPromptDialog}
            className="flex items-center gap-1 px-2 py-1.5 text-xs text-muted hover:text-primary transition-colors"
            title={t('editor.customPrompts')}>
            <span className="material-symbols-outlined text-[16px]">add_circle</span>
          </button>
        </div>
      )}
    </div>
  );
}
