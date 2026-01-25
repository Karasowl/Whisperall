'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronDown,
  Cpu,
  Cloud,
  Check,
  Download,
  Key,
  Mic,
  Zap,
  Globe,
  AlertTriangle,
  Search,
} from 'lucide-react';
import {
  ServiceType,
  ServiceProviderInfo,
  ServiceProviderModelVariant,
  getServiceProviders,
  getTTSProviders,
  TTSProviderInfo,
  ensureProviderReady,
  // New service providers
  getMusicProviders,
  MusicProviderInfo,
  getSFXProviders,
  SFXProviderInfo,
  getVoiceChangerProviders,
  VoiceChangerProvider,
  getVoiceIsolatorProviders,
  VoiceIsolatorProvider,
  getDubbingProviders,
  DubbingProvider,
} from '@/lib/api';
import { SelectMenu } from './SelectMenu';
import { useDropdownPosition } from '@/lib/useDropdownPosition';
import { cn } from '@/lib/utils';
import Link from 'next/link';

// Unified type for all provider info types
type AnyProviderInfo =
  | ServiceProviderInfo
  | TTSProviderInfo
  | MusicProviderInfo
  | SFXProviderInfo
  | VoiceChangerProvider
  | VoiceIsolatorProvider
  | DubbingProvider;

interface UnifiedProviderSelectorProps {
  service: ServiceType;
  selected: string;
  onSelect: (providerId: string) => void;

  // Optional
  selectedModel?: string;
  onModelChange?: (modelId: string) => void;
  onProviderInfoChange?: (info: AnyProviderInfo | null) => void;

  // Display options
  variant?: 'dropdown' | 'cards';
  showModelSelector?: boolean;
  filterLanguage?: string;
  allowedTypes?: Array<'local' | 'api'>;
  disabled?: boolean;
  label?: string;
  className?: string;
  autoEnsureReady?: boolean;
}

// Provider icons and colors for TTS
const PROVIDER_STYLES: Record<string, { icon: typeof Cpu; color: string; gradient: string }> = {
  'chatterbox': { icon: Mic, color: 'text-emerald-400', gradient: 'from-emerald-400 to-teal-500' },
  'f5-tts': { icon: Zap, color: 'text-amber-400', gradient: 'from-amber-400 to-orange-500' },
  'orpheus': { icon: Cpu, color: 'text-purple-400', gradient: 'from-purple-400 to-pink-500' },
  'kokoro': { icon: Globe, color: 'text-blue-400', gradient: 'from-blue-400 to-cyan-500' },
  'fish-speech': { icon: Mic, color: 'text-cyan-400', gradient: 'from-cyan-400 to-blue-500' },
  'openvoice': { icon: Mic, color: 'text-indigo-400', gradient: 'from-indigo-400 to-purple-500' },
  'zonos': { icon: Zap, color: 'text-rose-400', gradient: 'from-rose-400 to-pink-500' },
  'vibevoice': { icon: Mic, color: 'text-violet-400', gradient: 'from-violet-400 to-purple-500' },
  'voxcpm': { icon: Cpu, color: 'text-orange-400', gradient: 'from-orange-400 to-red-500' },
  'dia': { icon: Mic, color: 'text-sky-400', gradient: 'from-sky-400 to-blue-500' },
  // API providers
  'openai-tts': { icon: Cloud, color: 'text-green-400', gradient: 'from-green-400 to-emerald-500' },
  'elevenlabs': { icon: Cloud, color: 'text-blue-400', gradient: 'from-blue-400 to-indigo-500' },
  'fishaudio': { icon: Cloud, color: 'text-cyan-400', gradient: 'from-cyan-400 to-blue-500' },
  'cartesia': { icon: Cloud, color: 'text-purple-400', gradient: 'from-purple-400 to-pink-500' },
  'playht': { icon: Cloud, color: 'text-pink-400', gradient: 'from-pink-400 to-rose-500' },
  'siliconflow': { icon: Cloud, color: 'text-amber-400', gradient: 'from-amber-400 to-orange-500' },
  'minimax': { icon: Cloud, color: 'text-red-400', gradient: 'from-red-400 to-rose-500' },
  'zyphra': { icon: Cloud, color: 'text-violet-400', gradient: 'from-violet-400 to-purple-500' },
  'narilabs': { icon: Cloud, color: 'text-sky-400', gradient: 'from-sky-400 to-cyan-500' },
};

