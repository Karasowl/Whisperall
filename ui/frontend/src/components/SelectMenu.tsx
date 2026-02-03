'use client';

import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDropdownPosition } from '@/lib/useDropdownPosition';

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
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const { position: dropdownStyle } = useDropdownPosition({
    triggerRef: buttonRef,
    dropdownRef,
    isOpen: open && !disabled,
  });
  const selected = options.find((opt) => opt.value === value);
  const portalRoot = typeof document !== 'undefined' ? document.body : null;
  const dropdown = open && !disabled ? (
    <>
      <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
      <div
        ref={dropdownRef}
        className="fixed z-50 dropdown-content max-h-80 overflow-y-auto animate-fade-in custom-scrollbar"
        style={dropdownStyle}
      >
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
              'w-full text-left px-4 py-3 transition-colors border-b border-white/5 last:border-0',
              option.disabled
                ? 'opacity-50 cursor-not-allowed'
                : 'hover:bg-accent-primary/10 hover:text-accent-primary',
              option.value === value && 'bg-accent-primary/20 text-accent-primary font-medium'
            )}
          >
            <div className="text-sm">{option.label}</div>
            {option.description && (
              <div className="text-xs text-foreground-muted mt-1 opacity-80">{option.description}</div>
            )}
          </button>
        ))}
      </div>
    </>
  ) : null;

  return (
    <div className={cn('space-y-2', className)}>
      {label && <label className="label">{label}</label>}

      <div className="relative">
        <button
          type="button"
          ref={buttonRef}
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
        {portalRoot ? createPortal(dropdown, portalRoot) : dropdown}
      </div>
    </div>
  );
}
