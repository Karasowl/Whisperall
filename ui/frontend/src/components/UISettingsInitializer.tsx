'use client';

import { useEffect } from 'react';
import { getAllSettings } from '@/lib/api';
import { applyUiSettings } from '@/lib/uiSettings';

export function UISettingsInitializer() {
  useEffect(() => {
    let isMounted = true;
    async function loadUiSettings() {
      try {
        const settings = await getAllSettings();
        if (!isMounted) return;
        applyUiSettings(settings?.ui);
        if (window.electronAPI?.updateTraySettings && settings?.ui) {
          window.electronAPI.updateTraySettings({
            minimizeToTray: settings.ui.minimize_to_tray,
            showNotifications: settings.ui.show_notifications,
          });
        }
      } catch {
        // Keep defaults if settings cannot be loaded.
      }
    }
    loadUiSettings();
    return () => {
      isMounted = false;
    };
  }, []);

  return null;
}

export default UISettingsInitializer;
