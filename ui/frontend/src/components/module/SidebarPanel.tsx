'use client';

import { LucideIcon, Info, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SidebarPanelProps {
  title?: string;
  description?: string;
  icon?: LucideIcon;
  tips?: string[];
  metadata?: Array<{ label: string; value: React.ReactNode }>;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  warning?: string;
  sticky?: boolean;
  className?: string;
}

export function SidebarPanel({
  title,
  description,
  icon: Icon,
  tips,
  metadata,
  children,
  actions,
  warning,
  sticky = true,
  className,
}: SidebarPanelProps) {
  return (
    <div
      className={cn(
        'space-y-4',
        sticky && 'lg:sticky lg:top-24',
        className
      )}
    >
      {/* Main info card */}
      <div className="glass-card p-6 space-y-4">
        {/* Icon and title */}
        {(Icon || title) && (
          <div className="text-center">
            {Icon && (
              <Icon
                className="w-12 h-12 mx-auto text-accent-primary mb-3"
                aria-hidden="true"
              />
            )}
            {title && (
              <h3 className="text-lg font-semibold text-foreground">{title}</h3>
            )}
            {description && (
              <p className="text-sm text-foreground-muted mt-1">{description}</p>
            )}
          </div>
        )}

        {/* Actions slot */}
        {actions && <div className="space-y-2">{actions}</div>}

        {/* Metadata display */}
        {metadata && metadata.length > 0 && (
          <div className="bg-surface-1 rounded-lg p-4 space-y-2 text-sm">
            {metadata.map((item, index) => (
              <div key={index} className="flex justify-between items-center">
                <span className="text-foreground-muted">{item.label}</span>
                <span className="text-foreground font-medium truncate ml-2 max-w-[60%] text-right">
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Custom children */}
        {children}
      </div>

      {/* Tips card */}
      {tips && tips.length > 0 && (
        <div className="glass-card p-4">
          <div className="flex items-start gap-2 text-sm text-foreground-muted">
            <Info className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
            <div>
              <p className="font-medium text-foreground mb-2">Tips</p>
              <ul className="list-disc list-inside space-y-1 text-xs">
                {tips.map((tip, index) => (
                  <li key={index}>{tip}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Warning card */}
      {warning && (
        <div className="bg-warning/10 border border-warning/30 rounded-xl p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-warning mt-0.5 flex-shrink-0" />
            <p className="text-xs text-warning">{warning}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default SidebarPanel;
