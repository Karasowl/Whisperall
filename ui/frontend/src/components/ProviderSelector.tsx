'use client';

import { useState, useEffect } from 'react';
import { Cpu, Zap, Globe, Mic, AlertTriangle, Check, Download, Music } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TTSProviderInfo, getTTSProviders, MusicProviderInfo } from '@/lib/api';
import Link from 'next/link';

interface ProviderSelectorProps {
  selected: string;
  onSelect: (providerId: string) => void;
  selectedLanguage?: string;
  onProviderInfoChange?: (info: TTSProviderInfo | MusicProviderInfo | null) => void;
  providers?: (TTSProviderInfo | MusicProviderInfo)[]; // Allow passing providers directly
  isLoading?: boolean; // explicit loading state
  className?: string;
}

// Provider icons and colors
const PROVIDER_STYLES: Record<string, { icon: any; color: string; gradient: string }> = {
  'chatterbox': {
    icon: Mic,
    color: 'text-emerald-400',
    gradient: 'from-emerald-400 to-teal-500',
  },
  'f5-tts': {
    icon: Zap,
    color: 'text-amber-400',
    gradient: 'from-amber-400 to-orange-500',
  },
  'orpheus': {
    icon: Cpu,
    color: 'text-purple-400',
    gradient: 'from-purple-400 to-pink-500',
  },
  'kokoro': {
    icon: Globe,
    color: 'text-blue-400',
    gradient: 'from-blue-400 to-cyan-500',
  },
  'diffrhythm': {
    icon: Music,
    color: 'text-pink-400',
    gradient: 'from-pink-400 to-rose-500',
  },
};

