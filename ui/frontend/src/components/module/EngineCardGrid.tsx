'use client';

import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EngineCard, type EngineCardProps } from './EngineCard';

export interface EngineProvider {
  id: string;
  name: string;
  description?: string;
  type: 'local' | 'api';
  ready: boolean;
  requires_api_key?: boolean;
  requires_download?: boolean;
  quota_minutes?: number;
  quota_text?: string;
  models?: Array<{
    id: string;
    name: string;
    description?: string;
  }>;
  default_model?: string;
}

interface EngineCardGridProps {
  providers: EngineProvider[];
  selected: string;
  onSelect: (providerId: string) => void;
  loading?: boolean;
  emptyMessage?: string;
  columns?: 1 | 2 | 3;
  className?: string;
}

export function EngineCardGrid({
  providers,
  selected,
  onSelect,
  loading = false,
  emptyMessage = 'No providers available',
  columns = 2,
  className,
}: EngineCardGridProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-foreground-muted" aria-hidden="true" />
        <span className="ml-2 text-foreground-muted">Loading providers...</span>
      </div>
    );
  }

  if (providers.length === 0) {
    return (
      <p className="text-center text-foreground-muted py-8">{emptyMessage}</p>
    );
  }

  const gridCols = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  };

  return (
    <div className={cn('grid gap-3', gridCols[columns], className)}>
      {providers.map((provider) => (
        <EngineCard
          key={provider.id}
          id={provider.id}
          name={provider.name}
          description={provider.description}
          type={provider.type}
          ready={provider.ready}
          selected={selected === provider.id}
          onSelect={onSelect}
          quota={provider.quota_text || (provider.quota_minutes ? `${provider.quota_minutes} min/mo` : undefined)}
          requiresApiKey={provider.requires_api_key}
          requiresDownload={provider.requires_download}
        />
      ))}
    </div>
  );
}

export default EngineCardGrid;
