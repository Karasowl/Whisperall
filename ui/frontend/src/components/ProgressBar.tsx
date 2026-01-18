'use client';

import { cn } from '@/lib/utils';
import { Loader2, CheckCircle2 } from 'lucide-react';

interface ProgressBarProps {
  progress: number;
  status: string;
  details?: string;
}

export function ProgressBar({ progress, status, details }: ProgressBarProps) {
  const isComplete = progress >= 100;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isComplete ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          ) : (
            <Loader2 className="w-5 h-5 text-amber-300 animate-spin" />
          )}
          <span className="font-medium text-foreground">{status}</span>
        </div>
        <span className={cn(
          "text-sm font-mono px-2 py-0.5 rounded",
          isComplete
            ? "bg-emerald-500/20 text-emerald-300"
            : "bg-amber-500/20 text-amber-300"
        )}>
          {Math.round(progress)}%
        </span>
      </div>

      <div className="progress-bar">
        <div
          className={cn(
            'progress-bar-fill',
            isComplete && 'bg-gradient-to-r from-emerald-400 to-emerald-600'
          )}
          style={{ width: `${progress}%` }}
        />
      </div>

      {details && (
        <p className="text-xs text-foreground-muted">{details}</p>
      )}
    </div>
  );
}
