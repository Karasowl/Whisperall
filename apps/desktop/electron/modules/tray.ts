import { app, Tray, Menu, nativeImage } from 'electron';
import path from 'path';
import fs from 'fs';
import { showMainWindow } from './windows.js';
import { showOverlay } from './overlay.js';

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
  const candidates = ['whisperall-tray.png', 'icon.png'].map((f) => path.join(base, f));
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

function createTray(): void {
  if (tray) return;
  const iconPath = getIconPath();
  if (!iconPath) return;

  tray = new Tray(nativeImage.createFromPath(iconPath));
  tray.setToolTip('Whisperall');
  tray.on('click', () => showMainWindow());

  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Whisperall', click: () => showMainWindow() },
      { label: 'Open Widget', click: () => showOverlay() },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ]),
  );
}

export function syncTray(): void {
  if (settings.minimizeToTray) {
    createTray();
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
