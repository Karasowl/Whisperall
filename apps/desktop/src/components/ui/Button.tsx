import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

/**
 * Pill-first button primitive, ElevenLabs-inspired.
 * - `primary`/`pill`: rounded-full with warm shadow stack.
 * - `outline`: neutral pill outline for secondary actions.
 * - `ghost`: text-only, hover surface.
 * - `subtle`: filled surface with inset border.
 */
export type ButtonVariant = 'primary' | 'pill' | 'outline' | 'ghost' | 'subtle' | 'danger' | 'chip';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'icon';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leftIcon?: string;
  rightIcon?: string;
  /** Highlight chip/outline as the active selection. */
  active?: boolean;
  children?: ReactNode;
};

const SIZE: Record<ButtonSize, string> = {
  xs: 'h-7 px-2 text-[11px] gap-1',
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-9 px-4 text-sm gap-2',
  lg: 'h-11 px-5 text-sm gap-2',
  icon: 'h-8 w-8 p-0',
};

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-white rounded-full shadow-[var(--theme-shadow-card)] hover:brightness-110 active:brightness-95',
  pill: 'bg-[var(--theme-warm)] text-text rounded-full shadow-[var(--theme-shadow-inset-border)] hover:shadow-[var(--theme-shadow-card)] hover:-translate-y-[0.5px]',
  outline: 'bg-transparent text-text rounded-full border border-edge hover:border-primary/40 hover:text-primary',
  ghost: 'bg-transparent text-muted rounded-lg hover:bg-surface hover:text-text',
  subtle: 'bg-surface text-text rounded-lg shadow-[var(--theme-shadow-inset-border)] hover:bg-surface-alt',
  danger: 'bg-red-500/90 text-white rounded-full shadow-[var(--theme-shadow-card)] hover:bg-red-500',
  chip: 'bg-surface text-muted rounded-full border border-edge hover:text-text hover:border-primary/30',
};

const ACTIVE: Partial<Record<ButtonVariant, string>> = {
  chip: 'border-primary/40 bg-primary/10 text-primary hover:text-primary',
  outline: 'border-primary/50 bg-primary/10 text-primary',
  ghost: 'bg-primary/10 text-primary',
  subtle: 'bg-primary/10 text-primary',
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = 'primary', size = 'md', leftIcon, rightIcon, active = false, className = '', children, ...rest },
  ref,
) {
  const base =
    'inline-flex items-center justify-center font-medium tracking-[0.14px] transition-all duration-150 outline-none disabled:opacity-40 disabled:pointer-events-none focus-visible:ring-2 focus-visible:ring-primary/40 whitespace-nowrap';
  const activeClass = active ? (ACTIVE[variant] ?? '') : '';
  return (
    <button ref={ref} className={`${base} ${SIZE[size]} ${VARIANT[variant]} ${activeClass} ${className}`} {...rest}>
      {leftIcon && <span className="material-symbols-outlined text-[16px]">{leftIcon}</span>}
      {children}
      {rightIcon && <span className="material-symbols-outlined text-[16px]">{rightIcon}</span>}
    </button>
  );
});
