'use client';

import { ArrowRight, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { isPlanAtLeast, type PlanTier } from '@/lib/entitlements';
import { usePlan } from '@/components/PlanProvider';

export interface UpgradePromptProps {
  requiredPlan?: PlanTier;
  feature?: string;
  title?: string;
  description?: string;
  ctaLabel?: string;
  onUpgrade?: () => void;
  className?: string;
}

export function UpgradePrompt({
  requiredPlan = 'pro',
  feature,
  title,
  description,
  ctaLabel,
  onUpgrade,
  className,
}: UpgradePromptProps) {
  const router = useRouter();
  const { plan } = usePlan();

  if (isPlanAtLeast(plan, requiredPlan)) return null;

  const heading = title ?? `Unlock ${feature ?? 'this feature'}`;
  const body =
    description ??
    `Upgrade to ${requiredPlan.toUpperCase()} to access ${feature ?? 'this feature'} and other power tools.`;
  const buttonLabel = ctaLabel ?? `Upgrade to ${requiredPlan.toUpperCase()}`;

  const handleUpgrade = () => {
    if (onUpgrade) {
      onUpgrade();
      return;
    }
    const params = new URLSearchParams();
    params.set('tab', 'plan');
    params.set('upgrade', requiredPlan);
    if (feature) params.set('feature', feature);
    router.push(`/settings?${params.toString()}`);
  };

  return (
    <div className={cn('glass-card p-5 border border-amber-500/20 bg-gradient-to-br from-amber-500/10 via-transparent to-transparent', className)}>
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/20 flex items-center justify-center shrink-0">
          <Sparkles className="w-5 h-5 text-amber-300" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">{heading}</p>
          <p className="text-sm text-foreground-muted mt-1">{body}</p>
        </div>
        <button
          onClick={handleUpgrade}
          className="btn btn-primary px-4 py-2 text-sm shrink-0"
        >
          {buttonLabel}
          <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

export default UpgradePrompt;
