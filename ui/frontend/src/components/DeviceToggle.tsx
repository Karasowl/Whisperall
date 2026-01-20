'use client';

import { useEffect, useState } from 'react';
import { Cpu, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getSystemCapabilities, type SystemCapabilities } from '@/lib/api';

interface DeviceToggleProps {
  value: 'auto' | 'cuda' | 'cpu';
  onChange: (device: 'auto' | 'cuda' | 'cpu') => void;
  className?: string;
  showFastMode?: boolean;
  fastMode?: boolean;
  onFastModeChange?: (enabled: boolean) => void;
}

export function DeviceToggle({
  value,
  onChange,
  className,
  showFastMode = false,
  fastMode = false,
  onFastModeChange,
}: DeviceToggleProps) {
  const [capabilities, setCapabilities] = useState<SystemCapabilities | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const caps = await getSystemCapabilities();
        setCapabilities(caps);
      } catch {
        // Ignore errors
      }
    };
    load();
  }, []);

  const cudaAvailable = capabilities?.cuda_available ?? false;
  const currentDevice = capabilities?.current_tts_device?.toUpperCase() || 'CPU';

  return (
    <div className={cn('flex items-center gap-3 flex-wrap', className)}>
      {/* Device selector */}
      <div className="flex items-center gap-1 p-1 rounded-lg bg-white/5">
        <button
          onClick={() => onChange('auto')}
          className={cn(
            'px-3 py-1.5 rounded-md text-xs font-medium transition-all',
            value === 'auto'
              ? 'bg-emerald-500/20 text-emerald-400'
              : 'text-slate-400 hover:text-slate-100 hover:bg-white/5'
          )}
          title="Automatically select best available device"
        >
          Auto
        </button>
        {cudaAvailable && (
          <button
            onClick={() => onChange('cuda')}
            className={cn(
              'px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1',
              value === 'cuda'
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'text-slate-400 hover:text-slate-100 hover:bg-white/5'
            )}
            title="Use GPU (faster)"
          >
            <Cpu className="w-3 h-3" />
            GPU
          </button>
        )}
        <button
          onClick={() => onChange('cpu')}
          className={cn(
            'px-3 py-1.5 rounded-md text-xs font-medium transition-all',
            value === 'cpu'
              ? 'bg-amber-500/20 text-amber-400'
              : 'text-slate-400 hover:text-slate-100 hover:bg-white/5'
          )}
          title="Use CPU (slower but always available)"
        >
          CPU
        </button>
      </div>

      {/* Current device indicator */}
      <div
        className={cn(
          'flex items-center gap-1.5 px-2 py-1 rounded-full text-xs',
          currentDevice === 'CUDA'
            ? 'bg-emerald-500/10 text-emerald-400'
            : 'bg-amber-500/10 text-amber-400'
        )}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
        <span>{currentDevice}</span>
      </div>

      {/* Fast mode toggle */}
      {showFastMode && onFastModeChange && (
        <button
          onClick={() => onFastModeChange(!fastMode)}
          className={cn(
            'flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium transition-all',
            fastMode
              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              : 'bg-white/5 text-slate-400 hover:text-slate-100 border border-white/10'
          )}
          title="Fast mode: ~50% faster but may reduce quality"
        >
          <Zap className="w-3 h-3" />
          Fast
        </button>
      )}
    </div>
  );
}
