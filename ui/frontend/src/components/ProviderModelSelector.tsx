'use client';

import { useMemo } from 'react';
import { HardDrive, Cpu, Zap, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TTSProviderInfo, TTSModelVariant, MusicProviderInfo } from '@/lib/api';
import Link from 'next/link';

interface ProviderModelSelectorProps {
  providerInfo: TTSProviderInfo | MusicProviderInfo | null;
  selectedModel: string;
  onModelSelect: (modelId: string) => void;
  className?: string;
}

export function ProviderModelSelector({
  providerInfo,
  selectedModel,
  onModelSelect,
  className,
}: ProviderModelSelectorProps) {
  // Check if provider is ready (installed) - default to true if property missing
  const isProviderReady = 'is_ready' in (providerInfo || {})
    ? (providerInfo as any).is_ready !== false
    : ('ready' in (providerInfo || {}) ? (providerInfo as any).ready : true);

  // Normalize models to always be TTSModelVariant format
  const models = useMemo(() => {
    if (!providerInfo) return [];
    const rawModels = providerInfo.models || [];

    return rawModels.map((model): TTSModelVariant => {
      if (typeof model === 'string') {
        // Legacy string format - create basic variant
        return {
          id: model,
          name: model,
          size_gb: providerInfo.vram_gb || 2,
          vram_gb: providerInfo.vram_gb || 2,
        };
      }
      return model as TTSModelVariant;
    });
  }, [providerInfo]);

  if (!providerInfo || models.length <= 1) {
    return null; // Don't show if only one model
  }

  // If provider is not ready, show install prompt instead
  if (!isProviderReady) {
    return (
      <div className={cn('space-y-3', className)}>
        <label className="label flex items-center gap-2">
          <Cpu className="w-4 h-4" />
          Quality
        </label>
        <div className="card p-4 rounded-lg border-warning/30 bg-warning/10">
          <div className="flex items-center gap-3">
            <Download className="w-5 h-5 text-warning" />
            <div className="flex-1">
              <p className="text-sm text-warning-foreground">Install {providerInfo.name} first</p>
              <p className="text-xs text-warning-foreground/70">Open Settings to install</p>
            </div>
            <Link href="/models?tab=local" prefetch={false} className="btn btn-secondary text-sm">
              Install
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      <label className="label flex items-center gap-2">
        <Cpu className="w-4 h-4" />
        Quality
        <span className="text-foreground-muted font-normal text-xs">
          (bigger = better quality, slower)
        </span>
      </label>

      <div className="grid grid-cols-1 gap-2">
        {models.map((model) => {
          const isSelected = selectedModel === model.id;
          const sizeGb = model.size_gb ?? model.vram_gb ?? providerInfo?.vram_gb ?? 0;
          const vramGb = model.vram_gb ?? providerInfo?.vram_gb ?? sizeGb;

          return (
            <button
              key={model.id}
              onClick={() => onModelSelect(model.id)}
              className={cn(
                'p-4 rounded-lg text-left transition-all',
                'border flex items-center justify-between',
                isSelected
                  ? 'card-selected'
                  : 'card-interactive'
              )}
            >
              <div className="flex-1">
                <p className={cn(
                  'font-medium text-base',
                  isSelected ? 'text-accent-primary' : 'text-foreground'
                )}>
                  {model.name}
                </p>
                {model.description && (
                  <p className="text-sm text-foreground-secondary mt-0.5">
                    {model.description}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-3 text-xs text-foreground-muted">
                <span className="flex items-center gap-1">
                  <HardDrive className="w-3 h-3" />
                  {sizeGb >= 1 ? `${sizeGb}GB` : `${Math.round(sizeGb * 1000)}MB`}
                </span>
                <span className="flex items-center gap-1">
                  <Zap className="w-3 h-3" />
                  {vramGb}GB VRAM
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default ProviderModelSelector;
