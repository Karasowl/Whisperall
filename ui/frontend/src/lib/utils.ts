import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Utility for combining class names with Tailwind merge support
 * Usage: cn('base-class', conditional && 'conditional-class', 'another-class')
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a duration in seconds to a human-readable string
 * @param seconds - Duration in seconds
 * @param options - Formatting options
 * @returns Formatted duration string (e.g., "1:23" or "01:23:45")
 */
export function formatDuration(
  seconds: number | undefined,
  options?: { showHours?: boolean; padMinutes?: boolean }
): string {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
    return '0:00';
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const showHours = options?.showHours ?? hours > 0;
  const padMinutes = options?.padMinutes ?? showHours;

  const formattedSecs = secs.toString().padStart(2, '0');
  const formattedMins = padMinutes
    ? minutes.toString().padStart(2, '0')
    : minutes.toString();

  if (showHours) {
    const formattedHours = hours.toString().padStart(2, '0');
    return `${formattedHours}:${formattedMins}:${formattedSecs}`;
  }

  return `${formattedMins}:${formattedSecs}`;
}
