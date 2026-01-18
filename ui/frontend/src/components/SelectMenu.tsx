'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

interface SelectMenuProps {
  label?: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  buttonClassName?: string;
}

export function SelectMenu({
  label,
  value,
  options,
  onChange,
  disabled = false,
  placeholder = 'Select an option',
  className,
  buttonClassName,
}: SelectMenuProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((opt) => opt.value === value);

  return (
    <div className={cn('space-y-2', className)}>
      {label && <label className="label">{label}</label>}

      <div className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={() => !disabled && setOpen(!open)}
          className={cn(
            'w-full px-4 py-3 rounded-xl text-left flex items-center justify-between transition-all',
            disabled ? 'glass opacity-50 cursor-not-allowed' : 'glass glass-hover',
            buttonClassName
          )}
        >
          <span className="text-foreground">
            {selected?.label || placeholder}
          </span>
          <ChevronDown
            className={cn(
              'w-4 h-4 text-foreground-muted transition-transform',
              open && 'rotate-180'
            )}
          />
        </button>

        {open && !disabled && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute z-20 w-full mt-2 glass-card overflow-hidden max-h-72 overflow-y-auto animate-fade-in">
              {options.map((option) => (
                <button
                  type="button"
                  key={option.value}
                  disabled={option.disabled}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={cn(
                    'w-full text-left px-4 py-3 transition-colors',
                    option.disabled
                      ? 'opacity-50 cursor-not-allowed'
                      : 'hover:bg-white/5',
                    option.value === value && 'bg-emerald-500/15 text-emerald-200'
                  )}
                >
                  <div className="text-sm font-medium">{option.label}</div>
                  {option.description && (
                    <div className="text-xs text-foreground-muted mt-1">{option.description}</div>
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