export function ProviderSelector({
  selected,
  onSelect,
  selectedLanguage = 'en',
  onProviderInfoChange,
  providers: explicitProviders,
  isLoading: explicitLoading,
  className,
}: ProviderSelectorProps) {
  const [internalProviders, setInternalProviders] = useState<(TTSProviderInfo | MusicProviderInfo)[]>([]);
  const [internalLoading, setInternalLoading] = useState(!explicitProviders);
  const [error, setError] = useState<string | null>(null);

  const providers = explicitProviders || internalProviders;
  const isLoading = explicitLoading !== undefined ? explicitLoading : internalLoading;

  useEffect(() => {
    if (explicitProviders) {
      setInternalLoading(false);
      return;
    }

    async function loadProviders() {
      try {
        setInternalLoading(true);
        const data = await getTTSProviders();
        setInternalProviders(data);

        // Auto-select first ready provider if current selection is not ready
        const currentProvider = data.find(p => p.id === selected);
        const isCurrentReady = currentProvider ? (currentProvider.is_ready !== false) : false;

        if (!isCurrentReady) {
          const firstReady = data.find(p => p.is_ready !== false);
          if (firstReady) {
            onSelect(firstReady.id);
          }
        }

        // Notify parent of selected provider info
        if (onProviderInfoChange) {
          const selectedInfo = data.find(p => p.id === selected);
          onProviderInfoChange(selectedInfo || null);
        }
      } catch (err) {
        setError('Failed to load providers');
        console.error(err);
      } finally {
        setInternalLoading(false);
      }
    }
    loadProviders();
  }, [explicitProviders]);

  // Update parent when selection changes
  useEffect(() => {
    if (onProviderInfoChange && providers.length > 0) {
      const selectedInfo = providers.find(p => p.id === selected);
      onProviderInfoChange(selectedInfo || null);
    }
  }, [selected, providers, onProviderInfoChange]);

  const handleSelect = (providerId: string) => {
    onSelect(providerId);
  };

  // Check if provider supports the selected language
  const supportsLanguage = (provider: TTSProviderInfo | MusicProviderInfo) => {
    // If provider doesn't have supported_languages (e.g. MusicProvider), assume true or handle differently
    if (!('supported_languages' in provider)) return true;
    const languages = provider.supported_languages || [];
    if (languages.length === 0) return true;

    const langBase = selectedLanguage.split('-')[0];
    return languages.some(l =>
      l === selectedLanguage || l.startsWith(langBase) || langBase === l.split('-')[0]
    );
  };

  if (isLoading) {
    return (
      <div className={cn('space-y-4', className)}>
        <label className="label flex items-center gap-2">
          <Cpu className="w-4 h-4" />
          Engine
        </label>
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="card p-4 rounded-xl animate-pulse h-24 bg-surface-2" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('space-y-4', className)}>
        <label className="label flex items-center gap-2">
          <Cpu className="w-4 h-4" />
          Engine
        </label>
        <div className="card p-4 rounded-xl border-error/30 bg-error/10">
          <p className="text-error text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (providers.length === 0) {
    return (
      <div className={cn('space-y-4', className)}>
        <label className="label flex items-center gap-2">
          <Cpu className="w-4 h-4" />
          Engine
        </label>
        <div className="card p-6 border-dashed flex flex-col items-center justify-center text-center gap-2">
          <AlertTriangle className="w-8 h-8 text-foreground-muted opacity-50" />
          <p className="text-foreground-secondary font-medium">No engines available</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      <label className="label flex items-center gap-2">
        <Cpu className="w-4 h-4" />
        Engine
      </label>

      <div className="grid grid-cols-2 gap-3">
        {providers.map(provider => {
          const style = PROVIDER_STYLES[provider.id] || PROVIDER_STYLES['chatterbox'];
          const Icon = style.icon;
          const isSelected = selected === provider.id;
          const langSupported = supportsLanguage(provider);

          // Safe ready check
          const isReady = 'is_ready' in provider
            ? (provider as any).is_ready !== false
            : ('ready' in provider ? (provider as any).ready : true);

          const hasCloning = 'voice_cloning' in provider && (provider as any).voice_cloning !== 'none';

          // Only show as visually selected if both selected AND ready
          const showAsSelected = isSelected && isReady;

          return (
            <button
              key={provider.id}
              onClick={() => isReady ? handleSelect(provider.id) : null}
              disabled={!isReady}
              className={cn(
                'relative p-4 rounded-xl text-left transition-all',
                showAsSelected
                  ? `bg-gradient-to-br ${style.gradient} text-white shadow-lg shadow-emerald-500/25 border border-transparent`
                  : 'card-interactive',
                !langSupported && !showAsSelected && 'opacity-80',
                !isReady && 'opacity-60 cursor-not-allowed'
              )}
            >
              {/* Corner indicator - only ONE at a time */}
              <div className="absolute top-2 right-2">
                {!isReady ? (
                  // Not installed - show download link
                  <Link
                    href="/models?tab=local"
                    prefetch={false}
                    className="text-warning hover:text-warning-foreground"
                    title="Install required - click to go to Models page"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Download className="w-4 h-4" />
                  </Link>
                ) : showAsSelected ? (
                  // Installed and selected - show checkmark
                  <Check className="w-4 h-4" />
                ) : null}
              </div>

              {/* Provider info */}
              <div className="flex items-start gap-3">
                <div className={cn(
                  'p-2 rounded-lg',
                  showAsSelected ? 'bg-white/20' : 'bg-accent-primary/5'
                )}>
                  <Icon className={cn('w-5 h-5', showAsSelected ? 'text-white' : style.color)} />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className={cn(
                    'font-semibold truncate',
                    showAsSelected ? 'text-white' : 'text-foreground'
                  )}>
                    {provider.name}
                  </h4>
                  <p className={cn(
                    'text-xs mt-0.5 line-clamp-2',
                    showAsSelected ? 'text-white/80' : 'text-foreground-secondary'
                  )}>
                    {provider.description?.split('.')[0] || ''}
                  </p>
                </div>
              </div>

              {/* Tags */}
              <div className="flex flex-wrap gap-1 mt-3">
                {!isReady && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-warning/20 text-warning flex items-center gap-0.5">
                    <Download className="w-2.5 h-2.5" />
                    Install Required
                  </span>
                )}
                {hasCloning && (
                  <span className={cn(
                    'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
                    showAsSelected ? 'bg-white/20 text-white' : 'bg-emerald-500/10 text-emerald-500'
                  )}>
                    Voice Clone
                  </span>
                )}
                {!hasCloning && (
                  <span className={cn(
                    'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
                    showAsSelected ? 'bg-white/20 text-white' : 'bg-blue-500/10 text-blue-500'
                  )}>
                    Preset Voices
                  </span>
                )}
                <span className={cn(
                  'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
                  showAsSelected ? 'bg-white/20 text-white' : 'bg-accent-primary/5 text-foreground-muted'
                )}>
                  {provider.vram_gb}GB VRAM
                </span>
                {!langSupported && (
                  <span className={cn(
                    'text-[10px] px-1.5 py-0.5 rounded-full flex items-center gap-0.5',
                    showAsSelected ? 'bg-white/20 text-white' : 'bg-warning/20 text-warning'
                  )}>
                    <AlertTriangle className="w-2.5 h-2.5" />
                    No {selectedLanguage}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Engines list only; avoid technical install steps in UI */}
    </div>
  );
}

export default ProviderSelector;
