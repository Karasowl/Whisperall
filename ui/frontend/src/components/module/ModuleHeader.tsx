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
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center gap-3 flex-wrap">
        {Icon && (
          <div className="p-2 rounded-xl bg-accent-primary/10">
            <Icon className="w-6 h-6 text-accent-primary" aria-hidden="true" />
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
