import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Utility for combining class names with Tailwind merge support
 * Usage: cn('base-class', conditional && 'conditional-class', 'another-class')
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
