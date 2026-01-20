'use client';

import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DynamicParamsEditor, ParamDefinition, getDefaultParamValues } from './DynamicParamsEditor';

// Flexible type for API extra_params
type ExtraParams = Record<string, { type?: string; default?: unknown; min?: number; max?: number; options?: string[]; description?: string }>;

interface AdvancedSettingsProps {
  settings: Record<string, number | string | boolean>;
  onChange: (key: string, value: number | string | boolean) => void;
  modelSupportsExaggeration?: boolean;
  modelSupportsCfg?: boolean;
  /** Provider's extra_params - if provided, renders dynamic controls */
  extraParams?: ExtraParams;
  /** If true, only show extra_params (no legacy sliders) */
  dynamicOnly?: boolean;
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
        <span className="text-sm font-mono text-accent-primary bg-accent-primary/10 px-2 py-0.5 rounded">
          {(value ?? 0).toFixed(step < 1 ? 2 : 0)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value ?? min}
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
  modelSupportsExaggeration = true,
  modelSupportsCfg = true,
  extraParams,
  dynamicOnly = false,
}: AdvancedSettingsProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Determine if we should use dynamic params
  const useDynamic = extraParams && Object.keys(extraParams).length > 0;
  const showLegacy = !dynamicOnly && !useDynamic;

  // Count params to show in header
  const paramCount = useDynamic
    ? Object.keys(extraParams).length
    : 7; // legacy param count

  return (
    <div className="surface rounded-xl overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Settings2 className="w-5 h-5 text-foreground-muted" />
          <span className="font-medium text-foreground">Advanced Settings</span>
          {paramCount > 0 && (
            <span className="text-xs text-foreground-muted">({paramCount} params)</span>
          )}
        </div>
        <div className={cn(
          'p-1 rounded-lg transition-colors',
          isOpen ? 'bg-accent-primary/20 text-accent-primary' : 'text-foreground-muted'
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
          isOpen ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0'
        )}
      >
        <div className="p-4 pt-0 border-t border-glass-border">
          {/* Dynamic params from provider */}
          {useDynamic && extraParams && (
            <DynamicParamsEditor
              extraParams={extraParams}
              values={settings}
              onChange={(key, value) => onChange(key, value as number | string | boolean)}
              columns={2}
            />
          )}

          {/* Legacy Chatterbox-specific params */}
          {showLegacy && (
            <div className="space-y-5">
              <Slider
                label="Temperature"
                value={settings.temperature as number}
                min={0.1}
                max={2.0}
                step={0.1}
                onChange={(v) => onChange('temperature', v)}
                description="Higher = more varied, lower = more consistent"
              />

              <Slider
                label="Exaggeration"
                value={settings.exaggeration as number}
                min={0.25}
                max={2.0}
                step={0.05}
                onChange={(v) => onChange('exaggeration', v)}
                disabled={!modelSupportsExaggeration}
                description="Voice style intensity (0.5 = neutral)"
              />

              <Slider
                label="CFG Weight"
                value={settings.cfg_weight as number}
                min={0}
                max={1.0}
                step={0.05}
                onChange={(v) => onChange('cfg_weight', v)}
                disabled={!modelSupportsCfg}
                description="Pace/guidance control (0 = ignore reference accent)"
              />

              <Slider
                label="Speed"
                value={settings.speed as number}
                min={0.5}
                max={2.0}
                step={0.1}
                onChange={(v) => onChange('speed', v)}
                description="Playback speed (1.0 = normal)"
              />

              <Slider
                label="Top P"
                value={settings.top_p as number}
                min={0.5}
                max={1.0}
                step={0.05}
                onChange={(v) => onChange('top_p', v)}
                description="Nucleus sampling threshold"
              />

              <Slider
                label="Top K"
                value={settings.top_k as number}
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
                  value={settings.seed as number}
                  onChange={(e) => onChange('seed', parseInt(e.target.value) || 0)}
                  placeholder="0 = random"
                  className="input w-full"
                />
                <p className="text-xs text-foreground-muted">Set for reproducible results (0 = random)</p>
              </div>
            </div>
          )}

          {/* Always show speed and seed for all providers */}
          {useDynamic && !extraParams.speed && (
            <div className="mt-4 pt-4 border-t border-glass-border/50 space-y-4">
              <Slider
                label="Speed"
                value={settings.speed as number ?? 1.0}
                min={0.5}
                max={2.0}
                step={0.1}
                onChange={(v) => onChange('speed', v)}
                description="Playback speed (1.0 = normal)"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Re-export for convenience
export { getDefaultParamValues } from './DynamicParamsEditor';
export type { ParamDefinition } from './DynamicParamsEditor';
