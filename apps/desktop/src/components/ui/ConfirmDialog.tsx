import { useEffect } from 'react';

type Props = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  tone?: 'danger' | 'default';
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  tone = 'default',
  onConfirm,
  onCancel,
}: Props) {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm no-drag" onClick={onCancel} data-testid="confirm-dialog-backdrop">
      <div className="w-[460px] max-w-[calc(100vw-2rem)] rounded-2xl border border-edge bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()} data-testid="confirm-dialog">
        <div className="px-5 py-4 border-b border-edge">
          <h3 className="text-base font-semibold text-text">{title}</h3>
          <p className="text-sm text-muted mt-1 leading-relaxed">{message}</p>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3">
          <button onClick={onCancel} className="px-3 py-1.5 text-sm text-muted hover:text-text transition-colors" data-testid="confirm-dialog-cancel">{cancelLabel}</button>
          <button
            onClick={onConfirm}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              tone === 'danger'
                ? 'bg-red-500 text-white hover:bg-red-500/90'
                : 'bg-primary text-white hover:bg-primary/90'
            }`}
            data-testid="confirm-dialog-confirm"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
