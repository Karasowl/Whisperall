'use client';

import { useEffect, useState } from 'react';
import { Cpu, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getSystemCapabilities, type SystemCapabilities } from '@/lib/api';

interface DeviceStatusBadgeProps {
  className?: string;
  showDetails?: boolean;
}

export function DeviceStatusBadge({ className, showDetails = false }: DeviceStatusBadgeProps) {
  const [capabilities, setCapabilities] = useState<SystemCapabilities | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadCapabilities = async () => {
      try {
        const caps = await getSystemCapabilities();
        setCapabilities(caps);
      } catch (err) {
        console.error('Failed to load capabilities:', err);
      } finally {
        setLoading(false);
      }
    };
    loadCapabilities();
  }, []);

  if (loading) {
    return (
      <div className={cn('flex items-center gap-1.5 text-xs text-slate-400', className)}>
        <Cpu className="w-3.5 h-3.5 animate-pulse" />
        <span>Loading...</span>
      </div>
    );
  }

  if (!capabilities) {
    return null;
  }

  const device = capabilities.current_tts_device?.toUpperCase() || 'CPU';
  const isCuda = device === 'CUDA';
  const fastMode = capabilities.performance_settings?.fast_mode;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        className={cn(
          'flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium',
          isCuda
            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
            : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
        )}
        title={isCuda ? 'Using GPU acceleration' : 'Using CPU (slower)'}
      >
        <Cpu className="w-3.5 h-3.5" />
        <span>{device}</span>
      </div>

      {fastMode && (
        <div
          className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-amber-500/20 text-amber-400 border border-amber-500/30"
          title="Fast mode enabled (CFG disabled)"
        >
          <Zap className="w-3.5 h-3.5" />
          <span>Fast</span>
        </div>
      )}

      {showDetails && capabilities.gpu && (
        <span className="text-xs text-slate-400">
          {capabilities.gpu.name} ({capabilities.gpu.memory_total_gb.toFixed(1)} GB)
        </span>
      )}
    </div>
  );
}
