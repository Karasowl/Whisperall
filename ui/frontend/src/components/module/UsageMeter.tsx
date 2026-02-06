'use client';

import { cn } from '@/lib/utils';

export type UsageMeterTone = 'normal' | 'warning' | 'danger';

export interface UsageMeterProps {
  label: string;
  used: number;
  limit: number;
  unit?: string;
  caption?: string;
  tone?: UsageMeterTone;
  className?: string;
}

function clampPct(pct: number) {
  if (!Number.isFinite(pct)) return 0;
  return Math.max(0, Math.min(100, pct));
}

function formatNumber(value: number, unit?: string): string {
  if (!Number.isFinite(value)) return '0';
  // Keep it simple (no i18n in v1); add separators for readability.
  if (unit === 'h') {
    const digits = value < 10 ? 1 : 0;
    return value.toLocaleString('en-US', { maximumFractionDigits: digits });
  }
  return Math.round(value).toLocaleString('en-US');
}

export function UsageMeter({
  label,
  used,
  limit,
  unit,
  caption,
  tone,
  className,
}: UsageMeterProps) {
  const safeUsed = Number.isFinite(used) ? Math.max(0, used) : 0;
  const safeLimit = Number.isFinite(limit) ? Math.max(0, limit) : 0;
  const pct = safeLimit > 0 ? clampPct((safeUsed / safeLimit) * 100) : 0;

  const resolvedTone: UsageMeterTone =
    tone ??
    (pct >= 95 ? 'danger' : pct >= 85 ? 'warning' : 'normal');

  const barClass =
    resolvedTone === 'danger'
      ? 'bg-gradient-to-r from-red-400 to-red-600'
      : resolvedTone === 'warning'
        ? 'bg-gradient-to-r from-amber-300 to-orange-500'
        : 'bg-gradient-to-r from-accent-primary to-accent-secondary';

  const badgeClass =
    resolvedTone === 'danger'
      ? 'bg-red-500/15 text-red-200 border border-red-500/20'
      : resolvedTone === 'warning'
        ? 'bg-amber-500/15 text-amber-200 border border-amber-500/20'
        : 'bg-white/5 text-foreground-muted border border-glass-border';

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{label}</p>
          {caption && (
            <p className="text-xs text-foreground-muted truncate">{caption}</p>
          )}
        </div>
        <div className={cn('shrink-0 px-2 py-1 rounded-md text-xs font-semibold', badgeClass)}>
          {formatNumber(safeUsed, unit)} / {formatNumber(safeLimit, unit)}
          {unit ? ` ${unit}` : ''}
        </div>
      </div>

      <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
        <div
          className={cn('h-full transition-all duration-300', barClass)}
          style={{ width: `${pct}%` }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}

export default UsageMeter;
