import { electron } from './electron';
import { useNotificationsStore } from '../stores/notifications';

/**
 * Copy text to the system clipboard with visual feedback.
 *
 * 1. Tries Electron's native clipboard API (most reliable in Electron).
 * 2. Falls back to navigator.clipboard.writeText.
 * 3. Falls back to legacy document.execCommand('copy').
 * 4. Shows a brief "Copied" toast via the notifications store.
 */
export async function copyText(text: string, label?: string): Promise<boolean> {
  if (!text) return false;
  let ok = false;

  // Electron native (bypasses CSP / focus issues).
  if (electron?.writeClipboard) {
    try { await electron.writeClipboard(text); ok = true; } catch { /* fallback */ }
  }

  // Web Clipboard API.
  if (!ok && navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(text); ok = true; } catch { /* fallback */ }
  }

  // Legacy fallback.
  if (!ok) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      ok = document.execCommand('copy');
      document.body.removeChild(ta);
    } catch { /* give up */ }
  }

  // Visual feedback — brief success toast.
  if (ok) {
    const msg = label ? `Copied: ${label}` : 'Copied to clipboard';
    useNotificationsStore.getState().push(msg, 'success');
  } else {
    useNotificationsStore.getState().push('Failed to copy to clipboard', 'error');
  }

  return ok;
}
