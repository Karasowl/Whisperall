'use client';

import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModuleHeaderProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  actions?: React.ReactNode;
  className?: string;
}

export function ModuleHeader({
  title,
  description,
  icon: Icon,
  actions,
  className,
}: ModuleHeaderProps) {
  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-end gap-4 flex-wrap">
        {Icon && (
          <div className="w-10 h-10 rounded-xl bg-surface-2 border border-glass-border flex items-center justify-center text-accent-primary">
            <Icon className="w-5 h-5" aria-hidden="true" />
          </div>
        )}

        <h1 className="module-title">{title}</h1>

        {actions && (
          <div className="flex items-center gap-2 ml-auto">
            {actions}
          </div>
        )}
      </div>

      {description && (
        <p className="module-description">{description}</p>
      )}
    </div>
  );
}

export default ModuleHeader;
