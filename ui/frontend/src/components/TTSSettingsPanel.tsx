'use client';

import { useState } from 'react';
import { Settings, History, ChevronDown, RefreshCw, ToggleLeft, ToggleRight, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TTSProviderInfo } from '@/lib/api';

type SettingsState = {
  temperature: number;
  exaggeration: number;
  cfg_weight: number;
  top_p: number;
  top_k: number;
  speed: number;
  seed: number;
  [key: string]: number | string | boolean;
};

interface SliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  leftLabel?: string;
  rightLabel?: string;
  tooltip?: string;
  disabled?: boolean;
}

function SettingsSlider({ label, value, onChange, min, max, step, leftLabel, rightLabel, tooltip, disabled }: SliderProps) {
  const percentage = ((value - min) / (max - min)) * 100;
  
  return (
    <div className={cn("space-y-2", disabled && "opacity-50 pointer-events-none")}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-foreground">{label}</span>
          {tooltip && (
            <div className="group relative">
              <Info className="w-3.5 h-3.5 text-foreground-muted cursor-help" />
              <div className="absolute left-0 bottom-full mb-2 w-48 p-2 bg-surface-base border border-glass-border rounded-lg text-xs text-foreground-secondary opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                {tooltip}
              </div>
            </div>
          )}
        </div>
        <span className="text-xs font-mono text-foreground-muted bg-surface-2 px-2 py-0.5 rounded">
          {value.toFixed(step < 1 ? 2 : 0)}
        </span>
      </div>
      
      <div className="relative">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="settings-slider w-full"
          style={{
            background: `linear-gradient(to right, var(--accent-primary) 0%, var(--accent-primary) ${percentage}%, var(--surface-3) ${percentage}%, var(--surface-3) 100%)`
          }}
        />
      </div>
      
      {(leftLabel || rightLabel) && (
        <div className="flex justify-between text-xs text-foreground-muted">
          <span>{leftLabel}</span>
          <span>{rightLabel}</span>
        </div>
      )}
    </div>
  );
}

interface TTSSettingsPanelProps {
  settings: SettingsState;
  onChange: (key: string, value: number | string | boolean) => void;
  providerInfo: TTSProviderInfo | null;
  fastMode: boolean;
  onFastModeChange: (value: boolean) => void;
  onResetValues: () => void;
  showHistory?: boolean;
  onShowHistoryChange?: (show: boolean) => void;
  modelSupportsExaggeration?: boolean;
  modelSupportsCfg?: boolean;
  className?: string;
}

