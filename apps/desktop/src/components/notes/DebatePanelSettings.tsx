import { useCallback, useEffect } from 'react';
import { useT } from '../../lib/i18n';
import {
  addSubagent, CLAUDE_MODELS, OPENAI_MODELS, removeSubagent, updateSubagent,
  type NoteDebateState,
} from '../../lib/debate-storage';

type Props = {
  debate: NoteDebateState;
  onPatch: (fn: (prev: NoteDebateState) => NoteDebateState) => void;
  onClose: () => void;
};

export function DebatePanelSettings({ debate, onPatch, onClose }: Props) {
  const t = useT();

  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [handleEscape]);

  return (
    <div className="absolute inset-0 z-10 bg-surface flex flex-col" data-testid="debate-settings-sheet">
      <div className="h-12 shrink-0 px-3 border-b border-edge bg-base/40 flex items-center">
        <p className="text-[13px] font-semibold text-text flex-1">{t('notes.debateSettingsTitle')}</p>
        <button
          type="button"
          onClick={onClose}
          className="h-7 w-7 grid place-items-center rounded-lg text-muted hover:text-text hover:bg-base/60 transition-colors"
          data-testid="debate-settings-close"
        >
          <span className="material-symbols-outlined text-[16px]">close</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Provider mode */}
        <div className="space-y-1.5">
          <p className="text-[11px] text-muted uppercase tracking-wide">{t('notes.debateProvider')}</p>
          <div className="flex rounded-lg border border-edge overflow-hidden">
            {(['openai', 'claude', 'both'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => onPatch((s) => ({ ...s, providerMode: mode }))}
                className={`flex-1 py-1.5 text-xs text-center transition-colors ${
                  debate.providerMode === mode ? 'bg-primary/15 text-primary font-semibold' : 'text-muted hover:text-text hover:bg-base/40'
                }`}
                data-testid={`debate-provider-${mode}`}
              >
                {mode === 'both' ? 'OpenAI + Claude' : mode === 'openai' ? 'OpenAI' : 'Claude'}
              </button>
            ))}
          </div>
        </div>

        {/* Models */}
        <div className="grid grid-cols-2 gap-3">
          {(debate.providerMode === 'openai' || debate.providerMode === 'both') && (
            <label className="space-y-1.5">
              <p className="text-[11px] text-muted uppercase tracking-wide">{t('notes.debateOpenaiModel')}</p>
              <select
                value={debate.openaiModel}
                onChange={(e) => onPatch((s) => ({ ...s, openaiModel: e.target.value }))}
                className="w-full styled-select bg-base/70 border border-edge rounded-lg px-2 py-1.5 text-xs text-text"
                data-testid="debate-openai-model"
              >
                {OPENAI_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
          )}
          {(debate.providerMode === 'claude' || debate.providerMode === 'both') && (
            <label className="space-y-1.5">
              <p className="text-[11px] text-muted uppercase tracking-wide">{t('notes.debateClaudeModel')}</p>
              <select
                value={debate.claudeModel}
                onChange={(e) => onPatch((s) => ({ ...s, claudeModel: e.target.value }))}
                className="w-full styled-select bg-base/70 border border-edge rounded-lg px-2 py-1.5 text-xs text-text"
                data-testid="debate-claude-model"
              >
                {CLAUDE_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
          )}
        </div>

        {/* Rounds + Interval */}
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1.5">
            <p className="text-[11px] text-muted uppercase tracking-wide">{t('notes.debateRounds')}</p>
            <input
              type="number"
              min={1}
              max={6}
              value={debate.rounds}
              onChange={(e) => onPatch((s) => ({ ...s, rounds: Math.max(1, Math.min(6, Number(e.target.value || 1))) }))}
              className="w-full bg-base/70 border border-edge rounded-lg px-3 py-1.5 text-xs text-text"
              data-testid="debate-rounds"
            />
          </label>
          <label className="space-y-1.5">
            <p className="text-[11px] text-muted uppercase tracking-wide">{t('notes.debateInterval')}</p>
            <input
              type="number"
              min={5}
              max={3600}
              value={debate.intervalSec}
              onChange={(e) => onPatch((s) => ({ ...s, intervalSec: Math.max(5, Math.min(3600, Number(e.target.value || 5))) }))}
              className="w-full bg-base/70 border border-edge rounded-lg px-3 py-1.5 text-xs text-text"
              data-testid="debate-interval"
            />
          </label>
        </div>

        <hr className="border-edge" />

        {/* Subagents / Perspectives */}
        <div className="space-y-2" data-testid="debate-subagents">
          <p className="text-[11px] text-muted uppercase tracking-wide">{t('notes.debateSubagentsTitle')}</p>
          <p className="text-[11px] text-muted/70">{t('notes.debateSubagentHint')}</p>

          {debate.subagents.map((sub) => (
            <div key={sub.id} className="rounded-lg border border-edge bg-base/45 p-2.5 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <input
                  value={sub.name}
                  onChange={(e) => onPatch((s) => updateSubagent(s, sub.id, { name: e.target.value }))}
                  className="flex-1 bg-transparent text-xs text-text border border-edge rounded-lg px-2 py-1"
                  data-testid={`debate-sub-name-${sub.id}`}
                />
                <select
                  value={sub.provider}
                  onChange={(e) => onPatch((s) => updateSubagent(s, sub.id, { provider: e.target.value as typeof sub.provider }))}
                  className="styled-select text-[11px] bg-base border border-edge rounded-lg px-1.5 py-1 text-text"
                  data-testid={`debate-sub-provider-${sub.id}`}
                >
                  <option value="auto">auto</option>
                  <option value="openai">openai</option>
                  <option value="claude">claude</option>
                </select>
                <button
                  type="button"
                  onClick={() => onPatch((s) => removeSubagent(s, sub.id))}
                  className="h-7 w-7 grid place-items-center rounded-lg border border-edge text-muted hover:text-red-300 hover:border-red-500/30 transition-colors"
                  data-testid={`debate-sub-remove-${sub.id}`}
                >
                  <span className="material-symbols-outlined text-[15px]">delete</span>
                </button>
              </div>
              <textarea
                rows={2}
                value={sub.prompt}
                onChange={(e) => onPatch((s) => updateSubagent(s, sub.id, { prompt: e.target.value }))}
                className="w-full resize-none bg-base/70 border border-edge rounded-lg px-2 py-1 text-[11px] text-text"
                data-testid={`debate-sub-prompt-${sub.id}`}
              />
              <label className="inline-flex items-center gap-1.5 text-[11px] text-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={sub.critical}
                  onChange={(e) => onPatch((s) => updateSubagent(s, sub.id, { critical: e.target.checked }))}
                />
                {t('notes.debateCritical')}
              </label>
            </div>
          ))}

          <button
            type="button"
            onClick={() => onPatch((s) => addSubagent(s))}
            className="w-full px-2 py-1.5 rounded-lg border border-dashed border-edge text-xs text-muted hover:text-text hover:bg-base/40 transition-colors"
            data-testid="debate-add-subagent"
          >
            + {t('notes.debateAddSubagent')}
          </button>
        </div>
      </div>
    </div>
  );
}
