'use client';

import { useRouter } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import { ArrowLeft } from 'lucide-react';
import { isPlanAtLeast, type PlanTier } from '@/lib/entitlements';
import { usePlan } from '@/components/PlanProvider';
import { ModuleShell, UpgradePrompt } from '@/components/module';

export function PlanGate({
  requiredPlan,
  title,
  description,
  icon,
  feature,
  children,
}: {
  requiredPlan: PlanTier;
  title: string;
  description?: string;
  icon?: LucideIcon;
  feature?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { plan } = usePlan();

  if (isPlanAtLeast(plan, requiredPlan)) {
    return <>{children}</>;
  }

  return (
    <ModuleShell
      title={title}
      description={description}
      icon={icon}
      layout="centered"
      main={
        <div className="space-y-4">
          <UpgradePrompt requiredPlan={requiredPlan} feature={feature ?? title} />
          <div className="glass-card p-5">
            <p className="text-sm text-foreground-muted">
              This module is part of <span className="text-foreground font-semibold">{requiredPlan.toUpperCase()}</span>.
              You can still explore Core modules without upgrading.
            </p>
          </div>
        </div>
      }
      actions={
        <button className="btn btn-secondary" onClick={() => router.push('/dictate')}>
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          Back to Dictate
        </button>
      }
    />
  );
}

export default PlanGate;

