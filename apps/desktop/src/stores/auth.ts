import { create } from 'zustand';
import type { User, Session } from '@supabase/supabase-js';
import { getSupabase } from '../lib/supabase';
import { setApiToken } from '../lib/api';

export type AuthState = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  error: string | null;

  init: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  setSession: (session: Session | null) => void;
};

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  loading: true,
  error: null,

  init: async () => {
    const sb = getSupabase();
    if (!sb) {
      set({ loading: false });
      return;
    }

    const { data } = await sb.auth.getSession();
    if (data.session) {
      get().setSession(data.session);
    }
    set({ loading: false });

    sb.auth.onAuthStateChange((_event, session) => {
      get().setSession(session);
    });
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
    set({ loading: true, error: null });
    const { error } = await sb.auth.signUp({ email, password });
    if (error) {
      set({ loading: false, error: error.message });
    } else {
      set({ loading: false });
    }
  },

  signInWithGoogle: async () => {
    const sb = getSupabase();
    if (!sb) { set({ error: 'Supabase not configured' }); return; }
    set({ loading: true, error: null });
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined },
    });
    if (error) {
      set({ loading: false, error: error.message });
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

  setSession: (session) => {
    set({ user: session?.user ?? null, session });
    setApiToken(session?.access_token);
  },
}));
