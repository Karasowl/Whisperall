import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock supabase before importing store
vi.mock('../../src/lib/supabase', () => ({
  getSupabase: vi.fn(),
}));

vi.mock('../../src/lib/api', () => ({
  setApiToken: vi.fn(),
}));

import { useAuthStore } from '../../src/stores/auth';
import { getSupabase } from '../../src/lib/supabase';
import { setApiToken } from '../../src/lib/api';

const mockGetSupabase = vi.mocked(getSupabase);
const mockSetApiToken = vi.mocked(setApiToken);

describe('Auth store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset store state
    useAuthStore.setState({
      user: null,
      session: null,
      loading: true,
      error: null,
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

  it('signInWithGoogle calls signInWithOAuth', async () => {
    const mockSb = {
      auth: {
        signInWithOAuth: vi.fn().mockResolvedValue({ error: null }),
      },
    };
    mockGetSupabase.mockReturnValue(mockSb as any);

    await useAuthStore.getState().signInWithGoogle();

    expect(mockSb.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: undefined },
    });
    expect(useAuthStore.getState().loading).toBe(false);
  });

  it('signInWithGoogle sets error on failure', async () => {
    const mockSb = {
      auth: {
        signInWithOAuth: vi.fn().mockResolvedValue({
          error: { message: 'Google auth failed' },
        }),
      },
    };
    mockGetSupabase.mockReturnValue(mockSb as any);

    await useAuthStore.getState().signInWithGoogle();

    expect(useAuthStore.getState().error).toBe('Google auth failed');
    expect(useAuthStore.getState().loading).toBe(false);
  });

  it('signInWithGoogle sets error when supabase not configured', async () => {
    mockGetSupabase.mockReturnValue(null);

    await useAuthStore.getState().signInWithGoogle();

    expect(useAuthStore.getState().error).toBe('Supabase not configured');
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
