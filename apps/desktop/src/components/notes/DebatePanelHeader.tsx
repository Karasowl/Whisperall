import { useT } from '../../lib/i18n';
import type { DebateSession } from '../../lib/debate-storage';

type Props = {
  open: boolean;
  providerInfo: string;
  running: boolean;
  play: boolean;
  sessions: DebateSession[];
  activeSessionId: string;
  onToggle: () => void;
  onShowSettings: () => void;
  onNewSession: () => void;
  onSwitchSession: (id: string) => void;
};

export function DebatePanelHeader({
  open, providerInfo, running, play, sessions,
  activeSessionId, onToggle, onShowSettings, onNewSession, onSwitchSession,
}: Props) {
  const t = useT();

  return (
    <div className="h-12 shrink-0 px-2 border-b border-edge bg-base/40 flex items-center gap-1">
      <button
        type="button"
        onClick={onToggle}
        className="h-8 w-8 grid place-items-center rounded-lg text-muted hover:text-text hover:bg-base/60 transition-colors"
        data-testid="debate-toggle"
        title={open ? t('notes.debateCollapse') : t('notes.debateExpand')}
      >
        <span className="material-symbols-outlined text-[18px]">{open ? 'right_panel_close' : 'right_panel_open'}</span>
      </button>
      {open && (
        <>
          <p className="text-[13px] font-semibold text-text truncate flex-1">{t('notes.debateTitle')}</p>
          {play && <span className="w-2 h-2 rounded-full bg-primary animate-pulse" title={t('notes.debateAutoActive')} />}
          {running ? (
            <span className="material-symbols-outlined text-[16px] text-primary animate-spin">progress_activity</span>
          ) : (
            <span className="text-[11px] text-muted truncate max-w-[80px]" title={providerInfo}>{providerInfo}</span>
          )}
          <button
            type="button"
            onClick={onShowSettings}
            className="h-7 w-7 grid place-items-center rounded-lg text-muted hover:text-text hover:bg-base/60 transition-colors"
            data-testid="debate-settings-btn"
            title={t('notes.debateSettingsTitle')}
          >
            <span className="material-symbols-outlined text-[16px]">settings</span>
          </button>
          <div className="flex items-center gap-1">
            <select
              value={activeSessionId}
              onChange={(e) => onSwitchSession(e.target.value)}
              className="styled-select text-[11px] bg-transparent border-none text-muted w-5 opacity-0 absolute"
              data-testid="debate-session-select"
              title={t('notes.debateNewChat')}
            >
              {sessions.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
            <button
              type="button"
              onClick={onNewSession}
              className="h-7 w-7 grid place-items-center rounded-lg text-muted hover:text-text hover:bg-base/60 transition-colors"
              data-testid="debate-new-session"
              title={t('notes.debateNewChat')}
            >
              <span className="material-symbols-outlined text-[16px]">add_comment</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
