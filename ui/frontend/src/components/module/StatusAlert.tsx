'use client';

import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type AlertVariant = 'error' | 'warning' | 'success' | 'info';

interface StatusAlertProps {
  variant: AlertVariant;
  message: string;
  title?: string;
  dismissible?: boolean;
  onDismiss?: () => void;
  className?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

const VARIANT_CONFIG = {
  error: {
    icon: AlertCircle,
    className: 'alert-error',
  },
  warning: {
    icon: AlertTriangle,
    className: 'alert-warning',
  },
  success: {
    icon: CheckCircle2,
    className: 'alert-success',
  },
  info: {
    icon: Info,
    className: 'alert-info',
  },
};

export function StatusAlert({
  variant,
  message,
  title,
  dismissible = false,
  onDismiss,
  className,
  action,
}: StatusAlertProps) {
  const config = VARIANT_CONFIG[variant];
  const Icon = config.icon;

  return (
    <div
      className={cn('alert', config.className, className)}
      role="alert"
      aria-live={variant === 'error' ? 'assertive' : 'polite'}
    >
      <Icon className="w-5 h-5 flex-shrink-0" aria-hidden="true" />

      <div className="flex-1 min-w-0">
        {title && (
          <p className="font-semibold">{title}</p>
        )}
        <p className={cn(title && 'text-sm opacity-90')}>{message}</p>
      </div>

      {action && (
        <button
          onClick={action.onClick}
          className="flex-shrink-0 text-sm font-medium underline underline-offset-2 hover:no-underline"
        >
          {action.label}
        </button>
      )}

      {dismissible && onDismiss && (
        <button
          onClick={onDismiss}
          className="flex-shrink-0 p-1 rounded-lg hover:bg-white/10 transition-colors"
          aria-label="Dismiss alert"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

export default StatusAlert;
