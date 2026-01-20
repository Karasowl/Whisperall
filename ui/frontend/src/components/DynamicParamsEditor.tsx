'use client';

import { SelectMenu } from './SelectMenu';

/**
 * Parameter definition from backend provider's extra_params
 */
export interface ParamDefinition {
  type: 'float' | 'int' | 'select' | 'boolean';
  default: number | string | boolean;
  min?: number;
  max?: number;
  options?: string[];
  description?: string;
}

// Flexible type for API extra_params (type is string from JSON)
type FlexibleParams = Record<string, {
  type?: string;
  default?: unknown;
  min?: number;
  max?: number;
  options?: string[];
  description?: string;
}>;

interface DynamicParamsEditorProps {
  extraParams: FlexibleParams;
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  columns?: 1 | 2 | 3;
  compact?: boolean;
}

/**
 * Renders dynamic parameter controls based on provider's extra_params configuration.
 * Supports: float (slider), int (number input), select (dropdown), boolean (toggle)
 */
export function DynamicParamsEditor({
  extraParams,
  values,
  onChange,
  columns = 2,
  compact = false,
}: DynamicParamsEditorProps) {
  if (!extraParams || Object.keys(extraParams).length === 0) {
    return null;
  }

  const formatLabel = (key: string): string => {
    // Convert snake_case or camelCase to Title Case
    return key
      .replace(/_/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (s) => s.toUpperCase())
      .trim();
  };

  const gridCols = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
  };

  return (
    <div className={`grid ${gridCols[columns]} gap-4`}>
      {Object.entries(extraParams).map(([key, param]) => {
        const value = values[key] ?? param.default;
        const label = formatLabel(key);

        // Float parameter - render slider
        if (param.type === 'float') {
          const min = param.min ?? 0;
          const max = param.max ?? 1;
          const step = (max - min) / 100;
          const numValue = typeof value === 'number' ? value : (typeof param.default === 'number' ? param.default : min);

          return (
            <div key={key} className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="label text-sm">{label}</label>
                <span className="text-xs text-foreground-muted font-mono">
                  {(numValue ?? min).toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={numValue ?? min}
                onChange={(e) => onChange(key, parseFloat(e.target.value))}
                className="w-full accent-accent-primary"
              />
              {param.description && !compact && (
                <p className="text-xs text-foreground-muted">{param.description}</p>
              )}
            </div>
          );
        }

        // Int parameter - render number input or slider
        if (param.type === 'int') {
          const min = param.min ?? 0;
          const max = param.max ?? 100;
          const numValue = typeof value === 'number' ? value : (typeof param.default === 'number' ? param.default : min);

          // Use slider for reasonable ranges, number input for large ranges
          if (max - min <= 100) {
            return (
              <div key={key} className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="label text-sm">{label}</label>
                  <span className="text-xs text-foreground-muted font-mono">
                    {numValue ?? min}
                  </span>
                </div>
                <input
                  type="range"
                  min={min}
                  max={max}
                  step={1}
                  value={numValue ?? min}
                  onChange={(e) => onChange(key, parseInt(e.target.value, 10))}
                  className="w-full accent-accent-primary"
                />
                {param.description && !compact && (
                  <p className="text-xs text-foreground-muted">{param.description}</p>
                )}
              </div>
            );
          }

          return (
            <div key={key} className="space-y-2">
              <label className="label text-sm">{label}</label>
              <input
                type="number"
                min={min}
                max={max}
                value={numValue ?? min}
                onChange={(e) => onChange(key, parseInt(e.target.value, 10))}
                className="input text-sm"
              />
              {param.description && !compact && (
                <p className="text-xs text-foreground-muted">{param.description}</p>
              )}
            </div>
          );
        }

        // Select parameter - render dropdown
        if (param.type === 'select' && param.options) {
          const strValue = typeof value === 'string' ? value : String(param.default);

          return (
            <div key={key} className="space-y-2">
              <SelectMenu
                label={label}
                value={strValue}
                options={param.options.map((opt) => ({
                  value: opt,
                  label: opt.charAt(0).toUpperCase() + opt.slice(1),
                }))}
                onChange={(v) => onChange(key, v)}
              />
              {param.description && !compact && (
                <p className="text-xs text-foreground-muted">{param.description}</p>
              )}
            </div>
          );
        }

        // Boolean parameter - render toggle
        if (param.type === 'boolean') {
          const boolValue = typeof value === 'boolean' ? value : Boolean(param.default);

          return (
            <div key={key} className="flex items-center justify-between py-2">
              <div>
                <label className="label text-sm">{label}</label>
                {param.description && !compact && (
                  <p className="text-xs text-foreground-muted">{param.description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => onChange(key, !boolValue)}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  boolValue ? 'bg-accent-primary' : 'bg-surface-3'
                }`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                    boolValue ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}

/**
 * Helper to get default values from extra_params
 * Accepts broader type to handle API responses
 */
export function getDefaultParamValues(
  extraParams: Record<string, { default?: unknown; [key: string]: unknown }> | undefined
): Record<string, unknown> {
  if (!extraParams) return {};

  const defaults: Record<string, unknown> = {};
  for (const [key, param] of Object.entries(extraParams)) {
    if (param && 'default' in param) {
      defaults[key] = param.default;
    }
  }
  return defaults;
}
