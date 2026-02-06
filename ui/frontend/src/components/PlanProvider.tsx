'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_PLAN,
  PLAN_STORAGE_KEY,
  getStoredPlan,
  isPlanAtLeast,
  setStoredPlan,
  type PlanTier,
} from '@/lib/entitlements';

export interface PlanContextValue {
  plan: PlanTier;
  setPlan: (plan: PlanTier) => void;
  isFree: boolean;
  isStandard: boolean;
  isPro: boolean;
  hasStandard: boolean;
  hasPro: boolean;
}

const PlanContext = createContext<PlanContextValue | null>(null);

export function PlanProvider({ children }: { children: React.ReactNode }) {
  const [plan, setPlanState] = useState<PlanTier>(() => DEFAULT_PLAN);

  // Initialize from localStorage on mount (client-only).
  useEffect(() => {
    setPlanState(getStoredPlan());
  }, []);

  const setPlan = useCallback((next: PlanTier) => {
    setPlanState(next);
    setStoredPlan(next);
    // Notify other components in this window that read plan from localStorage.
    window.dispatchEvent(new Event('whisperall:plan'));
  }, []);

  // Keep in sync if plan changes elsewhere (e.g. another tab/window or a settings action).
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== PLAN_STORAGE_KEY) return;
      setPlanState(getStoredPlan());
    };

    const onPlanEvent = () => {
      setPlanState(getStoredPlan());
    };

    window.addEventListener('storage', onStorage);
    window.addEventListener('whisperall:plan', onPlanEvent);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('whisperall:plan', onPlanEvent);
    };
  }, []);

  const value = useMemo<PlanContextValue>(() => {
    const isFree = plan === 'free';
    const isStandard = plan === 'standard';
    const isPro = plan === 'pro';
    return {
      plan,
      setPlan,
      isFree,
      isStandard,
      isPro,
      hasStandard: isPlanAtLeast(plan, 'standard'),
      hasPro: isPlanAtLeast(plan, 'pro'),
    };
  }, [plan, setPlan]);

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export function usePlan(): PlanContextValue {
  const ctx = useContext(PlanContext);
  if (!ctx) {
    throw new Error('usePlan must be used within a PlanProvider');
  }
  return ctx;
}

