import { useCallback, useRef, useEffect } from 'react';
import { useT } from '../../lib/i18n';

type Props = {
  prompt: string;
  onPromptChange: (v: string) => void;
  onRun: () => void;
  running: boolean;
  play: boolean;
  onTogglePlay: () => void;
  intervalSec: number;
  contextSource: 'selection' | 'viewport' | 'full' | null;
  contextChars: number;
  disabled: boolean;
};

export function DebatePanelInput({
  prompt, onPromptChange, onRun, running, play, onTogglePlay,
  intervalSec, contextSource, contextChars, disabled,
}: Props) {
  const t = useT();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const contextLabel = contextSource === 'selection'
    ? t('notes.debateContextSelection').replace('{chars}', String(contextChars))
    : contextSource === 'viewport'
      ? t('notes.debateContextViewport').replace('{chars}', String(contextChars))
      : contextChars > 0
        ? t('notes.debateContextFull').replace('{chars}', String(contextChars))
        : t('notes.debateContextEmpty');

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !running && !disabled) {
      e.preventDefault();
      onRun();
    }
  }, [onRun, running, disabled]);

  // Auto-resize textarea — starts at 1 line (~36 px) and grows up to
  // 96 px. Previously it mounted already tall because of default rows;
  // the explicit reset keeps it compact until the user needs room.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const next = prompt ? Math.min(el.scrollHeight, 96) : 36;
    el.style.height = `${next}px`;
  }, [prompt]);

  return (
    <div className="shrink-0 border-t border-edge bg-base/30 p-3 space-y-2" data-testid="debate-input-bar">
      <span className="inline-flex text-[11px] text-muted/80 bg-base/40 px-2 py-0.5 rounded-full">
        {contextLabel}
      </span>
      <textarea
        ref={textareaRef}
        rows={1}
        value={prompt}
        onChange={(e) => onPromptChange(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={t('notes.debatePromptPlaceholder')}
        className="w-full resize-none bg-base/70 border border-edge rounded-lg px-3 py-2 text-[13px] text-text placeholder:text-muted/50 disabled:opacity-40"
        data-testid="debate-prompt"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onRun}
          disabled={running || disabled}
          className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 disabled:opacity-40 transition-colors"
          data-testid="debate-run"
        >
          {running ? t('editor.processing') : t('notes.debateRun')}
        </button>
        {/* "Play" is an auto-loop toggle: when ON, the debate runs
            every N seconds in the background. The label + icon now
            reflect that explicitly so users don't confuse it with
            audio playback. */}
        <button
          type="button"
          onClick={onTogglePlay}
          disabled={disabled}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs transition-colors disabled:opacity-40 ${
            play ? 'border-primary/40 text-primary bg-primary/10' : 'border-edge text-muted hover:text-text hover:bg-base/60'
          }`}
          data-testid="debate-play-toggle"
          title={play ? t('notes.debatePauseTitle') || 'Stop auto-run loop' : t('notes.debatePlayTitle') || 'Auto-run every N seconds'}
          aria-pressed={play}
        >
          <span className="material-symbols-outlined text-[15px]">{play ? 'pause_circle' : 'loop'}</span>
          <span>{play ? t('notes.debatePause') : (t('notes.debateAutoRun') || 'Auto')}</span>
        </button>
        {play && (
          <span className="text-[11px] text-muted">
            {t('notes.debateAutoInterval').replace('{seconds}', String(intervalSec))}
          </span>
        )}
      </div>
    </div>
  );
}
