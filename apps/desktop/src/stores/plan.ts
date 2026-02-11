import { create } from 'zustand';
import type { UserPlan, UsageRecord } from '@whisperall/api-client';
import { api, setApiToken } from '../lib/api';
import { getSupabase } from '../lib/supabase';
import { useAuthStore } from './auth';

const PLAN_LIMITS: Record<UserPlan, UsageRecord> = {
  free: { stt_seconds: 1800, tts_chars: 50_000, translate_chars: 50_000, transcribe_seconds: 600, ai_edit_tokens: 50_000, notes_count: 50 },
  basic: { stt_seconds: 36_000, tts_chars: 500_000, translate_chars: 500_000, transcribe_seconds: 18_000, ai_edit_tokens: 500_000, notes_count: 200 },
  pro: { stt_seconds: 108_000, tts_chars: 2_000_000, translate_chars: 2_000_000, transcribe_seconds: 108_000, ai_edit_tokens: 2_000_000, notes_count: 1000 },
};

export type PlanState = {
  plan: UserPlan;
  usage: UsageRecord;
  loading: boolean;

  fetch: () => Promise<void>;
  getLimit: (resource: keyof UsageRecord) => number;
  getUsed: (resource: keyof UsageRecord) => number;
  isOverLimit: (resource: keyof UsageRecord) => boolean;
  usagePercent: (resource: keyof UsageRecord) => number;
};

const EMPTY_USAGE: UsageRecord = {
  stt_seconds: 0,
  tts_chars: 0,
  translate_chars: 0,
  transcribe_seconds: 0,
  ai_edit_tokens: 0,
  notes_count: 0,
};

function normalizePlan(value: unknown): UserPlan {
  if (value === 'basic' || value === 'pro') return value;
  return 'free';
}

export const PLAN_REFRESH_DEBOUNCE_MS = 1200;
let planRefreshTimer: ReturnType<typeof setTimeout> | null = null;
let planRefreshInFlight = false;
let planRefreshQueued = false;

export const usePlanStore = create<PlanState>((set, get) => ({
  plan: 'free',
  usage: { ...EMPTY_USAGE },
  loading: false,

  fetch: async () => {
    set({ loading: true });
    const sessionToken = useAuthStore.getState().session?.access_token;
    if (sessionToken) setApiToken(sessionToken);
    try {
      const res = await api.usage.get();
      set({
        plan: res.plan,
        usage: res.usage,
        loading: false,
      });
    } catch {
      const userId = useAuthStore.getState().user?.id;
      const sb = getSupabase();
      if (sb && userId) {
        try {
          const { data } = await sb.from('profiles').select('plan').eq('id', userId).maybeSingle();
          if (data?.plan) {
            set({ plan: normalizePlan(data.plan), loading: false });
            return;
          }
        } catch {
          // ignore fallback failures and keep current state
        }
      }
      set({ loading: false });
    }
  },

  getLimit: (resource) => PLAN_LIMITS[get().plan][resource],
  getUsed: (resource) => get().usage[resource],
  isOverLimit: (resource) => get().usage[resource] >= PLAN_LIMITS[get().plan][resource],
  usagePercent: (resource) => {
    const limit = PLAN_LIMITS[get().plan][resource];
    if (limit === 0) return 0;
    return Math.min(100, Math.round((get().usage[resource] / limit) * 100));
  },
}));

async function runPlanRefresh(): Promise<void> {
  if (planRefreshInFlight) {
    planRefreshQueued = true;
    return;
  }
  planRefreshInFlight = true;
  try {
    await usePlanStore.getState().fetch();
  } finally {
    planRefreshInFlight = false;
    if (planRefreshQueued) {
      planRefreshQueued = false;
      void runPlanRefresh();
    }
  }
}

export function refreshPlanUsageNow(): void {
  if (planRefreshTimer) {
    clearTimeout(planRefreshTimer);
    planRefreshTimer = null;
  }
  void runPlanRefresh();
}

export function requestPlanRefresh(delayMs = PLAN_REFRESH_DEBOUNCE_MS): void {
  if (planRefreshTimer) clearTimeout(planRefreshTimer);
  planRefreshTimer = setTimeout(() => {
    planRefreshTimer = null;
    void runPlanRefresh();
  }, Math.max(0, delayMs));
}
