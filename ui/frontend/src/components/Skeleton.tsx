'use client';

import { cn } from '@/lib/utils';

// =====================================================
// Base Skeleton Component
// =====================================================

interface SkeletonProps {
  className?: string;
  animate?: boolean;
}

export function Skeleton({ className, animate = true }: SkeletonProps) {
  return (
    <div
      className={cn(
        'bg-surface-2 rounded-lg',
        animate && 'animate-pulse',
        className
      )}
      aria-hidden="true"
    />
  );
}

// =====================================================
// Skeleton Text (for text placeholders)
// =====================================================

interface SkeletonTextProps {
  lines?: number;
  className?: string;
  lineClassName?: string;
}

export function SkeletonText({ 
  lines = 3, 
  className,
  lineClassName 
}: SkeletonTextProps) {
  return (
    <div className={cn('space-y-2', className)} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn(
            'h-4',
            // Last line is shorter for more natural look
            i === lines - 1 && 'w-3/4',
            lineClassName
          )}
        />
      ))}
    </div>
  );
}

// =====================================================
// Skeleton Card (for card placeholders)
// =====================================================

interface SkeletonCardProps {
  className?: string;
  showImage?: boolean;
  showAvatar?: boolean;
  lines?: number;
}

export function SkeletonCard({ 
  className,
  showImage = false,
  showAvatar = false,
  lines = 2
}: SkeletonCardProps) {
  return (
    <div 
      className={cn(
        'card p-4 rounded-xl space-y-4',
        className
      )}
      aria-hidden="true"
    >
      {showImage && (
        <Skeleton className="w-full h-40 rounded-lg" />
      )}
      
      <div className="flex items-start gap-3">
        {showAvatar && (
          <Skeleton className="w-10 h-10 rounded-full flex-shrink-0" />
        )}
        
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-2/3" />
          <SkeletonText lines={lines} />
        </div>
      </div>
    </div>
  );
}

// =====================================================
// Skeleton List (for list placeholders)
// =====================================================

interface SkeletonListProps {
  count?: number;
  className?: string;
  itemClassName?: string;
  variant?: 'simple' | 'card' | 'compact';
}

export function SkeletonList({ 
  count = 5, 
  className,
  itemClassName,
  variant = 'simple'
}: SkeletonListProps) {
  return (
    <div 
      className={cn('space-y-4', className)}
      role="status"
      aria-label="Loading content"
    >
      {Array.from({ length: count }).map((_, i) => (
        variant === 'card' ? (
          <SkeletonCard key={i} showAvatar className={itemClassName} />
        ) : variant === 'compact' ? (
          <div key={i} className={cn('flex items-center gap-3', itemClassName)}>
            <Skeleton className="w-8 h-8 rounded-full" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ) : (
          <div key={i} className={cn('flex items-start gap-4', itemClassName)}>
            <Skeleton className="w-12 h-12 rounded-xl flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        )
      ))}
      <span className="sr-only">Loading...</span>
    </div>
  );
}

// =====================================================
// Skeleton History Entry (matches HistoryEntryCard)
// =====================================================

export function SkeletonHistoryEntry({ className }: { className?: string }) {
  return (
    <div 
      className={cn('card p-4 rounded-xl', className)}
      aria-hidden="true"
    >
      <div className="flex items-start gap-4">
        {/* Play button placeholder */}
        <Skeleton className="w-12 h-12 rounded-full flex-shrink-0" />
        
        {/* Content */}
        <div className="flex-1 min-w-0 space-y-3">
          {/* Text preview */}
          <SkeletonText lines={2} />
          
          {/* Badges */}
          <div className="flex gap-2">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>
        </div>
        
        {/* Actions */}
        <div className="flex flex-col items-end gap-3">
          <Skeleton className="h-4 w-24" />
          <div className="flex gap-2">
            <Skeleton className="w-8 h-8 rounded-lg" />
            <Skeleton className="w-8 h-8 rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  );
}

// =====================================================
// Skeleton Voice Card (matches voice selector cards)
// =====================================================

export function SkeletonVoiceCard({ className }: { className?: string }) {
  return (
    <div 
      className={cn('card p-4 rounded-xl', className)}
      aria-hidden="true"
    >
      <div className="flex items-center gap-3">
        {/* Avatar */}
        <Skeleton className="w-12 h-12 rounded-full flex-shrink-0" />
        
        {/* Info */}
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-2/3" />
          <div className="flex gap-2">
            <Skeleton className="h-4 w-16 rounded-full" />
            <Skeleton className="h-4 w-12 rounded-full" />
          </div>
        </div>
        
        {/* Play button */}
        <Skeleton className="w-10 h-10 rounded-full flex-shrink-0" />
      </div>
    </div>
  );
}

// =====================================================
// Skeleton Stats Grid (matches history stats)
// =====================================================

export function SkeletonStatsGrid({ count = 4 }: { count?: number }) {
  return (
    <div 
      className="grid grid-cols-2 md:grid-cols-4 gap-4"
      aria-hidden="true"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card p-4 rounded-xl">
          <div className="flex items-center gap-3">
            <Skeleton className="w-10 h-10 rounded-lg" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-16" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// =====================================================
// Loading Spinner with optional text
// =====================================================

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  text?: string;
  className?: string;
}

export function LoadingSpinner({ 
  size = 'md', 
  text,
  className 
}: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'w-4 h-4 border-2',
    md: 'w-8 h-8 border-2',
    lg: 'w-12 h-12 border-3',
  };

  return (
    <div 
      className={cn('flex flex-col items-center justify-center gap-3', className)}
      role="status"
      aria-label={text || 'Loading'}
    >
      <div 
        className={cn(
          'rounded-full border-surface-3 border-t-accent-primary animate-spin',
          sizeClasses[size]
        )}
      />
      {text && (
        <p className="text-sm text-foreground-muted">{text}</p>
      )}
      <span className="sr-only">{text || 'Loading...'}</span>
    </div>
  );
}

// =====================================================
// Progress Bar (for TTS generation, etc.)
// =====================================================

interface ProgressBarProps {
  value: number; // 0-100
  max?: number;
  label?: string;
  showPercentage?: boolean;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'success' | 'warning' | 'error';
  indeterminate?: boolean;
  className?: string;
}

export function ProgressBar({
  value,
  max = 100,
  label,
  showPercentage = true,
  size = 'md',
  variant = 'default',
  indeterminate = false,
  className,
}: ProgressBarProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));
  
  const heightClasses = {
    sm: 'h-1',
    md: 'h-2',
    lg: 'h-3',
  };

  const variantClasses = {
    default: 'bg-accent-primary',
    success: 'bg-color-success',
    warning: 'bg-color-warning',
    error: 'bg-color-error',
  };

  return (
    <div className={cn('w-full', className)}>
      {(label || showPercentage) && (
        <div className="flex justify-between items-center mb-1.5">
          {label && (
            <span className="text-sm text-foreground-secondary">{label}</span>
          )}
          {showPercentage && !indeterminate && (
            <span className="text-sm font-medium text-foreground-muted">
              {Math.round(percentage)}%
            </span>
          )}
        </div>
      )}
      <div 
        className={cn(
          'w-full bg-surface-2 rounded-full overflow-hidden',
          heightClasses[size]
        )}
        role="progressbar"
        aria-valuenow={indeterminate ? undefined : percentage}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className={cn(
            'h-full rounded-full transition-all duration-300 ease-out',
            variantClasses[variant],
            indeterminate && 'animate-progress-indeterminate'
          )}
          style={indeterminate ? undefined : { width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

export default Skeleton;