const SERVICE_LABELS: Record<ServiceType, string> = {
  tts: 'Voice Engine',
  stt: 'Transcription Engine',
  ai_edit: 'AI Model',
  translation: 'Translation Engine',
  music: 'Music Engine',
  sfx: 'SFX Engine',
  voice_changer: 'Voice Changer',
  voice_isolator: 'Voice Isolator',
  dubbing: 'Dubbing Engine',
};

const COMING_SOON_MUSIC_PROVIDERS: AnyProviderInfo[] = [
  {
    id: 'musicgen',
    name: 'MusicGen',
    description: 'Meta\'s high quality music generation model',
    service: 'music',
    type: 'local',
    supported_languages: [],
    models: [{ id: 'medium', name: 'Medium', size_gb: 4, vram_gb: 8 }],
    is_available: false,
    is_installed: false,
    readiness: { ready: false, installed: false, missing_packages: [], missing_api_key: false, missing_model: true, missing_service: true },
  } as any,
  {
    id: 'suno',
    name: 'Suno AI',
    description: 'Current state of the art song generation via API',
    service: 'music',
    type: 'api',
    supported_languages: [],
    models: [{ id: 'v3', name: 'V3' }],
    is_available: false,
    is_installed: false,
    readiness: { ready: false, installed: false, missing_packages: [], missing_api_key: true, missing_model: false, missing_service: true },
  } as any
];

