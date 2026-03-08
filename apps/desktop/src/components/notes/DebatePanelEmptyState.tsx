import { useT } from '../../lib/i18n';

type Props = {
  hasCredentials: boolean;
  claudeOAuthOnly?: boolean;
  onRun: () => void;
  onOpenSettings: () => void;
};

export function DebatePanelEmptyState({ hasCredentials, claudeOAuthOnly, onRun, onOpenSettings }: Props) {
  const t = useT();

  if (!hasCredentials) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-3">
        <span className="material-symbols-outlined text-[40px] text-muted/40">{claudeOAuthOnly ? 'link_off' : 'vpn_key_off'}</span>
        <p className="text-sm font-semibold text-text">
          {claudeOAuthOnly ? t('notes.debateOAuthOnlyTitle') : t('notes.debateNoCredentialsTitle')}
        </p>
        <p className="text-xs text-muted">
          {claudeOAuthOnly ? t('notes.debateOAuthOnlyDesc') : t('notes.debateNoCredentialsDesc')}
        </p>
        <button
          type="button"
          onClick={onOpenSettings}
          className="mt-1 px-3 py-1.5 rounded-lg border border-primary/40 text-primary text-xs font-semibold hover:bg-primary/10 transition-colors"
          data-testid="debate-open-settings"
        >
          {t('notes.debateOpenSettings')}
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-3">
      <span className="material-symbols-outlined text-[40px] text-muted/40">auto_awesome</span>
      <p className="text-sm font-semibold text-text">{t('notes.debateEmptyTitle')}</p>
      <p className="text-xs text-muted">{t('notes.debateEmptyDesc')}</p>
      <button
        type="button"
        onClick={onRun}
        className="mt-1 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors"
        data-testid="debate-first-run"
      >
        {t('notes.debateFirstRun')}
      </button>
    </div>
  );
}
