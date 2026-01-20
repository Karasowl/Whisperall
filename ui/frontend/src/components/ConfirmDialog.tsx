'use client';

import { ReactNode } from 'react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  busy = false,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <>
      <div className="modal-backdrop" onClick={onCancel} />
      <div className="modal space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-100">{title}</h3>
          {description && (
            <div className="mt-2 text-sm text-slate-400">
              {description}
            </div>
          )}
          {busy && (
            <div className="mt-4 space-y-2">
              <div className="text-xs text-slate-400">Working...</div>
              <div className="progress-bar">
                <div className="progress-bar-fill animate-pulse" style={{ width: '100%' }} />
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2">
          <button className="btn btn-secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button className="btn btn-primary" onClick={onConfirm} disabled={busy}>
            {busy ? 'Working...' : confirmLabel}
          </button>
        </div>
      </div>
    </>
  );
}
