import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockAuthGetState, mockGetSupabase } = vi.hoisted(() => ({
  mockAuthGetState: vi.fn(() => ({ session: null, user: null })),
  mockGetSupabase: vi.fn(() => null),
}));

vi.mock('../../src/lib/api', () => ({
  api: {
    usage: {
      get: vi.fn(),
    },
  },
  setApiToken: vi.fn(),
}));

vi.mock('../../src/lib/supabase', () => ({
  getSupabase: mockGetSupabase,
}));

vi.mock('../../src/stores/auth', () => ({
  useAuthStore: {
    getState: () => mockAuthGetState(),
  },
}));

import { usePlanStore } from '../../src/stores/plan';
import { api, setApiToken } from '../../src/lib/api';
import { getSupabase } from '../../src/lib/supabase';

const mockUsageGet = vi.mocked(api.usage.get);
const mockSetApiToken = vi.mocked(setApiToken);
const mockGetSupabaseFn = vi.mocked(getSupabase);

const EMPTY_USAGE = {
  stt_seconds: 0,
  tts_chars: 0,
  translate_chars: 0,
  transcribe_seconds: 0,
  ai_edit_tokens: 0,
  notes_count: 0,
  storage_bytes: 0,
};

function resetStore() {
  usePlanStore.setState({
    plan: 'free',
    usage: { ...EMPTY_USAGE },
    loading: false,
  });
}

