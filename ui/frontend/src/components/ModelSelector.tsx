'use client';

import { Model } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Cpu, Zap, Globe } from 'lucide-react';

interface ModelSelectorProps {
  models: Model[];
  selected: string;
  onSelect: (modelId: string) => void;
  label?: string;
}

const modelIcons: Record<string, typeof Cpu> = {
  original: Cpu,
  multilingual: Globe,
  turbo: Zap,
};

export function ModelSelector({ models, selected, onSelect, label = 'Model' }: ModelSelectorProps) {
  return (
    <div className="space-y-3">
      <label className="label">{label}</label>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {models.map((model) => {
          const Icon = modelIcons[model.id] || Cpu;
          return (
            <button
              key={model.id}
              onClick={() => onSelect(model.id)}
              className={cn(
                'p-4 rounded-xl text-left transition-all duration-200 group',
                selected === model.id
                  ? 'bg-gradient-to-br from-emerald-500/20 to-amber-500/20 border-2 border-emerald-400/50 shadow-lg shadow-emerald-500/10'
                  : 'glass glass-hover border border-transparent'
              )}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className={cn(
                  'p-2 rounded-lg transition-colors',
                  selected === model.id
                    ? 'bg-emerald-500/20 text-emerald-200'
                    : 'bg-white/5 text-slate-400 group-hover:text-slate-100'
                )}>
                  <Icon className="w-5 h-5" />
                </div>
                <span className={cn(
                  'font-semibold',
                  selected === model.id ? 'text-slate-100' : 'text-slate-400 group-hover:text-slate-100'
                )}>
                  {model.name}
                </span>
              </div>
              <p className="text-sm text-slate-400 leading-relaxed">{model.description}</p>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {model.languages.length <= 3 ? (
                  model.languages.map((lang) => (
                    <span key={lang} className="badge text-xs">
                      {lang}
                    </span>
                  ))
                ) : (
                  <span className="badge badge-primary text-xs">
                    {model.languages.length} languages
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
