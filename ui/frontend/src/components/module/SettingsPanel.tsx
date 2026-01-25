'use client';

import { useState, useEffect } from 'react';
import { ChevronDown, Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SettingsPanelProps {
  title?: string;
  children: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  persistKey?: string;
  sticky?: boolean;
  stickyTop?: string;
  className?: string;
  onToggle?: (isOpen: boolean) => void;
}

export function SettingsPanel({
  title = 'Settings',
  children,
  collapsible = false,
  defaultOpen = true,
  persistKey,
  sticky = false,
  stickyTop = 'top-24',
  className,
  onToggle,
}: SettingsPanelProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  // Load persisted state
  useEffect(() => {
    if (persistKey) {
      const stored = localStorage.getItem(persistKey);
      if (stored !== null) {
        setIsOpen(stored === 'true');
      }
    }
  }, [persistKey]);

  const handleToggle = () => {
    const newState = !isOpen;
    setIsOpen(newState);

    if (persistKey) {
      localStorage.setItem(persistKey, String(newState));
    }

    onToggle?.(newState);
  };

  // If collapsible and closed, render just the toggle button
  if (collapsible && !isOpen) {
    return (
      <button
        onClick={handleToggle}
        className={cn(
          'glass-card p-4 flex items-center justify-center gap-2 w-full',
          'text-foreground-muted hover:text-foreground transition-colors',
          className
        )}
        aria-expanded={isOpen}
        aria-controls="settings-panel-content"
      >
        <Settings2 className="w-5 h-5" />
        <span className="text-sm font-medium">Show {title}</span>
      </button>
    );
  }

  return (
    <div
      className={cn(
        'glass-card p-6 space-y-4',
        sticky && stickyTop,
        sticky && 'lg:sticky',
        className
      )}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>

        {collapsible && (
          <button
            onClick={handleToggle}
            className="p-1.5 rounded-lg text-foreground-muted hover:text-foreground hover:bg-surface-2 transition-colors"
            aria-expanded={isOpen}
            aria-controls="settings-panel-content"
            title={`Hide ${title}`}
          >
            <ChevronDown
              className={cn(
                'w-5 h-5 transition-transform',
                !isOpen && 'rotate-180'
              )}
            />
          </button>
        )}
      </div>

      <div id="settings-panel-content" className="space-y-4">
        {children}
      </div>
    </div>
  );
}

export default SettingsPanel;
