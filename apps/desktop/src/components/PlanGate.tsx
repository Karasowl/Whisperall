import type { ReactNode } from 'react';
import { useAuthStore } from '../stores/auth';
import { usePlanStore } from '../stores/plan';
import { UpgradePrompt } from './UpgradePrompt';
import type { UsageRecord } from '@whisperall/api-client';

type PlanGateProps = {
  resource: keyof UsageRecord;
  children: ReactNode;
};

export function PlanGate({ resource, children }: PlanGateProps) {
  const user = useAuthStore((s) => s.user);
  const isOverLimit = usePlanStore((s) => s.isOverLimit);

  // No gate if not signed in (features work without auth for offline/dev)
  if (!user) return <>{children}</>;

  if (isOverLimit(resource)) {
    return <UpgradePrompt resource={resource} />;
  }

  return <>{children}</>;
}
