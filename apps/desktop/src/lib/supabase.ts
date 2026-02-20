import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { electron, isElectron } from './electron';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const AUTH_STORAGE_KEY = 'whisperall-auth-v1';

let client: SupabaseClient | null = null;

type AuthStorageAdapter = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

function getElectronAuthStorage(): AuthStorageAdapter | undefined {
  if (!isElectron()) return undefined;
  const bridge = electron;
  if (!bridge?.getAuthStorageItem || !bridge?.setAuthStorageItem || !bridge?.removeAuthStorageItem) return undefined;
  return {
    getItem: (key) => bridge.getAuthStorageItem(key),
    setItem: (key, value) => bridge.setAuthStorageItem(key, value),
    removeItem: (key) => bridge.removeAuthStorageItem(key),
  };
}

function getBrowserAuthStorage(): AuthStorageAdapter | undefined {
  if (typeof window === 'undefined' || !window.localStorage) return undefined;
  return {
    getItem: async (key) => window.localStorage.getItem(key),
    setItem: async (key, value) => { window.localStorage.setItem(key, value); },
    removeItem: async (key) => { window.localStorage.removeItem(key); },
  };
}

function resolveAuthStorage(): AuthStorageAdapter | undefined {
  return getElectronAuthStorage() ?? getBrowserAuthStorage();
}

export function getSupabase(): SupabaseClient | null {
  if (client) return client;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const storage = resolveAuthStorage();
  client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      storageKey: AUTH_STORAGE_KEY,
      storage,
      persistSession: !!storage,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return client;
}