export function UnifiedProviderSelector({
  service,
  selected,
  onSelect,
  selectedModel,
  onModelChange,
  onProviderInfoChange,
  variant = 'dropdown',
  showModelSelector = true,
  filterLanguage,
  allowedTypes,
  disabled = false,
  label,
  className,
  autoEnsureReady = true,
}: UnifiedProviderSelectorProps) {
  const [providers, setProviders] = useState<AnyProviderInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshTick, setRefreshTick] = useState(0);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const lastEnsureRef = useRef<string | null>(null);
  const dropdownStyle = useDropdownPosition(isOpen, buttonRef);
  const allowedTypesKey = useMemo(
    () => (allowedTypes ? [...allowedTypes].sort().join('|') : ''),
    [allowedTypes]
  );

  // Reset search when dropdown closes
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
    } else {
      // Focus search input when dropdown opens
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    async function loadProviders() {
      setLoading(true);
      try {
        let data: (ServiceProviderInfo | TTSProviderInfo | MusicProviderInfo | SFXProviderInfo | VoiceChangerProvider | VoiceIsolatorProvider | DubbingProvider)[];

        // Load providers based on service type
        switch (service) {
          case 'tts':
            data = await getTTSProviders();
            break;
          case 'music':
            data = await getMusicProviders();
            break;
          case 'sfx':
            data = await getSFXProviders();
            break;
          case 'voice_changer':
            data = await getVoiceChangerProviders();
            break;
          case 'voice_isolator':
            data = await getVoiceIsolatorProviders();
            break;
          case 'dubbing':
            data = await getDubbingProviders();
            break;
          default:
            data = await getServiceProviders(service as 'stt' | 'ai_edit' | 'translation');
        }

        // Filter by language if specified (only for providers that support languages)
        if (filterLanguage) {
          const langBase = filterLanguage.split('-')[0];
          data = data.filter(p => {
            const langs = 'supported_languages' in p ? (p as any).supported_languages : null;
            if (!langs) return true; // Don't filter out providers without language info
            return langs.some((l: string) =>
              l === filterLanguage || l.startsWith(langBase) || langBase === l.split('-')[0]
            );
          });
        }

        if (allowedTypes && allowedTypes.length > 0) {
          data = data.filter(p => allowedTypes.includes(getProviderType(p)));
        }

        // Inject coming soon providers for music if not already present
        if (service === 'music') {
          const existingIds = new Set(data.map(p => p.id));
          COMING_SOON_MUSIC_PROVIDERS.forEach(p => {
            if (!existingIds.has(p.id)) {
              // Mark as not implemented for visual badge
              (p as any).is_implemented = false;
              data.push(p);
            }
          });
        }

        setProviders(data);

        // Auto-select first available if none selected or selection not in list
        if (data.length > 0) {
          const currentProvider = data.find(p => p.id === selected);
          if (!currentProvider) {
            const firstAvailable = data.find(p => isProviderReady(p)) || data[0];
            onSelect(firstAvailable.id);
          }
        }
      } catch (err) {
        console.error(`Failed to load ${service} providers:`, err);
      } finally {
        setLoading(false);
      }
    }
    loadProviders();
  }, [service, filterLanguage, allowedTypesKey, refreshTick]);

  // Notify parent of provider info changes
  useEffect(() => {
    const info = providers.find(p => p.id === selected) || null;
    onProviderInfoChange?.(info);

    // Set default model if not set
    if (info && showModelSelector && onModelChange) {
      const models = getProviderModels(info);
      const defaultModel = getDefaultModel(info);
      if (models.length > 0 && (!selectedModel || !models.find(m => m.id === selectedModel))) {
        onModelChange(defaultModel || models[0].id);
      }
    }
  }, [selected, providers]);

  const selectedProvider = providers.find(p => p.id === selected);

  // Filter providers by search query
  const filteredProviders = useMemo(() => {
    if (!searchQuery.trim()) return providers;
    const query = searchQuery.toLowerCase();
    return providers.filter(p =>
      p.name.toLowerCase().includes(query) ||
      p.id.toLowerCase().includes(query) ||
      p.description?.toLowerCase().includes(query)
    );
  }, [providers, searchQuery]);

  const localProviders = filteredProviders.filter(p => getProviderType(p) === 'local');
  const apiProviders = filteredProviders.filter(p => getProviderType(p) === 'api');

  // Helpers
  function getProviderType(provider: AnyProviderInfo): 'local' | 'api' {
    if ('type' in provider) return provider.type as 'local' | 'api';
    // For TTSProviderInfo, check if it's an API provider
    const apiProviderIds = [
      'openai-tts', 'elevenlabs', 'fishaudio', 'cartesia', 'playht',
      'siliconflow', 'minimax', 'zyphra', 'narilabs'
    ];
    return apiProviderIds.includes(provider.id) ? 'api' : 'local';
  }

  function isProviderImplemented(provider: AnyProviderInfo): boolean {
    if ('is_implemented' in provider) return (provider as any).is_implemented !== false;
    return true;
  }

  function isProviderReady(provider: AnyProviderInfo): boolean {
    // Not implemented = not ready
    if (!isProviderImplemented(provider)) return false;
    if ('readiness' in provider && (provider as any).readiness) {
      return (provider as any).readiness.ready;
    }
    if ('is_available' in provider) return (provider as any).is_available;
    if ('is_ready' in provider) return (provider as any).is_ready !== false;
    if ('ready' in provider) return (provider as any).ready;
    return true;
  }

  function getProviderModels(provider: AnyProviderInfo): ServiceProviderModelVariant[] {
    if (!('models' in provider) || !provider.models) return [];
    return (provider.models as any[]).map(m => {
      if (typeof m === 'string') {
        return { id: m, name: m };
      }
      return m as ServiceProviderModelVariant;
    });
  }

  function getDefaultModel(provider: AnyProviderInfo): string {
    if ('default_model' in provider && provider.default_model) return provider.default_model as string;
    const models = getProviderModels(provider);
    return models.length > 0 ? models[0].id : '';
  }

  function getVramGb(provider: AnyProviderInfo): number {
    if ('vram_gb' in provider) return (provider as any).vram_gb;
    if ('vram_requirement_gb' in provider) return (provider as any).vram_requirement_gb;
    return 0;
  }

  function getStatusBadge(provider: AnyProviderInfo) {
    const implemented = isProviderImplemented(provider);
    const ready = isProviderReady(provider);
    const type = getProviderType(provider);

    // Not implemented - show coming soon
    if (!implemented) {
      return (
        <span
          className="text-slate-500"
          title="Coming soon"
        >
          <AlertTriangle className="w-4 h-4" />
        </span>
      );
    }

    if (ready) {
      return <Check className="w-4 h-4 text-emerald-400" />;
    }

    if (type === 'api') {
      return (
        <Link
          href="/settings?tab=api-keys"
          className="text-amber-400 hover:text-amber-300"
          onClick={(e) => e.stopPropagation()}
          title="Configure API key"
        >
          <Key className="w-4 h-4" />
        </Link>
      );
    }

    return (
      <Link
        href="/models?tab=local"
        className="text-amber-400 hover:text-amber-300"
        onClick={(e) => e.stopPropagation()}
        title="Install model"
      >
        <Download className="w-4 h-4" />
      </Link>
    );
  }

  // Auto-install/ensure provider readiness when selection/model changes
  useEffect(() => {
    if (!autoEnsureReady) return;
    const info = providers.find(p => p.id === selected);
    if (!info) return;

    const modelId = showModelSelector ? selectedModel : undefined;
    const key = `${info.id}:${modelId || ''}`;
    if (lastEnsureRef.current === key) return;
    lastEnsureRef.current = key;

    ensureProviderReady(service, info.id, modelId).then((res) => {
      if (res?.install_started) {
        setTimeout(() => setRefreshTick((tick) => tick + 1), 3000);
      }
    }).catch(() => { });
  }, [autoEnsureReady, providers, selected, selectedModel, service, showModelSelector]);

  // Poll provider list while selected provider is not ready
  useEffect(() => {
    const info = providers.find(p => p.id === selected);
    if (!info || isProviderReady(info)) return;
    const interval = setInterval(() => {
      setRefreshTick((tick) => tick + 1);
    }, 5000);
    return () => clearInterval(interval);
  }, [providers, selected]);

  // Card variant
  if (variant === 'cards') {
    return (
      <div className={cn('space-y-4', className)}>
        <label className="label flex items-center gap-2">
          <Cpu className="w-4 h-4" />
          {label || SERVICE_LABELS[service]}
        </label>

        {loading ? (
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="card p-4 rounded-xl animate-pulse h-24 bg-surface-2" />
            ))}
          </div>
        ) : (
          <>
            {/* Local providers */}
            {localProviders.length > 0 && (
              <div className="space-y-2">
                {apiProviders.length > 0 && (
                  <div className="text-xs font-semibold text-slate-400 uppercase">Local Models</div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  {localProviders.map(provider => (
                    <ProviderCard
                      key={provider.id}
                      provider={provider}
                      isSelected={selected === provider.id}
                      isReady={isProviderReady(provider)}
                      isImplemented={isProviderImplemented(provider)}
                      vramGb={getVramGb(provider)}
                      onSelect={() => onSelect(provider.id)}
                      statusBadge={getStatusBadge(provider)}
                      type="local"
                      service={service}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* API providers */}
            {apiProviders.length > 0 && (
              <div className="space-y-2">
                {localProviders.length > 0 && (
                  <div className="text-xs font-semibold text-slate-400 uppercase mt-4">Cloud APIs</div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  {apiProviders.map(provider => (
                    <ProviderCard
                      key={provider.id}
                      provider={provider}
                      isSelected={selected === provider.id}
                      isReady={isProviderReady(provider)}
                      isImplemented={isProviderImplemented(provider)}
                      vramGb={0}
                      onSelect={() => onSelect(provider.id)}
                      statusBadge={getStatusBadge(provider)}
                      type="api"
                      service={service}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Model selector */}
        {showModelSelector && selectedProvider && getProviderModels(selectedProvider).length > 1 && (
          <SelectMenu
            label="Model"
            value={selectedModel || getDefaultModel(selectedProvider)}
            options={getProviderModels(selectedProvider).map(m => ({
              value: m.id,
              label: m.name,
              description: m.description,
            }))}
            onChange={(v) => onModelChange?.(v)}
          />
        )}
      </div>
    );
  }

  // Dropdown variant
  const dropdown = isOpen ? (
    <>
      <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
      <div
        className="z-50 card shadow-xl flex flex-col"
        style={{ ...dropdownStyle, maxHeight: '400px' }}
      >
        {/* Search input */}
        <div className="p-3 border-b border-border sticky top-0 bg-surface-1 z-10">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search providers..."
              className="w-full pl-9 pr-3 py-2 bg-surface-2 rounded-lg text-sm text-foreground placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-accent-primary"
            />
          </div>
        </div>

        {/* Scrollable provider list */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {/* No results */}
          {localProviders.length === 0 && apiProviders.length === 0 && (
            <div className="px-4 py-8 text-center text-slate-400">
              No providers found for &quot;{searchQuery}&quot;
            </div>
          )}

          {/* Local providers */}
          {localProviders.length > 0 && (
            <>
              <div className="px-4 py-2 text-xs font-semibold text-slate-400 uppercase bg-surface-1 sticky top-0">
                Local Models ({localProviders.length})
              </div>
              {localProviders.map(provider => (
                <ProviderRow
                  key={provider.id}
                  provider={provider}
                  isSelected={selected === provider.id}
                  isReady={isProviderReady(provider)}
                  isImplemented={isProviderImplemented(provider)}
                  onSelect={() => {
                    onSelect(provider.id);
                    setIsOpen(false);
                  }}
                  statusBadge={getStatusBadge(provider)}
                  type="local"
                  service={service}
                />
              ))}
            </>
          )}

          {/* API providers */}
          {apiProviders.length > 0 && (
            <>
              <div className="px-4 py-2 text-xs font-semibold text-slate-400 uppercase bg-surface-1 sticky top-0">
                Cloud APIs ({apiProviders.length})
              </div>
              {apiProviders.map(provider => (
                <ProviderRow
                  key={provider.id}
                  provider={provider}
                  isSelected={selected === provider.id}
                  isReady={isProviderReady(provider)}
                  isImplemented={isProviderImplemented(provider)}
                  onSelect={() => {
                    onSelect(provider.id);
                    setIsOpen(false);
                  }}
                  statusBadge={getStatusBadge(provider)}
                  type="api"
                  service={service}
                />
              ))}
            </>
          )}
        </div>
      </div>
    </>
  ) : null;

  return (
    <div className={cn('space-y-4', className)}>
      <div className="space-y-2">
        <label className="label">{label || SERVICE_LABELS[service]}</label>
        <button
          ref={buttonRef}
          type="button"
          onClick={() => !disabled && setIsOpen(!isOpen)}
          disabled={disabled || loading}
          className="w-full card-interactive p-4 flex items-center justify-between"
        >
          {loading ? (
            <span className="text-slate-400">Loading providers...</span>
          ) : selectedProvider ? (
            <div className="flex items-center gap-3">
              {getProviderType(selectedProvider) === 'local' ? (
                <Cpu className="w-5 h-5 text-emerald-400" />
              ) : (
                <Cloud className="w-5 h-5 text-blue-400" />
              )}
              <div>
                <div className="font-medium">{selectedProvider.name}</div>
                <div className="text-sm text-slate-400">
                  {getProviderType(selectedProvider) === 'local' ? 'Local' : 'API'}
                  {!isProviderReady(selectedProvider) && (
                    <span className="text-amber-400 ml-2">
                      {getProviderType(selectedProvider) === 'api'
                        ? '(configure key)'
                        : '(install model)'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <span className="text-slate-400">Select provider</span>
          )}
          <ChevronDown className={cn('w-5 h-5 transition-transform', isOpen && 'rotate-180')} />
        </button>

        {typeof document !== 'undefined' && createPortal(dropdown, document.body)}
      </div>

      {/* Model selector */}
      {showModelSelector && selectedProvider && getProviderModels(selectedProvider).length > 1 && (
        <SelectMenu
          label="Model"
          value={selectedModel || getDefaultModel(selectedProvider)}
          options={getProviderModels(selectedProvider).map(m => ({
            value: m.id,
            label: m.name,
            description: m.description,
          }))}
          onChange={(v) => onModelChange?.(v)}
        />
      )}
    </div>
  );
}

// Provider Card component
function ProviderCard({
  provider,
  isSelected,
  isReady,
  isImplemented,
  vramGb,
  onSelect,
  statusBadge,
  type,
  service,
}: {
  provider: AnyProviderInfo;
  isSelected: boolean;
  isReady: boolean;
  isImplemented: boolean;
  vramGb: number;
  onSelect: () => void;
  statusBadge: React.ReactNode;
  type: 'local' | 'api';
  service: ServiceType;
}) {
  const style = PROVIDER_STYLES[provider.id] || (type === 'api'
    ? { icon: Cloud, color: 'text-blue-400', gradient: 'from-blue-400 to-indigo-500' }
    : { icon: Cpu, color: 'text-emerald-400', gradient: 'from-emerald-400 to-teal-500' });
  const Icon = style.icon;
  const showAsSelected = isSelected && isReady;
  const isDisabled = !isImplemented || (!isReady && type === 'local');

  // Get voice cloning info
  const hasCloning = 'voice_cloning' in provider && provider.voice_cloning !== 'none';

  return (
    <button
      onClick={onSelect}
      disabled={isDisabled}
      className={cn(
        'relative p-4 rounded-xl text-left transition-all',
        showAsSelected
          ? `bg-gradient-to-br ${style.gradient} text-white shadow-lg shadow-emerald-500/25 border border-transparent`
          : 'card-interactive',
        isDisabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      {/* Corner indicator */}
      <div className="absolute top-2 right-2">
        {statusBadge}
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
            {provider.description?.split('.')[0]}
          </p>
        </div>
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-1 mt-3">
        {!isImplemented ? (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-500/20 text-slate-400 flex items-center gap-0.5">
            <AlertTriangle className="w-2.5 h-2.5" />
            Coming Soon
          </span>
        ) : (
          <>
            {isImplemented && !isReady && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-warning/20 text-warning flex items-center gap-0.5">
                {type === 'api' ? (
                  <>
                    <Key className="w-2.5 h-2.5" />
                    Configure Key
                  </>
                ) : (
                  <>
                    <Download className="w-2.5 h-2.5" />
                    Install Required
                  </>
                )}
              </span>
            )}
            {type === 'api' && (
              <span className={cn(
                'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
                showAsSelected ? 'bg-white/20 text-white' : 'bg-blue-500/10 text-blue-500'
              )}>
                Cloud API
              </span>
            )}
            {/* TTS SPECIFIC TAGS */}
            {service === 'tts' && hasCloning && (
              <span className={cn(
                'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
                showAsSelected ? 'bg-white/20 text-white' : 'bg-emerald-500/10 text-emerald-500'
              )}>
                Voice Clone
              </span>
            )}
            {service === 'tts' && !hasCloning && type === 'local' && (
              <span className={cn(
                'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
                showAsSelected ? 'bg-white/20 text-white' : 'bg-blue-500/10 text-blue-500'
              )}>
                Preset Voices
              </span>
            )}
            {/* MUSIC SPECIFIC TAGS */}
            {service === 'music' && (
              <span className={cn(
                'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
                showAsSelected ? 'bg-white/20 text-white' : 'bg-purple-500/10 text-purple-500'
              )}>
                Music Gen
              </span>
            )}

            {type === 'local' && vramGb > 0 && (
              <span className={cn(
                'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
                showAsSelected ? 'bg-white/20 text-white' : 'bg-accent-primary/5 text-foreground-muted'
              )}>
                {vramGb}GB VRAM
              </span>
            )}
          </>
        )}
      </div>
    </button>
  );
}

// Provider Row component (for dropdown)
function ProviderRow({
  provider,
  isSelected,
  isReady,
  isImplemented,
  onSelect,
  statusBadge,
  type,
  service,
}: {
  provider: AnyProviderInfo;
  isSelected: boolean;
  isReady: boolean;
  isImplemented: boolean;
  onSelect: () => void;
  statusBadge: React.ReactNode;
  type: 'local' | 'api';
  service: ServiceType;
}) {
  const isDisabled = !isImplemented || (!isReady && type === 'local');

  return (
    <button
      onClick={onSelect}
      disabled={isDisabled}
      className={cn(
        'w-full px-4 py-3 flex items-center gap-3 transition-colors text-left',
        isDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-surface-2'
      )}
    >
      {type === 'local' ? (
        <Cpu className="w-5 h-5 text-emerald-400" />
      ) : (
        <Cloud className="w-5 h-5 text-blue-400" />
      )}
      <div className="flex-1">
        <div className="font-medium flex items-center gap-2">
          {provider.name}
          {isSelected && <Check className="w-4 h-4 text-emerald-400" />}
          {!isImplemented && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-500/20 text-slate-400">
              Coming Soon
            </span>
          )}
        </div>
        <div className="text-sm text-slate-400">
          {provider.description?.split('.')[0]}
        </div>
      </div>
      {statusBadge}
    </button>
  );
}

export default UnifiedProviderSelector;
