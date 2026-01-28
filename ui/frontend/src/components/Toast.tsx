'use client';

import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

// =====================================================
// Toast Types & Context
// =====================================================

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastContextValue {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => string;
  removeToast: (id: string) => void;
  clearAll: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

// =====================================================
// Toast Provider
// =====================================================

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const newToast: Toast = { ...toast, id };
    
    setToasts((prev) => [...prev, newToast]);

    // Auto-remove after duration (default 5s, errors 8s)
    const duration = toast.duration ?? (toast.type === 'error' ? 8000 : 5000);
    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }

    return id;
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setToasts([]);
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast, clearAll }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
}

// =====================================================
// useToast Hook
// =====================================================

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  
  const { addToast, removeToast, clearAll } = context;

  return {
    toast: addToast,
    success: (title: string, message?: string) => 
      addToast({ type: 'success', title, message }),
    error: (title: string, message?: string, action?: Toast['action']) => 
      addToast({ type: 'error', title, message, action }),
    warning: (title: string, message?: string) => 
      addToast({ type: 'warning', title, message }),
    info: (title: string, message?: string) => 
      addToast({ type: 'info', title, message }),
    dismiss: removeToast,
    clearAll,
  };
}

// =====================================================
// Toast Container
// =====================================================

function ToastContainer({ 
  toasts, 
  onRemove 
}: { 
  toasts: Toast[]; 
  onRemove: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div 
      className="fixed bottom-4 right-4 z-[var(--z-toast)] flex flex-col gap-2 max-w-md w-full pointer-events-none"
      role="region"
      aria-label="Notifications"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>
  );
}

// =====================================================
// Toast Item
// =====================================================

const icons: Record<ToastType, typeof CheckCircle> = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const styles: Record<ToastType, string> = {
  success: 'border-color-success/30 bg-color-success-muted',
  error: 'border-color-error/30 bg-color-error-muted',
  warning: 'border-color-warning/30 bg-color-warning-muted',
  info: 'border-color-info/30 bg-color-info-muted',
};

const iconStyles: Record<ToastType, string> = {
  success: 'text-color-success',
  error: 'text-color-error',
  warning: 'text-color-warning',
  info: 'text-color-info',
};

function ToastItem({ 
  toast, 
  onRemove 
}: { 
  toast: Toast; 
  onRemove: (id: string) => void;
}) {
  const [isExiting, setIsExiting] = useState(false);
  const Icon = icons[toast.type];

  const handleRemove = () => {
    setIsExiting(true);
    setTimeout(() => onRemove(toast.id), 150);
  };

  return (
    <div
      className={cn(
        'pointer-events-auto',
        'p-4 rounded-xl border backdrop-blur-md',
        'shadow-lg',
        'flex items-start gap-3',
        'transform transition-all duration-200 ease-out',
        isExiting 
          ? 'opacity-0 translate-x-4 scale-95' 
          : 'opacity-100 translate-x-0 scale-100 animate-slide-in-right',
        styles[toast.type]
      )}
      role="alert"
      aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
    >
      <Icon 
        className={cn('w-5 h-5 flex-shrink-0 mt-0.5', iconStyles[toast.type])} 
        aria-hidden="true"
      />
      
      <div className="flex-1 min-w-0">
        <p className="font-medium text-foreground text-sm">
          {toast.title}
        </p>
        {toast.message && (
          <p className="mt-1 text-sm text-foreground-secondary line-clamp-2">
            {toast.message}
          </p>
        )}
        {toast.action && (
          <button
            onClick={() => {
              toast.action?.onClick();
              handleRemove();
            }}
            className="mt-2 text-sm font-medium text-accent-primary hover:text-accent-primary/80 
                       transition-colors focus:outline-none focus-visible:ring-2 
                       focus-visible:ring-accent-primary focus-visible:ring-offset-2 rounded"
          >
            {toast.action.label}
          </button>
        )}
      </div>

      <button
        onClick={handleRemove}
        className="flex-shrink-0 p-1 rounded-lg text-foreground-muted 
                   hover:text-foreground hover:bg-glass-highlight
                   transition-colors duration-150
                   focus:outline-none focus-visible:ring-2 
                   focus-visible:ring-accent-primary"
        aria-label="Dismiss notification"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

// =====================================================
// Standalone toast function (for use outside React)
// =====================================================

let toastFn: ToastContextValue['addToast'] | null = null;

export function setToastFunction(fn: ToastContextValue['addToast']) {
  toastFn = fn;
}

export function showToast(toast: Omit<Toast, 'id'>) {
  if (toastFn) {
    return toastFn(toast);
  }
  console.warn('Toast provider not initialized');
  return '';
}

export default ToastProvider;
