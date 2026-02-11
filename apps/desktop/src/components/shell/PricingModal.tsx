import { usePlanStore } from '../../stores/plan';
import { useT } from '../../lib/i18n';
import { electron } from '../../lib/electron';
import type { UserPlan } from '@whisperall/api-client';

type Props = { onClose: () => void };

const PLANS: { plan: UserPlan; price: string; popular?: boolean }[] = [
  { plan: 'free', price: '$0' },
  { plan: 'basic', price: '$4', popular: true },
  { plan: 'pro', price: '$10' },
];

const FEATURES: { key: string; free: string; basic: string; pro: string }[] = [
  { key: 'dictation', free: '30 min', basic: '600 min', pro: '1800 min' },
  { key: 'transcription', free: '10 min', basic: '300 min', pro: '1800 min' },
  { key: 'tts', free: '50k', basic: '500k', pro: '2M' },
  { key: 'translation', free: '50k', basic: '500k', pro: '2M' },
  { key: 'aiEditing', free: '50k', basic: '500k', pro: '2M' },
  { key: 'notes', free: '50', basic: '200', pro: '1000' },
];

const BOOL_FEATURES: { key: string; free: boolean; basic: boolean; pro: boolean }[] = [
  { key: 'subtitles', free: true, basic: true, pro: true },
  { key: 'overlay', free: true, basic: true, pro: true },
  { key: 'priority', free: false, basic: false, pro: true },
];

export function PricingModal({ onClose }: Props) {
  const t = useT();
  const current = usePlanStore((s) => s.plan);

  const handleUpgrade = (target: UserPlan) => {
    if (target === current || target === 'free') return;
    electron?.openExternal('https://whisperall.ai/pricing');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose} data-testid="pricing-modal">
      <div className="bg-surface border border-edge rounded-2xl w-full max-w-4xl max-h-[85vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-edge">
          <div>
            <h2 className="text-2xl font-bold text-text">{t('pricing.title')}</h2>
            <p className="text-sm text-muted mt-1">{t('pricing.subtitle')}</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-text transition-colors" data-testid="pricing-close">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Plan cards */}
        <div className="p-6 grid grid-cols-3 gap-4">
          {PLANS.map(({ plan, price, popular }) => {
            const isCurrent = plan === current;
            const isUpgrade = plan !== 'free' && plan !== current;
            return (
              <div key={plan} className={`relative flex flex-col items-center gap-3 p-5 rounded-xl border ${isCurrent ? 'border-primary bg-primary/5' : 'border-edge'}`} data-testid={`plan-${plan}`}>
                {popular && <span className="absolute -top-2.5 text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full bg-purple-500 text-white">{t('pricing.popular')}</span>}
                <span className={`text-xs font-bold uppercase ${plan === 'pro' ? 'text-purple-400' : plan === 'basic' ? 'text-primary' : 'text-muted'}`}>{t(`pricing.${plan}`)}</span>
                <div className="flex items-baseline gap-0.5">
                  <span className="text-3xl font-black text-text">{price}</span>
                  <span className="text-sm text-muted">{t('pricing.perMonth')}</span>
                </div>
                {isCurrent ? (
                  <span className="px-4 py-2 text-xs font-medium text-primary border border-primary/30 rounded-lg">{t('pricing.current')}</span>
                ) : isUpgrade ? (
                  <button onClick={() => handleUpgrade(plan)} className="px-4 py-2 text-xs font-medium text-white bg-gradient-to-r from-primary to-purple-500 rounded-lg hover:opacity-90 transition-opacity shadow-lg shadow-primary/25" data-testid={`choose-${plan}`}>
                    {t('pricing.choose')}
                  </button>
                ) : (
                  <span className="px-4 py-2 text-xs text-muted">&nbsp;</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Feature table */}
        <div className="px-6 pb-6">
          <table className="w-full text-sm">
            <tbody>
              {FEATURES.map(({ key, free, basic, pro }) => (
                <tr key={key} className="border-t border-edge/50">
                  <td className="py-2.5 text-muted font-medium">{t(`pricing.${key}`)}</td>
                  <td className="py-2.5 text-center text-text-secondary w-1/4">{free}</td>
                  <td className="py-2.5 text-center text-text-secondary w-1/4">{basic}</td>
                  <td className="py-2.5 text-center text-text-secondary w-1/4">{pro}</td>
                </tr>
              ))}
              {BOOL_FEATURES.map(({ key, free, basic, pro }) => (
                <tr key={key} className="border-t border-edge/50">
                  <td className="py-2.5 text-muted font-medium">{t(`pricing.${key}`)}</td>
                  {[free, basic, pro].map((v, i) => (
                    <td key={i} className="py-2.5 text-center w-1/4">
                      <span className={`material-symbols-outlined text-[18px] ${v ? 'text-green-400 fill-1' : 'text-edge'}`}>{v ? 'check_circle' : 'cancel'}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
