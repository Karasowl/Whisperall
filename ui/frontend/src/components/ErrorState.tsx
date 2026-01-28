'use client';

import { AlertCircle, RefreshCw, ArrowLeft, Home } from 'lucide-react';
import { cn } from '@/lib/utils';

// =====================================================
// Error State Component
// =====================================================

interface ErrorStateProps {
  title?: string;
  message?: string;
  error?: Error | string | null;
  onRetry?: () => void;
  onBack?: () => void;
  onGoHome?: () => void;
  retryLabel?: string;
  isRetrying?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  error,
  onRetry,
  onBack,
  onGoHome,
  retryLabel = 'Try again',
  isRetrying = false,
  className,
  size = 'md',
}: ErrorStateProps) {
  const errorMessage = error instanceof Error ? error.message : error;
  
  const sizeClasses = {
    sm: 'py-8',
    md: 'py-12',
    lg: 'py-16',
  };

  const iconSizes = {
    sm: 'w-10 h-10',
    md: 'w-12 h-12',
    lg: 'w-16 h-16',
  };

  return (
    <div 
      className={cn(
        'flex flex-col items-center justify-center text-center',
        sizeClasses[size],
        className
      )}
      role="alert"
      aria-live="assertive"
    >
      <div className="p-4 rounded-full bg-color-error-muted mb-4">
        <AlertCircle 
          className={cn('text-color-error', iconSizes[size])} 
          aria-hidden="true"
        />
      </div>
      
      <h3 className={cn(
        'font-semibold text-foreground',
        size === 'sm' && 'text-base',
        size === 'md' && 'text-lg',
        size === 'lg' && 'text-xl',
      )}>
        {title}
      </h3>
      
      {(message || errorMessage) && (
        <p className={cn(
          'text-foreground-secondary mt-2 max-w-md',
          size === 'sm' && 'text-sm',
          size === 'md' && 'text-base',
          size === 'lg' && 'text-base',
        )}>
          {message || errorMessage}
        </p>
      )}

      {(onRetry || onBack || onGoHome) && (
        <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
          {onRetry && (
            <button
              onClick={onRetry}
              disabled={isRetrying}
              className={cn(
                'btn btn-primary flex items-center gap-2',
                'focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2'
              )}
            >
              <RefreshCw 
                className={cn('w-4 h-4', isRetrying && 'animate-spin')} 
                aria-hidden="true"
              />
              {isRetrying ? 'Retrying...' : retryLabel}
            </button>
          )}
          
          {onBack && (
            <button
              onClick={onBack}
              className="btn btn-secondary flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              Go back
            </button>
          )}
          
          {onGoHome && (
            <button
              onClick={onGoHome}
              className="btn btn-secondary flex items-center gap-2"
            >
              <Home className="w-4 h-4" aria-hidden="true" />
              Home
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// =====================================================
// Inline Error Message
// =====================================================

interface InlineErrorProps {
  message: string;
  onRetry?: () => void;
  onDismiss?: () => void;
  className?: string;
}

export function InlineError({
  message,
  onRetry,
  onDismiss,
  className,
}: InlineErrorProps) {
  return (
    <div 
      className={cn(
        'flex items-center gap-3 p-3 rounded-xl',
        'border border-color-error/30 bg-color-error-muted',
        'animate-fade-in',
        className
      )}
      role="alert"
    >
      <AlertCircle 
        className="w-5 h-5 text-color-error flex-shrink-0" 
        aria-hidden="true"
      />
      
      <p className="flex-1 text-sm text-color-error">
        {message}
      </p>

      <div className="flex items-center gap-2">
        {onRetry && (
          <button
            onClick={onRetry}
            className="text-sm font-medium text-color-error hover:text-color-error/80 
                       transition-colors flex items-center gap-1"
          >
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
            Retry
          </button>
        )}
        
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="p-1 rounded hover:bg-color-error/20 transition-colors"
            aria-label="Dismiss error"
          >
            <span className="text-color-error" aria-hidden="true">×</span>
          </button>
        )}
      </div>
    </div>
  );
}

// =====================================================
// Empty State Component
// =====================================================

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
  };
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div 
      className={cn(
        'flex flex-col items-center justify-center text-center py-16',
        className
      )}
    >
      {icon && (
        <div className="mb-4 text-foreground-muted opacity-50">
          {icon}
        </div>
      )}
      
      <h3 className="text-lg font-medium text-foreground">
        {title}
      </h3>
      
      {description && (
        <p className="mt-2 text-sm text-foreground-muted max-w-md">
          {description}
        </p>
      )}

      {action && (
        <button
          onClick={action.onClick}
          className="mt-6 btn btn-primary flex items-center gap-2"
        >
          {action.icon}
          {action.label}
        </button>
      )}
    </div>
  );
}

export default ErrorState;
