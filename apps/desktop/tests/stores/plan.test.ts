import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/lib/supabase', () => ({
  getSupabase: vi.fn().mockReturnValue(null),
}));

vi.mock('../../src/lib/api', () => ({
  setApiToken: vi.fn(),
}));

import { usePlanStore } from '../../src/stores/plan';
import { useAuthStore } from '../../src/stores/auth';
import { getSupabase } from '../../src/lib/supabase';

const mockGetSupabase = vi.mocked(getSupabase);

const EMPTY_USAGE = {
  stt_seconds: 0,
  tts_chars: 0,
  translate_chars: 0,
  transcribe_seconds: 0,
  ai_edit_tokens: 0,
};

function resetStores() {
  usePlanStore.setState({
    plan: 'free',
    usage: { ...EMPTY_USAGE },
    loading: false,
  });
  useAuthStore.setState({
    user: null,
    session: null,
    loading: false,
    error: null,
  });
}

describe('Plan store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStores();
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
    });

    it('returns basic plan limits when plan is basic', () => {
      usePlanStore.setState({ plan: 'basic' });
      expect(usePlanStore.getState().getLimit('stt_seconds')).toBe(36_000);
    });

    it('returns pro plan limits when plan is pro', () => {
      usePlanStore.setState({ plan: 'pro' });
      expect(usePlanStore.getState().getLimit('stt_seconds')).toBe(108_000);
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
    it('does nothing when no user', async () => {
      await usePlanStore.getState().fetch();
      expect(usePlanStore.getState().plan).toBe('free');
    });

    it('does nothing when no supabase', async () => {
      useAuthStore.setState({ user: { id: 'u1' } as any });
      mockGetSupabase.mockReturnValue(null);

      await usePlanStore.getState().fetch();
      expect(usePlanStore.getState().plan).toBe('free');
    });

    it('fetches plan and usage from supabase', async () => {
      useAuthStore.setState({ user: { id: 'u1' } as any });

      const mockSb = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { plan: 'basic' } }),
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { stt_seconds: 500, tts_chars: 100, translate_chars: 0, transcribe_seconds: 0, ai_edit_tokens: 0 },
                }),
              }),
            }),
          }),
        }),
      };
      mockGetSupabase.mockReturnValue(mockSb as any);

      await usePlanStore.getState().fetch();

      expect(usePlanStore.getState().plan).toBe('basic');
      expect(usePlanStore.getState().usage.stt_seconds).toBe(500);
      expect(usePlanStore.getState().loading).toBe(false);
    });

    it('defaults to free plan when profile not found', async () => {
      useAuthStore.setState({ user: { id: 'u1' } as any });

      const mockSb = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null }),
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null }),
              }),
            }),
          }),
        }),
      };
      mockGetSupabase.mockReturnValue(mockSb as any);

      await usePlanStore.getState().fetch();

      expect(usePlanStore.getState().plan).toBe('free');
      expect(usePlanStore.getState().usage).toEqual(EMPTY_USAGE);
    });
  });
});