export function TTSSettingsPanel({
  settings,
  onChange,
  providerInfo,
  fastMode,
  onFastModeChange,
  onResetValues,
  showHistory,
  onShowHistoryChange,
  modelSupportsExaggeration = true,
  modelSupportsCfg = true,
  className,
}: TTSSettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<'settings' | 'history'>('settings');
  
  // Determine which settings to show based on provider
  const isChatterbox = providerInfo?.id === 'chatterbox' || !providerInfo;
  const hasExtraParams = providerInfo?.extra_params && Object.keys(providerInfo.extra_params).length > 0;
  
  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Tab Headers */}
      <div className="flex border-b border-glass-border">
        <button
          onClick={() => setActiveTab('settings')}
          className={cn(
            "flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors relative",
            activeTab === 'settings'
              ? "text-foreground"
              : "text-foreground-muted hover:text-foreground"
          )}
        >
          <Settings className="w-4 h-4" />
          Settings
          {activeTab === 'settings' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-primary" />
          )}
        </button>
        <button
          onClick={() => {
            setActiveTab('history');
            onShowHistoryChange?.(true);
          }}
          className={cn(
            "flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors relative",
            activeTab === 'history'
              ? "text-foreground"
              : "text-foreground-muted hover:text-foreground"
          )}
        >
          <History className="w-4 h-4" />
          History
          {activeTab === 'history' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-primary" />
          )}
        </button>
      </div>
      
      {/* Settings Content */}
      {activeTab === 'settings' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
          {/* Speed Slider - Always visible */}
          <SettingsSlider
            label="Speed"
            value={settings.speed}
            onChange={(v) => onChange('speed', v)}
            min={0.5}
            max={2.0}
            step={0.1}
            leftLabel="Slower"
            rightLabel="Faster"
            tooltip="Control the speaking rate"
          />
          
          {/* Stability/Temperature - For voice consistency */}
          {(isChatterbox || hasExtraParams) && (
            <SettingsSlider
              label="Stability"
              value={1 - settings.temperature}
              onChange={(v) => onChange('temperature', 1 - v)}
              min={0}
              max={1}
              step={0.05}
              leftLabel="More variable"
              rightLabel="More stable"
              tooltip="Higher stability means more consistent but potentially less expressive output"
            />
          )}
          
          {/* Exaggeration/Style - For emotional range */}
          {modelSupportsExaggeration && isChatterbox && (
            <SettingsSlider
              label="Style Exaggeration"
              value={settings.exaggeration}
              onChange={(v) => onChange('exaggeration', v)}
              min={0}
              max={1}
              step={0.05}
              leftLabel="None"
              rightLabel="Exaggerated"
              tooltip="Amplify the emotional expression in speech"
            />
          )}
          
          {/* CFG Weight - For similarity/adherence */}
          {modelSupportsCfg && isChatterbox && !fastMode && (
            <SettingsSlider
              label="Similarity"
              value={settings.cfg_weight}
              onChange={(v) => onChange('cfg_weight', v)}
              min={0}
              max={1}
              step={0.05}
              leftLabel="Low"
              rightLabel="High"
              tooltip="How closely to match the reference voice characteristics"
            />
          )}
          
          {/* Provider-specific extra params */}
          {hasExtraParams && providerInfo?.extra_params && (
            <div className="space-y-4 pt-2 border-t border-glass-border">
              <h4 className="text-xs uppercase tracking-wider text-foreground-muted">
                {providerInfo.name} Settings
              </h4>
              {Object.entries(providerInfo.extra_params).map(([key, param]) => {
                if (param.type === 'float' || param.type === 'int') {
                  return (
                    <SettingsSlider
                      key={key}
                      label={param.label || key}
                      value={Number(settings[key] ?? param.default)}
                      onChange={(v) => onChange(key, v)}
                      min={param.min ?? 0}
                      max={param.max ?? 1}
                      step={param.type === 'int' ? 1 : 0.05}
                      tooltip={param.description}
                    />
                  );
                }
                return null;
              })}
            </div>
          )}
          
          {/* Toggles Section */}
          <div className="space-y-3 pt-2 border-t border-glass-border">
            {/* Speaker Boost / Fast Mode Toggle */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm text-foreground">Speaker boost</span>
                <div className="group relative">
                  <Info className="w-3.5 h-3.5 text-foreground-muted cursor-help" />
                  <div className="absolute left-0 bottom-full mb-2 w-48 p-2 bg-surface-base border border-glass-border rounded-lg text-xs text-foreground-secondary opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                    Enhances speaker characteristics for faster processing
                  </div>
                </div>
              </div>
              <button
                onClick={() => onFastModeChange(!fastMode)}
                className={cn(
                  "relative w-11 h-6 rounded-full transition-colors",
                  fastMode ? "bg-accent-primary" : "bg-surface-3"
                )}
              >
                <span
                  className={cn(
                    "absolute top-1 w-4 h-4 bg-white rounded-full transition-transform shadow-sm",
                    fastMode ? "translate-x-6" : "translate-x-1"
                  )}
                />
              </button>
            </div>
          </div>
          
          {/* Reset Button */}
          <button
            onClick={onResetValues}
            className="flex items-center justify-center gap-2 w-full py-2 text-sm text-foreground-muted hover:text-foreground transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Reset values
          </button>
        </div>
      )}
      
      {/* History Tab Content */}
      {activeTab === 'history' && (
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          <div className="text-center py-8 text-foreground-muted">
            <History className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Recent generations will appear here</p>
          </div>
        </div>
      )}
    </div>
  );
}
