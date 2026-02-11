import { globalShortcut } from 'electron';
import { getMainWindow, showMainWindow } from './windows.js';
import { showOverlay, getOverlayWindow, toggleOverlay } from './overlay.js';
import { pasteText } from './clipboard.js';

export interface HotkeyConfig {
  dictate?: string;
  read_clipboard?: string;
  stt_paste?: string;
  pause?: string;
  stop?: string;
  ai_edit?: string;
  translate?: string;
  overlay_toggle?: string;
}

interface SttSettings {
  hotkey_mode: 'toggle' | 'hold';
  overlay_enabled: boolean;
}

let currentHotkeys: HotkeyConfig = {
  dictate: 'Alt+X',
  read_clipboard: 'Ctrl+Shift+R',
  stt_paste: 'Alt+Shift+S',
  translate: 'Alt+T',
  overlay_toggle: 'Alt+W',
};

let sttSettings: SttSettings = {
  hotkey_mode: 'toggle',
  overlay_enabled: true,
};

let dictateHoldActive = false;
let lastDictationText = '';

const ACTION_MAP: Record<string, string> = {
  dictate: 'dictate-toggle',
  read_clipboard: 'read-clipboard',
  stt_paste: 'stt-paste',
  ai_edit: 'ai-edit',
  translate: 'translate',
  overlay_toggle: 'overlay-toggle',
  pause: 'pause',
  stop: 'stop',
};

const BACKGROUND_ACTIONS = new Set([
  'dictate-toggle', 'dictate-start', 'dictate-stop', 'stt-paste', 'read-clipboard',
]);

function sendToMain(action: string, focus: boolean): void {
  const win = getMainWindow();
  if (!win) return;
  if (focus) showMainWindow();
  win.webContents.send('hotkey', action);
}

function sendToOverlay(action: string): void {
  const win = getOverlayWindow();
  if (!win) return;
  const send = () => win.webContents.send('hotkey', action);
  if (win.webContents.isLoading()) {
    // Delay after load so React effects have time to register IPC listeners
    win.webContents.once('did-finish-load', () => setTimeout(send, 150));
  } else {
    send();
  }
}

export function registerHotkeys(): void {
  globalShortcut.unregisterAll();

  for (const [key, accelerator] of Object.entries(currentHotkeys)) {
    if (!accelerator) continue;
    try {
      const ok = globalShortcut.register(accelerator, () => {
        console.log(`[Hotkey] ${accelerator} pressed -> ${ACTION_MAP[key] ?? key}`);
        let action = ACTION_MAP[key] ?? key;

        // Dictation mode handling
        if (key === 'dictate') {
          if (sttSettings.hotkey_mode === 'hold') {
            action = dictateHoldActive ? 'dictate-stop' : 'dictate-start';
            dictateHoldActive = !dictateHoldActive;
          } else {
            action = 'dictate-toggle';
          }
        }

        // Dictation actions go to overlay
        if ((action === 'dictate-toggle' || action === 'dictate-start') && sttSettings.overlay_enabled) {
          showOverlay();
          sendToOverlay(action);
          return;
        }

        if (action === 'stt-paste') {
          pasteText(lastDictationText);
          return;
        }

        if (action === 'read-clipboard') {
          showOverlay('reader');
          sendToOverlay('read-clipboard');
          return;
        }

        if (action === 'overlay-toggle') {
          toggleOverlay();
          return;
        }

        if (action === 'translate') {
          showOverlay('translator');
          sendToOverlay('translate');
          return;
        }

        sendToMain(action, !BACKGROUND_ACTIONS.has(action));
        sendToOverlay(action);
      });
      if (ok) {
        console.log(`[Hotkey] Registered ${accelerator} -> ${key}`);
      } else {
        console.warn(`[Hotkey] FAILED to register ${accelerator} — already in use by another app`);
      }
    } catch (err) {
      console.error(`[Hotkey] Failed to register ${accelerator}:`, (err as Error).message);
    }
  }
}

export function updateHotkeys(hotkeys: Partial<HotkeyConfig>): void {
  currentHotkeys = { ...currentHotkeys, ...hotkeys };
  registerHotkeys();
}

export function updateSttSettings(settings: Partial<SttSettings>): void {
  sttSettings = { ...sttSettings, ...settings };
}

export function setLastDictationText(text: string): void {
  lastDictationText = text;
}

export function getLastDictationText(): string {
  return lastDictationText;
}

export function unregisterAll(): void {
  globalShortcut.unregisterAll();
}
