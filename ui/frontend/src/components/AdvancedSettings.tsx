'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AdvancedSettingsProps {
  settings: {
    temperature: number;
    exaggeration: number;
    cfg_weight: number;
    top_p: number;
    top_k: number;
    speed: number;
    seed: number;
  };
  onChange: (key: string, value: number) => void;
  modelSupportsExaggeration: boolean;
  modelSupportsCfg: boolean;
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  disabled,
  description,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  description?: string;
}) {
  return (
    <div className={cn('space-y-2', disabled && 'opacity-50')}>
      <div className="flex justify-between items-center">
        <label className="text-sm font-medium text-foreground">{label}</label>
        <span className="text-sm font-mono text-emerald-200 bg-emerald-500/10 px-2 py-0.5 rounded">
          {value.toFixed(step < 1 ? 2 : 0)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        disabled={disabled}
        className="slider w-full"
      />
      {description && <p className="text-xs text-foreground-muted">{description}</p>}
    </div>
  );
}

export function AdvancedSettings({
  settings,
  onChange,
  modelSupportsExaggeration,
  modelSupportsCfg,
}: AdvancedSettingsProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="glass rounded-xl overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Settings2 className="w-5 h-5 text-foreground-muted" />
          <span className="font-medium text-foreground">Advanced Settings</span>
        </div>
        <div className={cn(
          'p-1 rounded-lg transition-colors',
          isOpen ? 'bg-emerald-500/20 text-emerald-300' : 'text-foreground-muted'
        )}>
          {isOpen ? (
            <ChevronUp className="w-5 h-5" />
          ) : (
            <ChevronDown className="w-5 h-5" />
          )}
        </div>
      </button>

      <div
        className={cn(
          'overflow-hidden transition-all duration-300 ease-in-out',
          isOpen ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0'
        )}
      >
        <div className="p-4 pt-0 space-y-5 border-t border-glass-border">
          <Slider
            label="Temperature"
            value={settings.temperature}
            min={0.1}
            max={2.0}
            step={0.1}
            onChange={(v) => onChange('temperature', v)}
            description="Higher = more varied, lower = more consistent"
          />

          <Slider
            label="Exaggeration"
            value={settings.exaggeration}
            min={0.25}
            max={2.0}
            step={0.05}
            onChange={(v) => onChange('exaggeration', v)}
            disabled={!modelSupportsExaggeration}
            description="Voice style intensity (0.5 = neutral)"
          />

          <Slider
            label="CFG Weight"
            value={settings.cfg_weight}
            min={0}
            max={1.0}
            step={0.05}
            onChange={(v) => onChange('cfg_weight', v)}
            disabled={!modelSupportsCfg}
            description="Pace/guidance control (0 = ignore reference accent)"
          />

          <Slider
            label="Speed"
            value={settings.speed}
            min={0.5}
            max={2.0}
            step={0.1}
            onChange={(v) => onChange('speed', v)}
            description="Playback speed (1.0 = normal)"
          />

          <Slider
            label="Top P"
            value={settings.top_p}
            min={0.5}
            max={1.0}
            step={0.05}
            onChange={(v) => onChange('top_p', v)}
            description="Nucleus sampling threshold"
          />

          <Slider
            label="Top K"
            value={settings.top_k}
            min={100}
            max={1000}
            step={100}
            onChange={(v) => onChange('top_k', v)}
            description="Token selection pool size"
          />

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Seed</label>
            <input
              type="number"
              value={settings.seed}
              onChange={(e) => onChange('seed', parseInt(e.target.value) || 0)}
              placeholder="0 = random"
              className="input w-full"
            />
            <p className="text-xs text-foreground-muted">Set for reproducible results (0 = random)</p>
          </div>
        </div>
      </div>
    </div>
  );
}
