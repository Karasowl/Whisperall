import { useEffect } from 'react';
import { useT } from '../../lib/i18n';

type Props = {
  open: boolean;
  kind: 'warn' | 'blocked';
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function AiBudgetDialog({ open, kind, message, onConfirm, onCancel }: Props) {
  const t = useT();
  const warn = kind === 'warn';

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm no-drag" onClick={onCancel} data-testid="ai-budget-dialog-backdrop">
      <div className="w-[520px] max-w-[calc(100vw-2rem)] rounded-2xl border border-edge bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()} data-testid="ai-budget-dialog">
        <div className="flex items-start gap-3 px-5 py-4 border-b border-edge">
          <span className={`material-symbols-outlined text-[22px] mt-0.5 ${warn ? 'text-amber-400' : 'text-primary'}`}>{warn ? 'warning' : 'info'}</span>
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-text">{warn ? t('ai.dialogWarnTitle') : t('ai.dialogBlockedTitle')}</h3>
            <p className="text-sm text-muted mt-1 leading-relaxed">{message}</p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3">
          {warn ? (
            <>
              <button onClick={onCancel} className="px-3 py-1.5 text-sm text-muted hover:text-text transition-colors" data-testid="ai-budget-dialog-cancel">{t('editor.cancel')}</button>
              <button onClick={onConfirm} className="px-3 py-1.5 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors" data-testid="ai-budget-dialog-confirm">{t('ai.dialogContinue')}</button>
            </>
          ) : (
            <button onClick={onConfirm} className="px-3 py-1.5 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors" data-testid="ai-budget-dialog-ok">{t('ai.dialogOk')}</button>
          )}
        </div>
      </div>
    </div>
  );
}
