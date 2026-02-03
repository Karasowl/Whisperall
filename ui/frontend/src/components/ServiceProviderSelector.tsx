'use client';

import { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Cpu, Cloud, Check, AlertTriangle } from 'lucide-react';
import { ServiceType, ServiceProviderInfo, getServiceProviders } from '@/lib/api';
import { useDropdownPosition } from '@/lib/useDropdownPosition';

interface ServiceProviderSelectorProps {
  service: ServiceType;
  selected: string;
  onSelect: (providerId: string) => void;
  onProviderInfoChange?: (info: ServiceProviderInfo | null) => void;
  disabled?: boolean;
  label?: string;
}

export function ServiceProviderSelector({
  service,
  selected,
  onSelect,
  onProviderInfoChange,
  disabled = false,
  label,
}: ServiceProviderSelectorProps) {
  const [providers, setProviders] = useState<ServiceProviderInfo[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const { position: dropdownStyle } = useDropdownPosition({
    triggerRef: buttonRef,
    dropdownRef,
    isOpen,
  });
  const portalRoot = typeof document !== 'undefined' ? document.body : null;
  const getLocalUnavailableLabel = (provider: ServiceProviderInfo) =>
    provider.requires_model_download ? 'install model' : 'start service';

  useEffect(() => {
    async function loadProviders() {
      setLoading(true);
      try {
        const data = await getServiceProviders(service);
        setProviders(data);

        // Auto-select first available if none selected
        if (!selected && data.length > 0) {
          const firstAvailable = data.find(p => p.is_available) || data[0];
          onSelect(firstAvailable.id);
        }
      } catch (err) {
        console.error(`Failed to load ${service} providers:`, err);
      } finally {
        setLoading(false);
      }
    }
    loadProviders();
  }, [service]);

  useEffect(() => {
    const info = providers.find(p => p.id === selected) || null;
    onProviderInfoChange?.(info);
  }, [selected, providers, onProviderInfoChange]);

  const selectedProvider = providers.find(p => p.id === selected);

  const serviceLabels: Partial<Record<ServiceType, string>> = {
    tts: 'TTS Engine',
    stt: 'Transcription Engine',
    ai_edit: 'AI Model',
    translation: 'Translation Engine',
    music: 'Music Engine',
    sfx: 'SFX Engine',
    voice_changer: 'Voice Changer',
    voice_isolator: 'Voice Isolator',
    dubbing: 'Dubbing Engine',
  };
  const dropdown = isOpen ? (
    <>
      <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
      <div
        ref={dropdownRef}
        className="fixed z-50 card shadow-xl max-h-72 overflow-y-auto custom-scrollbar"
        style={dropdownStyle}
      >
        {/* Local providers */}
        {providers.filter(p => p.type === 'local').length > 0 && (
          <>
            <div className="px-4 py-2 text-xs font-semibold text-slate-400 uppercase bg-surface-1">
              Local Models
            </div>
            {providers.filter(p => p.type === 'local').map(provider => (
              <button
                key={provider.id}
                onClick={() => {
                  onSelect(provider.id);
                  setIsOpen(false);
                }}
                className={`w-full px-4 py-3 flex items-center gap-3 transition-colors text-left ${provider.is_available ? 'hover:bg-surface-2' : 'opacity-70'
                  }`}
              >
                <Cpu className="w-5 h-5 text-emerald-400" />
                <div className="flex-1">
                  <div className="font-medium flex items-center gap-2">
                    {provider.name}
                    {selected === provider.id && (
                      <Check className="w-4 h-4 text-emerald-400" />
                    )}
                  </div>
                  <div className="text-sm text-slate-400">
                    {provider.description}
                  </div>
                </div>
                {!provider.is_available && (
                  <span title={`Provider not ready: ${getLocalUnavailableLabel(provider)}`}>
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                  </span>
                )}
              </button>
            ))}
          </>
        )}

        {/* API providers */}
        {providers.filter(p => p.type === 'api').length > 0 && (
          <>
            <div className="px-4 py-2 text-xs font-semibold text-slate-400 uppercase bg-surface-1">
              Cloud APIs
            </div>
            {providers.filter(p => p.type === 'api').map(provider => (
              <button
                key={provider.id}
                onClick={() => {
                  onSelect(provider.id);
                  setIsOpen(false);
                }}
                className={`w-full px-4 py-3 flex items-center gap-3 transition-colors text-left ${provider.is_available ? 'hover:bg-surface-2' : 'opacity-70'
                  }`}
              >
                <Cloud className="w-5 h-5 text-blue-400" />
                <div className="flex-1">
                  <div className="font-medium flex items-center gap-2">
                    {provider.name}
                    {selected === provider.id && (
                      <Check className="w-4 h-4 text-emerald-400" />
                    )}
                  </div>
                  <div className="text-sm text-slate-400">
                    {provider.description}
                  </div>
                </div>
                {!provider.is_available && (
                  <span title="API key not configured">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                  </span>
                )}
              </button>
            ))}
          </>
        )}
      </div>
    </>
  ) : null;

  return (
    <div className="space-y-2">
      <label className="label">{label || serviceLabels[service] || 'Service'}</label>
      <div className="relative">
        <button
          type="button"
          ref={buttonRef}
          onClick={() => !disabled && setIsOpen(!isOpen)}
          disabled={disabled || loading}
          className="w-full card-interactive p-4 flex items-center justify-between text-left"
        >
          {loading ? (
            <span className="text-slate-400">Loading providers...</span>
          ) : selectedProvider ? (
            <div className="flex items-center gap-3">
              {selectedProvider.type === 'local' ? (
                <Cpu className="w-5 h-5 text-emerald-400" />
              ) : (
                <Cloud className="w-5 h-5 text-blue-400" />
              )}
              <div>
                <div className="font-medium">{selectedProvider.name}</div>
                <div className="text-sm text-slate-400">
                  {selectedProvider.type === 'local' ? 'Local' : 'API'}
                  {!selectedProvider.is_available && (
                    <span className="text-amber-400 ml-2">
                      {selectedProvider.type === 'api'
                        ? '(configure key)'
                        : `(${getLocalUnavailableLabel(selectedProvider)})`}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <span className="text-slate-400">Select provider</span>
          )}
          <ChevronDown className={`w-5 h-5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {portalRoot ? createPortal(dropdown, portalRoot) : dropdown}
      </div>
    </div>
  );
}
