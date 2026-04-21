import { globalShortcut } from 'electron';
import { getMainWindow, showMainWindow } from './windows.js';
import { showOverlay, getOverlayWindow, toggleOverlay } from './overlay.js';
import { toggleTranslator } from './translator-window.js';
import { pasteText } from './clipboard.js';
import { pushDiag } from './diag.js';

export interface HotkeyConfig {
  dictate?: string;
  read_clipboard?: string;
  stt_paste?: string;
  pause?: string;
  stop?: string;
  ai_edit?: string;
  translate?: string;
  overlay_toggle?: string;
  screen_translator?: string;
  /** Alternative accelerator for the screen translator — registered alongside
   *  `screen_translator`. Covers the case where `Ctrl+Alt+T` is swallowed by
   *  another app or by the OS (AltGr alias on Spanish keyboards, Chrome's
   *  "reopen tab", etc.). Either key opens the same widget. */
  screen_translator_alt?: string;
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
  screen_translator: 'Ctrl+Alt+T',
  screen_translator_alt: 'Alt+Shift+T',
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
  screen_translator: 'screen-translator-toggle',
  screen_translator_alt: 'screen-translator-toggle',
  pause: 'pause',
  stop: 'stop',
};

const BACKGROUND_ACTIONS = new Set([
  'dictate-toggle', 'dictate-start', 'dictate-stop', 'stt-paste', 'read-clipboard',
]);

function sameHotkeys(next: HotkeyConfig): boolean {
  const keys = new Set([...Object.keys(currentHotkeys), ...Object.keys(next)]);
  for (const key of keys) {
    if ((currentHotkeys as Record<string, string | undefined>)[key] !== (next as Record<string, string | undefined>)[key]) {
      return false;
    }
  }
  return true;
}

function sameSttSettings(next: SttSettings): boolean {
  return next.hotkey_mode === sttSettings.hotkey_mode && next.overlay_enabled === sttSettings.overlay_enabled;
}

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

  const registered: string[] = [];
  const failed: string[] = [];

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
          const win = getMainWindow();
          if (win && win.isFocused()) {
            win.webContents.send('clipboard:paste-text', lastDictationText);
            return;
          }
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

        if (action === 'screen-translator-toggle') {
          toggleTranslator();
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
        if (key === 'screen_translator' || key === 'screen_translator_alt') {
          registered.push(accelerator);
        }
      } else {
        console.warn(`[Hotkey] FAILED to register ${accelerator} — already in use by another app`);
        if (key === 'screen_translator' || key === 'screen_translator_alt') {
          failed.push(accelerator);
        }
      }
    } catch (err) {
      console.error(`[Hotkey] Failed to register ${accelerator}:`, (err as Error).message);
      if (key === 'screen_translator' || key === 'screen_translator_alt') {
        failed.push(accelerator);
      }
    }
  }

  // Diagnostic startup event — pushed to the in-app notification bell so
  // the user always has visibility, independent of Windows toast settings.
  let body: string;
  let tone: 'info' | 'warning' | 'error' = 'info';
  if (registered.length > 0 && failed.length === 0) {
    body = `Screen Translator hotkeys ready: ${registered.join(' or ')}. Also available via tray > Open Screen Translator.`;
    tone = 'info';
  } else if (registered.length > 0 && failed.length > 0) {
    body = `Screen Translator partially ready. OK: ${registered.join(', ')}. Blocked: ${failed.join(', ')}. Use the working one or tray > Open Screen Translator.`;
    tone = 'warning';
  } else {
    body = `Screen Translator hotkeys BLOCKED by another app (${failed.join(', ')}). Use tray > Open Screen Translator instead.`;
    tone = 'error';
  }
  pushDiag({ message: 'Hotkeys registered', detail: body, context: 'hotkeys', tone });
}

export function updateHotkeys(hotkeys: Partial<HotkeyConfig>): void {
  const nextHotkeys = { ...currentHotkeys, ...hotkeys };
  if (sameHotkeys(nextHotkeys)) return;
  currentHotkeys = nextHotkeys;
  registerHotkeys();
}

export function updateSttSettings(settings: Partial<SttSettings>): void {
  const nextSettings = { ...sttSettings, ...settings };
  if (sameSttSettings(nextSettings)) return;
  sttSettings = nextSettings;
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


