import { create } from 'zustand';
import type { User, Session } from '@supabase/supabase-js';
import { getSupabase } from '../lib/supabase';
import { setApiToken } from '../lib/api';
import { electron, isElectron } from '../lib/electron';

export type AuthState = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  error: string | null;
  signUpSuccess: boolean;
  signUpEmail: string | null;

  init: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  setSession: (session: Session | null) => void;
  clearSignUpSuccess: () => void;
};

/** Parse access_token + refresh_token from a callback URL hash fragment */
function parseTokensFromUrl(url: string): { access_token: string; refresh_token: string } | null {
  try {
    // Supabase appends tokens as hash: whisperall://auth/callback#access_token=...&refresh_token=...
    const hash = url.includes('#') ? url.split('#')[1] : '';
    const params = new URLSearchParams(hash);
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    if (access_token && refresh_token) return { access_token, refresh_token };
  } catch { /* malformed URL */ }
  return null;
}

/** Parse OAuth code from callback URL query/hash (PKCE flow) */
function parseCodeFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const codeFromQuery = parsed.searchParams.get('code');
    if (codeFromQuery) return codeFromQuery;
    const hash = parsed.hash.startsWith('#') ? parsed.hash.slice(1) : parsed.hash;
    const codeFromHash = new URLSearchParams(hash).get('code');
    if (codeFromHash) return codeFromHash;
  } catch {
    // Ignore malformed callback URLs
  }
  return null;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  loading: true,
  error: null,
  signUpSuccess: false,
  signUpEmail: null,

  init: async () => {
    const sb = getSupabase();
    if (!sb) {
      set({ loading: false });
      return;
    }

    try {
      const { data } = await sb.auth.getSession();
      if (data.session) {
        get().setSession(data.session);
      }
    } catch (err) {
      console.error('Auth init failed:', err);
    }
    set({ loading: false });

    sb.auth.onAuthStateChange((_event, session) => {
      get().setSession(session);
    });

    // Listen for OAuth deep link callback from Electron main process
    if (isElectron() && electron?.onAuthCallback) {
      electron.onAuthCallback(async (url) => {
        const tokens = parseTokensFromUrl(url);
        if (tokens) {
          const { data: sessionData, error } = await sb.auth.setSession(tokens);
          if (error) {
            set({ error: error.message });
          } else if (sessionData.session) {
            get().setSession(sessionData.session);
          }
          return;
        }

        const code = parseCodeFromUrl(url);
        if (!code) return;
        const { data: exchangeData, error: exchangeError } = await sb.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          set({ error: exchangeError.message });
        } else if (exchangeData.session) {
          get().setSession(exchangeData.session);
        }
      });
    }
  },

  signIn: async (email, password) => {
    const sb = getSupabase();
    if (!sb) { set({ error: 'Supabase not configured' }); return; }
    set({ loading: true, error: null });
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) {
      set({ loading: false, error: error.message });
    } else {
      set({ loading: false });
    }
  },

  signUp: async (email, password) => {
    const sb = getSupabase();
    if (!sb) { set({ error: 'Supabase not configured' }); return; }
    set({ loading: true, error: null, signUpSuccess: false });
    const redirectTo = isElectron() ? 'whisperall://auth/callback' : (typeof window !== 'undefined' ? window.location.origin : '');
    const { error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } });
    if (error) {
      set({ loading: false, error: error.message });
    } else {
      set({ loading: false, signUpSuccess: true, signUpEmail: email });
    }
  },

  signInWithGoogle: async () => {
    const sb = getSupabase();
    if (!sb) { set({ error: 'Supabase not configured' }); return; }
    set({ loading: true, error: null });
    const isDesktop = isElectron();
    const redirectTo = isDesktop
      ? 'whisperall://auth/callback'
      : (typeof window !== 'undefined' ? window.location.origin : '');
    const { data, error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: isDesktop },
    });
    if (error) {
      set({ loading: false, error: error.message });
    } else if (isDesktop && data?.url && electron?.openExternal) {
      try {
        await electron.openExternal(data.url);
        set({ loading: false });
      } catch {
        set({ loading: false, error: 'Could not open browser for Google sign-in' });
      }
    } else {
      set({ loading: false });
    }
  },

  signOut: async () => {
    const sb = getSupabase();
    if (!sb) return;
    await sb.auth.signOut();
    set({ user: null, session: null });
    setApiToken(undefined);
  },

  clearSignUpSuccess: () => set({ signUpSuccess: false, signUpEmail: null, error: null }),

  setSession: (session) => {
    set({ user: session?.user ?? null, session });
    setApiToken(session?.access_token);
  },
}));
