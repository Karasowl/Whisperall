'use client';

import { useEffect, useState } from 'react';
import { Cpu, Zap, Monitor } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getSystemCapabilities, type SystemCapabilities } from '@/lib/api';

export type ExecutionMode = 'auto' | 'cuda' | 'cpu';

interface ExecutionModeSwitchProps {
  mode: ExecutionMode;
  onModeChange: (mode: ExecutionMode) => void;
  fastMode?: boolean;
  onFastModeChange?: (enabled: boolean) => void;
  showFastMode?: boolean;
  compact?: boolean;
  className?: string;
}

export function ExecutionModeSwitch({
  mode,
  onModeChange,
  fastMode = false,
  onFastModeChange,
  showFastMode = true,
  compact = false,
  className,
}: ExecutionModeSwitchProps) {
  const [capabilities, setCapabilities] = useState<SystemCapabilities | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const caps = await getSystemCapabilities();
        setCapabilities(caps);
      } catch {
        // Ignore errors - will show CPU only
      }
    };
    load();
  }, []);

  const cudaAvailable = capabilities?.cuda_available ?? false;
  const currentDevice = capabilities?.current_tts_device?.toUpperCase() || 'CPU';

  const buttonBase = cn(
    'rounded-md text-xs font-medium transition-all',
    compact ? 'px-2 py-1' : 'px-3 py-1.5'
  );

  const activeClass = (isActive: boolean, color: 'emerald' | 'amber' = 'emerald') =>
    isActive
      ? color === 'emerald'
        ? 'bg-emerald-500/20 text-emerald-400'
        : 'bg-amber-500/20 text-amber-400'
      : 'text-slate-400 hover:text-slate-100 hover:bg-white/5';

  return (
    <div
      className={cn('flex items-center gap-2 flex-wrap', className)}
      role="group"
      aria-label="Execution mode"
    >
      {/* Device selector */}
      <div className="flex items-center gap-0.5 p-1 rounded-lg bg-white/5 border border-white/5">
        <button
          onClick={() => onModeChange('auto')}
          className={cn(buttonBase, activeClass(mode === 'auto'))}
          title="Automatically select best available device"
          aria-pressed={mode === 'auto'}
        >
          Auto
        </button>

        {cudaAvailable && (
          <button
            onClick={() => onModeChange('cuda')}
            className={cn(buttonBase, activeClass(mode === 'cuda'), 'flex items-center gap-1')}
            title="Use GPU (faster)"
            aria-pressed={mode === 'cuda'}
          >
            <Monitor className="w-3 h-3" aria-hidden="true" />
            GPU
          </button>
        )}

        <button
          onClick={() => onModeChange('cpu')}
          className={cn(buttonBase, activeClass(mode === 'cpu', 'amber'))}
          title="Use CPU (slower but always available)"
          aria-pressed={mode === 'cpu'}
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
        aria-live="polite"
      >
        <span
          className="w-1.5 h-1.5 rounded-full bg-current animate-pulse"
          aria-hidden="true"
        />
        <span>{currentDevice}</span>
      </div>

      {/* Fast mode toggle */}
      {showFastMode && onFastModeChange && (
        <button
          onClick={() => onFastModeChange(!fastMode)}
          className={cn(
            'flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium transition-all border',
            fastMode
              ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
              : 'bg-white/5 text-slate-400 hover:text-slate-100 border-white/10'
          )}
          title="Fast mode: faster generation but may reduce quality"
          aria-pressed={fastMode}
        >
          <Zap className="w-3 h-3" aria-hidden="true" />
          Fast
        </button>
      )}
    </div>
  );
}

export default ExecutionModeSwitch;
