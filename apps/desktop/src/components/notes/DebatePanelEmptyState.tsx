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

  // Short empty state — no CTA button up here. The input area at the
  // bottom already owns the "Run now" action; showing a second CTA in
  // the middle of the panel created two primary buttons competing for
  // attention.
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-2" data-testid="debate-empty-state">
      <span className="material-symbols-outlined text-[32px] text-muted/40">auto_awesome</span>
      <p className="text-xs text-muted max-w-[220px] leading-relaxed">{t('notes.debateEmptyDesc')}</p>
      {/* Kept prop for API compatibility — no longer rendered. */}
      <span aria-hidden="true" className="hidden" data-unused-onrun={String(!!onRun)} />
    </div>
  );
}
