'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const DEV_MODE_STORAGE_KEY = 'devMode';

export interface DevModeContextValue {
  devMode: boolean;
  setDevMode: (enabled: boolean) => void;
  toggleDevMode: () => void;
}

const DevModeContext = createContext<DevModeContextValue | null>(null);

function readStoredDevMode(): boolean {
  if (typeof window === 'undefined') return false;
  const stored = localStorage.getItem(DEV_MODE_STORAGE_KEY);
  if (stored !== null) return stored === 'true';
  return process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_DEV_MODE === 'true';
}

export function DevModeProvider({ children }: { children: React.ReactNode }) {
  const [devMode, setDevModeState] = useState<boolean>(() => false);

  useEffect(() => {
    setDevModeState(readStoredDevMode());
  }, []);

  const setDevMode = useCallback((enabled: boolean) => {
    setDevModeState(enabled);
    localStorage.setItem(DEV_MODE_STORAGE_KEY, String(enabled));
    // Notify other components in this window that read devMode.
    window.dispatchEvent(new Event('whisperall:devMode'));
  }, []);

  const toggleDevMode = useCallback(() => {
    setDevMode(!devMode);
  }, [devMode, setDevMode]);

  // Keep in sync if another window/tab changes devMode.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== DEV_MODE_STORAGE_KEY) return;
      setDevModeState(readStoredDevMode());
    };
    const onEvent = () => setDevModeState(readStoredDevMode());

    window.addEventListener('storage', onStorage);
    window.addEventListener('whisperall:devMode', onEvent);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('whisperall:devMode', onEvent);
    };
  }, []);

  const value = useMemo<DevModeContextValue>(() => ({
    devMode,
    setDevMode,
    toggleDevMode,
  }), [devMode, setDevMode, toggleDevMode]);

  return <DevModeContext.Provider value={value}>{children}</DevModeContext.Provider>;
}

export function useDevMode(): DevModeContextValue {
  const ctx = useContext(DevModeContext);
  if (!ctx) {
    throw new Error('useDevMode must be used within a DevModeProvider');
  }
  return ctx;
}

