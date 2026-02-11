import type { ReactNode } from 'react';
import { useAuthStore } from '../stores/auth';
import { usePlanStore } from '../stores/plan';
import { UpgradePrompt } from './UpgradePrompt';
import type { UsageRecord } from '@whisperall/api-client';

type Props = { resource: keyof UsageRecord; children: ReactNode };

export function PlanGate({ resource, children }: Props) {
  const user = useAuthStore((s) => s.user);
  const isOverLimit = usePlanStore((s) => s.isOverLimit);

  if (!user) return <>{children}</>;
  if (isOverLimit(resource)) return <UpgradePrompt resource={resource} />;
  return <>{children}</>;
}