describe('Plan store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthGetState.mockReturnValue({ session: null, user: null });
    mockGetSupabaseFn.mockReturnValue(null);
    resetStore();
  });

  describe('initial state', () => {
    it('starts with free plan and zero usage', () => {
      const s = usePlanStore.getState();
      expect(s.plan).toBe('free');
      expect(s.usage).toEqual(EMPTY_USAGE);
      expect(s.loading).toBe(false);
    });
  });

  describe('getLimit', () => {
    it('returns free plan limits by default', () => {
      expect(usePlanStore.getState().getLimit('stt_seconds')).toBe(1800);
      expect(usePlanStore.getState().getLimit('tts_chars')).toBe(50_000);
      expect(usePlanStore.getState().getLimit('notes_count')).toBe(50);
      expect(usePlanStore.getState().getLimit('storage_bytes')).toBe(2 * 1024 * 1024 * 1024);
    });

    it('returns basic plan limits when plan is basic', () => {
      usePlanStore.setState({ plan: 'basic' });
      expect(usePlanStore.getState().getLimit('stt_seconds')).toBe(36_000);
      expect(usePlanStore.getState().getLimit('notes_count')).toBe(200);
      expect(usePlanStore.getState().getLimit('storage_bytes')).toBe(25 * 1024 * 1024 * 1024);
    });

    it('returns pro plan limits when plan is pro', () => {
      usePlanStore.setState({ plan: 'pro' });
      expect(usePlanStore.getState().getLimit('stt_seconds')).toBe(108_000);
      expect(usePlanStore.getState().getLimit('notes_count')).toBe(1000);
      expect(usePlanStore.getState().getLimit('storage_bytes')).toBe(150 * 1024 * 1024 * 1024);
    });
  });

  describe('isOverLimit', () => {
    it('returns false when under limit', () => {
      expect(usePlanStore.getState().isOverLimit('stt_seconds')).toBe(false);
    });

    it('returns true when at limit', () => {
      usePlanStore.setState({ usage: { ...EMPTY_USAGE, stt_seconds: 1800 } });
      expect(usePlanStore.getState().isOverLimit('stt_seconds')).toBe(true);
    });

    it('returns true when over limit', () => {
      usePlanStore.setState({ usage: { ...EMPTY_USAGE, stt_seconds: 2000 } });
      expect(usePlanStore.getState().isOverLimit('stt_seconds')).toBe(true);
    });
  });

  describe('usagePercent', () => {
    it('returns 0 for zero usage', () => {
      expect(usePlanStore.getState().usagePercent('stt_seconds')).toBe(0);
    });

    it('returns 50 for half usage', () => {
      usePlanStore.setState({ usage: { ...EMPTY_USAGE, stt_seconds: 900 } });
      expect(usePlanStore.getState().usagePercent('stt_seconds')).toBe(50);
    });

    it('caps at 100', () => {
      usePlanStore.setState({ usage: { ...EMPTY_USAGE, stt_seconds: 3600 } });
      expect(usePlanStore.getState().usagePercent('stt_seconds')).toBe(100);
    });
  });

  describe('getUsed', () => {
    it('returns current usage value', () => {
      usePlanStore.setState({ usage: { ...EMPTY_USAGE, tts_chars: 12345 } });
      expect(usePlanStore.getState().getUsed('tts_chars')).toBe(12345);
    });
  });

  describe('fetch', () => {
    it('syncs API token from auth session before fetching usage', async () => {
      mockAuthGetState.mockReturnValue({
        session: { access_token: 'session-token-123' },
        user: { id: 'u1' },
      });
      mockUsageGet.mockResolvedValue({
        plan: 'free',
        usage: { ...EMPTY_USAGE },
        limits: {
          stt_seconds: 1800,
          tts_chars: 50_000,
          translate_chars: 50_000,
          transcribe_seconds: 600,
          ai_edit_tokens: 50_000,
          notes_count: 50,
          storage_bytes: 2 * 1024 * 1024 * 1024,
        },
      });

      await usePlanStore.getState().fetch();

      expect(mockSetApiToken).toHaveBeenCalledWith('session-token-123');
      expect(usePlanStore.getState().loading).toBe(false);
    });

    it('fetches plan and usage from API', async () => {
      mockUsageGet.mockResolvedValue({
        plan: 'basic',
        usage: {
          stt_seconds: 500,
          tts_chars: 100,
          translate_chars: 0,
          transcribe_seconds: 0,
          ai_edit_tokens: 0,
          notes_count: 3,
          storage_bytes: 2048,
        },
        limits: {
          stt_seconds: 36_000,
          tts_chars: 500_000,
          translate_chars: 500_000,
          transcribe_seconds: 18_000,
          ai_edit_tokens: 500_000,
          notes_count: 200,
          storage_bytes: 25 * 1024 * 1024 * 1024,
        },
      });

      await usePlanStore.getState().fetch();

      expect(usePlanStore.getState().plan).toBe('basic');
      expect(usePlanStore.getState().usage.stt_seconds).toBe(500);
      expect(usePlanStore.getState().usage.notes_count).toBe(3);
      expect(usePlanStore.getState().usage.storage_bytes).toBe(2048);
      expect(usePlanStore.getState().loading).toBe(false);
    });

    it('falls back to Supabase profiles.plan when API fails', async () => {
      mockUsageGet.mockRejectedValue(new Error('Network error'));
      mockAuthGetState.mockReturnValue({
        session: { access_token: 'session-token-123' },
        user: { id: 'u1' },
      });
      const maybeSingle = vi.fn().mockResolvedValue({ data: { plan: 'basic' } });
      const eq = vi.fn(() => ({ maybeSingle }));
      const select = vi.fn(() => ({ eq }));
      const from = vi.fn(() => ({ select }));
      mockGetSupabaseFn.mockReturnValue({ from } as any);

      await usePlanStore.getState().fetch();

      expect(from).toHaveBeenCalledWith('profiles');
      expect(select).toHaveBeenCalledWith('plan');
      expect(eq).toHaveBeenCalledWith('id', 'u1');
      expect(usePlanStore.getState().plan).toBe('basic');
      expect(usePlanStore.getState().loading).toBe(false);
    });

    it('stays free when API fails', async () => {
      mockUsageGet.mockRejectedValue(new Error('Network error'));

      await usePlanStore.getState().fetch();

      expect(usePlanStore.getState().plan).toBe('free');
      expect(usePlanStore.getState().usage).toEqual(EMPTY_USAGE);
      expect(usePlanStore.getState().loading).toBe(false);
    });

    it('defaults to free plan when API returns free', async () => {
      mockUsageGet.mockResolvedValue({
        plan: 'free',
        usage: { ...EMPTY_USAGE },
        limits: {
          stt_seconds: 1800,
          tts_chars: 50_000,
          translate_chars: 50_000,
          transcribe_seconds: 600,
          ai_edit_tokens: 50_000,
          notes_count: 50,
          storage_bytes: 2 * 1024 * 1024 * 1024,
        },
      });

      await usePlanStore.getState().fetch();

      expect(usePlanStore.getState().plan).toBe('free');
      expect(usePlanStore.getState().usage).toEqual(EMPTY_USAGE);
    });
  });
});
