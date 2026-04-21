import { app, Tray, Menu, nativeImage } from 'electron';
import path from 'path';
import fs from 'fs';
import { showMainWindow, setMinimizeToTray } from './windows.js';
import { showOverlay } from './overlay.js';
import { showTranslator } from './translator-window.js';

let tray: Tray | null = null;

export interface TraySettings {
  minimizeToTray: boolean;
  showNotifications: boolean;
}

let settings: TraySettings = {
  minimizeToTray: true,
  showNotifications: true,
};

function getIconPath(): string | null {
  const isDev = !app.isPackaged;
  const base = isDev ? path.join(__dirname, '..', '..') : process.resourcesPath;
  const buildRes = isDev ? path.join(__dirname, '..', '..', 'build-resources') : process.resourcesPath;
  const candidates = [
    path.join(base, 'whisperall-tray.png'),
    path.join(base, 'icon.png'),
    path.join(buildRes, 'icon.ico'),
    path.join(base, 'icon.ico'),
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

function createTray(): boolean {
  if (tray) return true;
  const iconPath = getIconPath();
  if (!iconPath) return false;

  tray = new Tray(nativeImage.createFromPath(iconPath));
  tray.setToolTip('Whisperall');
  tray.on('click', () => showMainWindow());

  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Whisperall', click: () => showMainWindow() },
      { label: 'Open Widget', click: () => showOverlay() },
      { label: 'Open Screen Translator', click: () => showTranslator() },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ]),
  );
  return true;
}

export function syncTray(): void {
  if (settings.minimizeToTray) {
    if (!createTray()) {
      // No tray icon available — disable minimize-to-tray so closing actually quits
      console.warn('[tray] No icon found, disabling minimize-to-tray');
      settings.minimizeToTray = false;
      setMinimizeToTray(false);
    }
  } else if (tray) {
    tray.destroy();
    tray = null;
  }
}

export function updateTraySettings(newSettings: Partial<TraySettings>): void {
  settings = { ...settings, ...newSettings };
  syncTray();
}

export function getTraySettings(): TraySettings {
  return settings;
}
