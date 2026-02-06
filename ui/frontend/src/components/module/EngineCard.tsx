'use client';

import { Cloud, Cpu, Key, Download, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface EngineCardProps {
  id: string;
  name: string;
  description?: string;
  type: 'local' | 'api';
  ready: boolean;
  selected: boolean;
  onSelect: (id: string) => void;
  quota?: string;
  requiresApiKey?: boolean;
  requiresDownload?: boolean;
  disabled?: boolean;
  className?: string;
}

export function EngineCard({
  id,
  name,
  description,
  type,
  ready,
  selected,
  onSelect,
  quota,
  requiresApiKey = false,
  requiresDownload = false,
  disabled = false,
  className,
}: EngineCardProps) {
  const isDisabled = disabled || !ready;

  return (
    <button
      onClick={() => !isDisabled && onSelect(id)}
      disabled={isDisabled}
      className={cn(
        'p-4 rounded-xl border-2 text-left w-full',
        'transition-all duration-150 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        selected
          ? 'border-accent-primary bg-accent-primary/10 shadow-[0_0_20px_-8px_var(--accent-primary)]'
          : 'border-glass-border hover:border-glass-border-hover hover:bg-surface-2 bg-surface-1',
        !isDisabled && !selected && 'hover:translate-y-[-1px] hover:shadow-md',
        !isDisabled && 'active:scale-[0.99]',
        isDisabled && 'opacity-50 cursor-not-allowed',
        className
      )}
      aria-pressed={selected}
      aria-disabled={isDisabled}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold flex items-center gap-2 text-foreground">
          {type === 'api' ? (
            <Cloud className="w-4 h-4 text-blue-400" aria-hidden="true" />
          ) : (
            <Cpu className="w-4 h-4 text-emerald-400" aria-hidden="true" />
          )}
          {name}
          {selected && (
            <Check className="w-4 h-4 text-accent-primary" aria-hidden="true" />
          )}
        </span>

        {quota && (
          <span className="text-xs px-2 py-1 rounded-full bg-surface-2 text-foreground-muted">
            {quota}
          </span>
        )}
      </div>

      {description && (
        <p className="text-sm text-foreground-muted line-clamp-2">{description}</p>
      )}

      {/* Status messages */}
      {!ready && requiresApiKey && (
        <p className="text-xs text-amber-400 mt-2 flex items-center gap-1">
          <Key className="w-3 h-3" aria-hidden="true" />
          API key required - configure in Settings
        </p>
      )}

      {!ready && requiresDownload && (
        <p className="text-xs text-amber-400 mt-2 flex items-center gap-1">
          <Download className="w-3 h-3" aria-hidden="true" />
          Engine not installed - install in Settings
        </p>
      )}
    </button>
  );
}

export default EngineCard;
