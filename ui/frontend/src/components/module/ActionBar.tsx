'use client';

import { Loader2, LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ActionButtonProps {
  label: string;
  onClick: () => void;
  icon?: LucideIcon;
  disabled?: boolean;
}

interface ActionBarProps {
  primary: ActionButtonProps;
  secondary?: ActionButtonProps;
  loading?: boolean;
  loadingText?: string;
  pulse?: boolean;
  className?: string;
}

export function ActionBar({
  primary,
  secondary,
  loading = false,
  loadingText,
  pulse = false,
  className,
}: ActionBarProps) {
  const PrimaryIcon = primary.icon;
  const SecondaryIcon = secondary?.icon;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <button
        onClick={primary.onClick}
        disabled={primary.disabled || loading}
        className={cn(
          pulse && !loading ? 'btn-cta-pulse' : 'btn-cta',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2',
          'active:scale-[0.98] transition-transform duration-100'
        )}
        aria-busy={loading}
      >
        {loading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
            <span>{loadingText || 'Processing...'}</span>
          </>
        ) : (
          <>
            {PrimaryIcon && <PrimaryIcon className="w-5 h-5" aria-hidden="true" />}
            <span>{primary.label}</span>
          </>
        )}
      </button>

      {secondary && (
        <button
          onClick={secondary.onClick}
          disabled={secondary.disabled || loading}
          className={cn(
            'btn btn-secondary w-full justify-center',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2',
            'active:scale-[0.98] transition-transform duration-100'
          )}
        >
          {SecondaryIcon && <SecondaryIcon className="w-4 h-4" aria-hidden="true" />}
          <span>{secondary.label}</span>
        </button>
      )}
    </div>
  );
}

export default ActionBar;
