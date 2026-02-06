import { usePlanStore } from '../stores/plan';
import type { UsageRecord } from '@whisperall/api-client';

type UpgradePromptProps = {
  resource: keyof UsageRecord;
};

export function UpgradePrompt({ resource }: UpgradePromptProps) {
  const { plan, isOverLimit } = usePlanStore();

  if (!isOverLimit(resource)) return null;

  const nextPlan = plan === 'free' ? 'Basic ($4/mo)' : plan === 'basic' ? 'Pro ($10/mo)' : null;

  return (
    <div className="upgrade-prompt">
      <h4>Usage limit reached</h4>
      <p>
        You've used all your {resource.replace(/_/g, ' ')} quota for this month.
        {nextPlan && ` Upgrade to ${nextPlan} for more.`}
      </p>
      {nextPlan && <button className="btn-upgrade">Upgrade Plan</button>}
    </div>
  );
}
