'use client';

import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  variant?: 'default' | 'destructive';
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
  variant = 'default',
}: ConfirmDialogProps) {
  if (!open) return null;

  const isDestructive = variant === 'destructive';

  return (
    <>
      <div className="modal-backdrop" onClick={onCancel} />
      <div className="modal space-y-4">
        <div>
          <h3 className={cn(
            "text-lg font-semibold",
            isDestructive ? "text-error" : "text-slate-100"
          )}>
            {title}
          </h3>
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
          <button
            className={cn(
              "btn",
              isDestructive ? "btn-danger" : "btn-primary"
            )}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Working...' : confirmLabel}
          </button>
        </div>
      </div>
    </>
  );
}
