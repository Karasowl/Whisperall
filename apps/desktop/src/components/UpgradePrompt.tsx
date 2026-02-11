import { usePlanStore } from '../stores/plan';
import { useT } from '../lib/i18n';
import { usePricing } from '../lib/pricing-context';
import type { UsageRecord } from '@whisperall/api-client';

type Props = { resource: keyof UsageRecord };

export function UpgradePrompt({ resource }: Props) {
  const t = useT();
  const openPricing = usePricing();
  const { plan, isOverLimit } = usePlanStore();
  if (!isOverLimit(resource)) return null;

  const next = plan === 'free' ? 'Basic ($4/mo)' : plan === 'basic' ? 'Pro ($10/mo)' : null;

  return (
    <div className="flex flex-col items-center gap-4 p-8 bg-surface border border-edge rounded-2xl text-center" data-testid="upgrade-prompt">
      <span className="material-symbols-outlined text-[40px] text-primary">lock</span>
      <h4 className="text-base font-bold text-text">{t('upgrade.limitReached')}</h4>
      <p className="text-sm text-muted max-w-xs">
        {t('upgrade.quotaUsed').replace('{resource}', resource.replace(/_/g, ' '))}
        {next && ` ${t('upgrade.upgradeTo').replace('{plan}', next)}`}
      </p>
      {next && (
        <button type="button" onClick={openPricing} className="px-6 py-2.5 bg-gradient-to-r from-primary to-purple-500 text-white font-medium rounded-lg text-sm hover:opacity-90 transition-opacity shadow-lg shadow-primary/25">
          {t('upgrade.button')}
        </button>
      )}
    </div>
  );
}
