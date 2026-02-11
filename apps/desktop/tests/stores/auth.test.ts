import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock supabase before importing store
vi.mock('../../src/lib/supabase', () => ({
  getSupabase: vi.fn(),
}));

vi.mock('../../src/lib/api', () => ({
  setApiToken: vi.fn(),
}));

const { mockElectronBridge, mockIsElectron } = vi.hoisted(() => ({
  mockElectronBridge: {
    openExternal: vi.fn(),
    onAuthCallback: vi.fn(),
  },
  mockIsElectron: vi.fn(() => false),
}));

vi.mock('../../src/lib/electron', () => ({
  electron: mockElectronBridge,
  isElectron: () => mockIsElectron(),
}));

import { useAuthStore } from '../../src/stores/auth';
import { getSupabase } from '../../src/lib/supabase';
import { setApiToken } from '../../src/lib/api';

const mockGetSupabase = vi.mocked(getSupabase);
const mockSetApiToken = vi.mocked(setApiToken);

describe('Auth store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsElectron.mockReturnValue(false);
    mockElectronBridge.openExternal.mockReset();
    mockElectronBridge.onAuthCallback.mockReset();
    // Reset store state
    useAuthStore.setState({
      user: null,
      session: null,
      loading: true,
      error: null,
      signUpSuccess: false,
      signUpEmail: null,
    });
  });

  it('starts with loading=true and no user', () => {
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.session).toBeNull();
    expect(state.loading).toBe(true);
  });

  it('init sets loading=false when supabase not configured', async () => {
    mockGetSupabase.mockReturnValue(null);
    await useAuthStore.getState().init();
    expect(useAuthStore.getState().loading).toBe(false);
  });

  it('init loads existing session', async () => {
    const mockSession = {
      access_token: 'test-token',
      user: { id: 'u1', email: 'test@test.com' },
    };
    const mockSb = {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: mockSession } }),
        onAuthStateChange: vi.fn(),
      },
    };
    mockGetSupabase.mockReturnValue(mockSb as any);

    await useAuthStore.getState().init();

    expect(useAuthStore.getState().loading).toBe(false);
    expect(useAuthStore.getState().session).toBe(mockSession);
    expect(mockSetApiToken).toHaveBeenCalledWith('test-token');
  });

  it('init handles Electron OAuth token callback hash', async () => {
    mockIsElectron.mockReturnValue(true);
    let callback: ((url: string) => void | Promise<void>) | null = null;
    mockElectronBridge.onAuthCallback.mockImplementation((fn: (url: string) => void | Promise<void>) => {
      callback = fn;
      return vi.fn();
    });

    const newSession = {
      access_token: 'tok-new',
      user: { id: 'u3', email: 'oauth@test.com' },
    };
    const mockSb = {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
        onAuthStateChange: vi.fn(),
        setSession: vi.fn().mockResolvedValue({ data: { session: newSession }, error: null }),
        exchangeCodeForSession: vi.fn(),
      },
    };
    mockGetSupabase.mockReturnValue(mockSb as any);

    await useAuthStore.getState().init();
    await callback?.('whisperall://auth/callback#access_token=acc123&refresh_token=ref456');

    expect(mockSb.auth.setSession).toHaveBeenCalledWith({ access_token: 'acc123', refresh_token: 'ref456' });
    expect(useAuthStore.getState().session?.access_token).toBe('tok-new');
  });

  it('init handles Electron OAuth code callback query', async () => {
    mockIsElectron.mockReturnValue(true);
    let callback: ((url: string) => void | Promise<void>) | null = null;
    mockElectronBridge.onAuthCallback.mockImplementation((fn: (url: string) => void | Promise<void>) => {
      callback = fn;
      return vi.fn();
    });

    const newSession = {
      access_token: 'tok-from-code',
      user: { id: 'u4', email: 'pkce@test.com' },
    };
    const mockSb = {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
        onAuthStateChange: vi.fn(),
        setSession: vi.fn(),
        exchangeCodeForSession: vi.fn().mockResolvedValue({ data: { session: newSession }, error: null }),
      },
    };
    mockGetSupabase.mockReturnValue(mockSb as any);

    await useAuthStore.getState().init();
    await callback?.('whisperall://auth/callback?code=pkce-code-123');

    expect(mockSb.auth.exchangeCodeForSession).toHaveBeenCalledWith('pkce-code-123');
    expect(useAuthStore.getState().session?.access_token).toBe('tok-from-code');
  });

  it('setSession updates user and token', () => {
    const session = {
      access_token: 'tok-abc',
      user: { id: 'u2', email: 'a@b.com' },
    };
    useAuthStore.getState().setSession(session as any);

    expect(useAuthStore.getState().user?.id).toBe('u2');
    expect(useAuthStore.getState().session?.access_token).toBe('tok-abc');
    expect(mockSetApiToken).toHaveBeenCalledWith('tok-abc');
  });

  it('setSession with null clears user and token', () => {
    useAuthStore.getState().setSession(null);
    expect(useAuthStore.getState().user).toBeNull();
    expect(mockSetApiToken).toHaveBeenCalledWith(undefined);
  });

  it('signIn sets error on failure', async () => {
    const mockSb = {
      auth: {
        signInWithPassword: vi.fn().mockResolvedValue({
          error: { message: 'Invalid credentials' },
        }),
      },
    };
    mockGetSupabase.mockReturnValue(mockSb as any);

    await useAuthStore.getState().signIn('bad@test.com', 'wrong');

    expect(useAuthStore.getState().error).toBe('Invalid credentials');
    expect(useAuthStore.getState().loading).toBe(false);
  });

  it('signIn clears error on success', async () => {
    const mockSb = {
      auth: {
        signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
      },
    };
    mockGetSupabase.mockReturnValue(mockSb as any);

    useAuthStore.setState({ error: 'old error' });
    await useAuthStore.getState().signIn('ok@test.com', 'pass');

    expect(useAuthStore.getState().error).toBeNull();
    expect(useAuthStore.getState().loading).toBe(false);
  });

  it('signUp sets signUpSuccess and email on success', async () => {
    const mockSb = {
      auth: { signUp: vi.fn().mockResolvedValue({ error: null }) },
    };
    mockGetSupabase.mockReturnValue(mockSb as any);

    await useAuthStore.getState().signUp('new@test.com', 'pass123');

    const state = useAuthStore.getState();
    expect(state.signUpSuccess).toBe(true);
    expect(state.signUpEmail).toBe('new@test.com');
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });

  it('signUp sets error on failure', async () => {
    const mockSb = {
      auth: { signUp: vi.fn().mockResolvedValue({ error: { message: 'User already registered' } }) },
    };
    mockGetSupabase.mockReturnValue(mockSb as any);

    await useAuthStore.getState().signUp('dup@test.com', 'pass123');

    const state = useAuthStore.getState();
    expect(state.signUpSuccess).toBe(false);
    expect(state.error).toBe('User already registered');
    expect(state.loading).toBe(false);
  });

  it('signInWithGoogle opens external browser in Electron', async () => {
    mockIsElectron.mockReturnValue(true);
    const mockSb = {
      auth: {
        signInWithOAuth: vi.fn().mockResolvedValue({
          data: { url: 'https://oauth.example.com/start' },
          error: null,
        }),
      },
    };
    mockGetSupabase.mockReturnValue(mockSb as any);

    await useAuthStore.getState().signInWithGoogle();

    expect(mockSb.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: 'whisperall://auth/callback', skipBrowserRedirect: true },
    });
    expect(mockElectronBridge.openExternal).toHaveBeenCalledWith('https://oauth.example.com/start');
    expect(useAuthStore.getState().error).toBeNull();
    expect(useAuthStore.getState().loading).toBe(false);
  });

  it('signInWithGoogle shows error when opening browser fails', async () => {
    mockIsElectron.mockReturnValue(true);
    mockElectronBridge.openExternal.mockRejectedValue(new Error('blocked'));
    const mockSb = {
      auth: {
        signInWithOAuth: vi.fn().mockResolvedValue({
          data: { url: 'https://oauth.example.com/start' },
          error: null,
        }),
      },
    };
    mockGetSupabase.mockReturnValue(mockSb as any);

    await useAuthStore.getState().signInWithGoogle();

    expect(useAuthStore.getState().error).toBe('Could not open browser for Google sign-in');
    expect(useAuthStore.getState().loading).toBe(false);
  });

  it('clearSignUpSuccess resets signup state', () => {
    useAuthStore.setState({ signUpSuccess: true, signUpEmail: 'a@b.com', error: 'old' });
    useAuthStore.getState().clearSignUpSuccess();

    const state = useAuthStore.getState();
    expect(state.signUpSuccess).toBe(false);
    expect(state.signUpEmail).toBeNull();
    expect(state.error).toBeNull();
  });

  it('signOut clears user and session', async () => {
    const mockSb = {
      auth: { signOut: vi.fn().mockResolvedValue({}) },
    };
    mockGetSupabase.mockReturnValue(mockSb as any);

    useAuthStore.setState({
      user: { id: 'u1' } as any,
      session: { access_token: 'tok' } as any,
    });

    await useAuthStore.getState().signOut();

    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().session).toBeNull();
    expect(mockSetApiToken).toHaveBeenCalledWith(undefined);
  });
});
