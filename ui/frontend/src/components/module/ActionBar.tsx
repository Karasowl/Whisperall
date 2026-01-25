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
          pulse && !loading ? 'btn-cta-pulse' : 'btn-cta'
        )}
      >
        {loading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
            {loadingText || 'Processing...'}
          </>
        ) : (
          <>
            {PrimaryIcon && <PrimaryIcon className="w-5 h-5" aria-hidden="true" />}
            {primary.label}
          </>
        )}
      </button>

      {secondary && (
        <button
          onClick={secondary.onClick}
          disabled={secondary.disabled || loading}
          className="btn btn-secondary w-full justify-center"
        >
          {SecondaryIcon && <SecondaryIcon className="w-4 h-4" aria-hidden="true" />}
          {secondary.label}
        </button>
      )}
    </div>
  );
}

export default ActionBar;
