'use client';

import { cn } from '@/lib/utils';

interface ToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function Toggle({
  enabled,
  onChange,
  label,
  description,
  disabled = false,
  size = 'md',
  className,
}: ToggleProps) {
  const sizes = {
    sm: { track: 'w-10 h-5', thumb: 'w-4 h-4', translate: 'translate-x-5' },
    md: { track: 'w-11 h-6', thumb: 'w-5 h-5', translate: 'translate-x-5' },
    lg: { track: 'w-14 h-7', thumb: 'w-6 h-6', translate: 'translate-x-7' },
  };

  const sizeConfig = sizes[size];

  return (
    <label
      className={cn(
        'flex items-center gap-3 cursor-pointer',
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
    >
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        disabled={disabled}
        onClick={() => !disabled && onChange(!enabled)}
        className={cn(
          'relative inline-flex flex-shrink-0 rounded-full border border-surface-3 transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2 focus:ring-offset-background',
          sizeConfig.track,
          enabled ? 'bg-accent-primary' : 'bg-surface-3'
        )}
      >
        <span
          className={cn(
            'pointer-events-none inline-block rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.35)] transform ring-0 transition duration-200 ease-in-out',
            sizeConfig.thumb,
            enabled ? sizeConfig.translate : 'translate-x-0.5',
            'mt-0.5 ml-0.5'
          )}
        />
      </button>
      {(label || description) && (
        <div className="flex flex-col">
          {label && (
            <span className="text-sm font-medium text-foreground">{label}</span>
          )}
          {description && (
            <span className="text-xs text-foreground-muted">{description}</span>
          )}
        </div>
      )}
    </label>
  );
}

export default Toggle;
