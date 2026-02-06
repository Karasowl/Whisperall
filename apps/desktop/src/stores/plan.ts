import { create } from 'zustand';
import type { UserPlan, UsageRecord } from '@whisperall/api-client';
import { getSupabase } from '../lib/supabase';
import { useAuthStore } from './auth';

const PLAN_LIMITS: Record<UserPlan, UsageRecord> = {
  free: { stt_seconds: 1800, tts_chars: 50_000, translate_chars: 50_000, transcribe_seconds: 600, ai_edit_tokens: 50_000 },
  basic: { stt_seconds: 36_000, tts_chars: 500_000, translate_chars: 500_000, transcribe_seconds: 18_000, ai_edit_tokens: 500_000 },
  pro: { stt_seconds: 108_000, tts_chars: 2_000_000, translate_chars: 2_000_000, transcribe_seconds: 108_000, ai_edit_tokens: 2_000_000 },
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
};

export const usePlanStore = create<PlanState>((set, get) => ({
  plan: 'free',
  usage: { ...EMPTY_USAGE },
  loading: false,

  fetch: async () => {
    const user = useAuthStore.getState().user;
    const sb = getSupabase();
    if (!user || !sb) return;

    set({ loading: true });

    let plan: UserPlan = 'free';
    const profileRes = await sb.from('profiles').select('plan').eq('id', user.id).maybeSingle();
    if (profileRes.data) {
      plan = profileRes.data.plan as UserPlan;
    }

    let usage = { ...EMPTY_USAGE };
    const month = new Date().toISOString().slice(0, 7) + '-01';
    const usageRes = await sb.from('usage').select('*').eq('user_id', user.id).eq('month', month).maybeSingle();
    if (usageRes.data) {
      usage = {
        stt_seconds: usageRes.data.stt_seconds ?? 0,
        tts_chars: usageRes.data.tts_chars ?? 0,
        translate_chars: usageRes.data.translate_chars ?? 0,
        transcribe_seconds: usageRes.data.transcribe_seconds ?? 0,
        ai_edit_tokens: usageRes.data.ai_edit_tokens ?? 0,
      };
    }

    set({ plan, usage, loading: false });
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
