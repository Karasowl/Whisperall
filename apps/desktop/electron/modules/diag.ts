import { getMainWindow } from './windows.js';

export type DiagTone = 'info' | 'warning' | 'error' | 'success';

export type DiagPayload = {
  message: string;
  detail?: string;
  context?: string;
  tone?: DiagTone;
};

/**
 * Push a diagnostic entry to the main window's in-app notification store
 * (the bell icon in the topbar). Preferred over `new Notification({...})`
 * for anything that is NOT user-facing feedback, because:
 *
 *  - Native Windows toasts silently no-op when Focus Assist / Do Not Disturb
 *    is on, when the app has no AppUserModelID, or when the Action Center
 *    service is stopped. We can't rely on them for diagnostics.
 *  - The in-app bell is always visible, persists across reloads, and is
 *    already the canonical place the user looks for errors.
 *
 * Works even if the main window is still loading — when it mounts, the
 * renderer subscribes to this channel via App.tsx and replays incoming
 * messages into `useNotificationsStore.pushError`.
 */
export function pushDiag(payload: DiagPayload): void {
  const main = getMainWindow();
  if (!main || main.isDestroyed()) return;
  const send = () => main.webContents.send('diag:push', payload);
  if (main.webContents.isLoading()) {
    main.webContents.once('did-finish-load', () => setTimeout(send, 150));
  } else {
    send();
  }
}
