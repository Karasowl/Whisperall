/** Type-safe accessor for the Electron preload bridge. */
export const electron = typeof window !== 'undefined' ? window.whisperall : undefined;

export function isElectron(): boolean {
  return typeof window !== 'undefined' && !!window.whisperall;
}
