import type { HTMLAttributes, ReactNode } from 'react';

/**
 * ElevenLabs-grammar card: subtle inset border + outline shadow, barely lifted.
 * Use for container surfaces that should "barely exist" on the canvas.
 */
export type CardVariant = 'default' | 'warm' | 'flat';

type Props = HTMLAttributes<HTMLDivElement> & {
  variant?: CardVariant;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  children?: ReactNode;
};

const PADDING = { none: '', sm: 'p-2', md: 'p-4', lg: 'p-6' } as const;

const VARIANT: Record<CardVariant, string> = {
  default:
    'bg-surface rounded-2xl shadow-[var(--theme-shadow-inset-border),var(--theme-shadow-outline)]',
  warm:
    'bg-[var(--theme-warm)] rounded-2xl shadow-[var(--theme-shadow-inset-border),var(--theme-shadow-warm)]',
  flat:
    'bg-surface-alt rounded-2xl border border-edge/60',
};

export function Card({ variant = 'default', padding = 'md', className = '', children, ...rest }: Props) {
  return (
    <div className={`${VARIANT[variant]} ${PADDING[padding]} ${className}`} {...rest}>
      {children}
    </div>
  );
}
