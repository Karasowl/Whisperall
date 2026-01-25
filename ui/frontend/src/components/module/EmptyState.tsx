'use client';

import { LucideIcon, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
    variant?: 'primary' | 'secondary';
  };
  className?: string;
}

export function EmptyState({
  icon: Icon = AlertTriangle,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-12 px-6 text-center',
        className
      )}
    >
      <div className="p-4 rounded-2xl bg-surface-2/50 mb-4">
        <Icon className="w-8 h-8 text-foreground-muted opacity-60" aria-hidden="true" />
      </div>

      <h3 className="text-lg font-semibold text-foreground mb-1">
        {title}
      </h3>

      {description && (
        <p className="text-foreground-secondary text-sm max-w-sm mb-4">
          {description}
        </p>
      )}

      {action && (
        <button
          onClick={action.onClick}
          className={cn(
            action.variant === 'secondary' ? 'btn btn-secondary' : 'btn btn-primary'
          )}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

export default EmptyState;
