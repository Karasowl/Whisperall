import { useEffect, useRef } from 'react';
import { useT } from '../../lib/i18n';
import { providerLabel } from '../../lib/debate-ai';
import type { DebateMessage } from '../../lib/debate-storage';
import { DebatePanelCuratedCard } from './DebatePanelCuratedCard';
import { DebatePanelTrace } from './DebatePanelTrace';
import { MiniMarkdown } from './MiniMarkdown';

type ApplyMode = 'insert' | 'replace' | 'append';
type SuggestedTargetPosition = 'start' | 'end' | 'before_match' | 'after_match';
type SuggestedTarget = { position: SuggestedTargetPosition; match?: string };

type Props = {
  messages: DebateMessage[];
  traceMessages: DebateMessage[];
  traceParticipants: string[];
  tracePrincipalCount: number;
  traceSubagentCount: number;
  traceToolCount: number;
  running: boolean;
  providerInfo: string;
  lastSuggestion: string;
  suggestedMode: ApplyMode;
  suggestedTarget?: SuggestedTarget | null;
  hasSelection: boolean;
  noSuggestion: boolean;
  onApply: (mode: ApplyMode) => void;
  onUndo: () => void;
  onDeleteMessage: (id: string) => void;
  onClearChat: () => void;
};

function msgBorder(provider: 'openai' | 'claude' | 'internal', role: string): string {
  if (role === 'user') return 'border-l-primary/40 bg-primary/5';
  if (provider === 'openai') return 'border-l-blue-500/50 bg-blue-500/5';
  if (provider === 'claude') return 'border-l-amber-500/50 bg-amber-500/5';
  return 'border-l-edge bg-base/30';
}

function speakerName(msg: DebateMessage): string {
  if (msg.speaker === 'OpenAI Principal' || msg.speaker === 'Claude Principal') {
    return providerLabel(msg.provider as 'openai' | 'claude');
  }
  return msg.speaker;
}

function cleanDisplayText(text: string): string {
  return text
    .replace(/```(?:json)?\s*[\s\S]*?```/gi, '')
    .replace(/`json\s*[\s\S]*?`/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function DebatePanelMessages({
  messages,
  traceMessages,
  traceParticipants,
  tracePrincipalCount,
  traceSubagentCount,
  traceToolCount,
  running,
  providerInfo,
  lastSuggestion,
  suggestedMode,
  suggestedTarget,
  hasSelection,
  noSuggestion,
  onApply,
  onUndo,
  onDeleteMessage,
  onClearChat,
}: Props) {
  const t = useT();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, running]);

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-2.5" data-testid="debate-chat-list">
      {messages.length > 0 && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClearChat}
            className="text-[11px] text-muted/60 hover:text-red-400 transition-colors"
            data-testid="debate-clear-chat"
          >
            {t('notes.debateClearChat')}
          </button>
        </div>
      )}

      <DebatePanelTrace
        items={traceMessages}
        participants={traceParticipants}
        principalCount={tracePrincipalCount}
        subagentCount={traceSubagentCount}
        toolCount={traceToolCount}
      />

      {messages.map((msg) => {
        const bodyText = msg.role === 'user' ? msg.text : cleanDisplayText(msg.text);
        if (!bodyText.trim()) return null;
        return (
          <div key={msg.id} className={`group relative rounded-lg border-l-[3px] px-3 py-2.5 ${msgBorder(msg.provider, msg.role)}`}>
            <button
              type="button"
              onClick={() => onDeleteMessage(msg.id)}
              className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 h-5 w-5 flex items-center justify-center rounded text-muted/50 hover:text-red-400 hover:bg-red-400/10 transition-all"
              title={t('notes.debateDeleteMessage')}
              data-testid="debate-delete-msg"
            >
              <span className="material-symbols-outlined text-[14px]">close</span>
            </button>
            <p className="text-[11px] text-muted mb-0.5">
              {speakerName(msg)}
              {msg.model && <span className="ml-1.5 text-muted/50">· {msg.model}</span>}
            </p>
            {msg.role === 'user'
              ? <p className="text-[13px] text-text whitespace-pre-wrap leading-relaxed">{bodyText}</p>
              : <MiniMarkdown text={bodyText} />}
          </div>
        );
      })}

      {running && (
        <div className="rounded-lg border-l-[3px] border-l-edge bg-base/30 px-3 py-3 space-y-2">
          <div className="flex gap-1.5">
            <div className="h-2 w-16 rounded-full bg-muted/20 animate-pulse" />
            <div className="h-2 w-24 rounded-full bg-muted/20 animate-pulse" style={{ animationDelay: '200ms' }} />
            <div className="h-2 w-12 rounded-full bg-muted/20 animate-pulse" style={{ animationDelay: '400ms' }} />
          </div>
          <p className="text-[11px] text-muted">{t('editor.processing')}... {providerInfo}</p>
        </div>
      )}

      <DebatePanelCuratedCard
        text={lastSuggestion}
        suggestedMode={suggestedMode}
        suggestedTarget={suggestedTarget}
        hasSelection={hasSelection}
        noSuggestion={noSuggestion}
        onApply={onApply}
        onUndo={onUndo}
      />

      <div ref={endRef} />
    </div>
  );
}
