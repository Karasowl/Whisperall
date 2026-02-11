import { Button } from '../shared/Button';
import type { PlanTier } from '@/lib/constants';

type Props = {
  plan: PlanTier;
  price: string;
  popular?: boolean;
  features: { label: string; value: string }[];
  boolFeatures: { label: string; included: boolean }[];
};

const planColors: Record<PlanTier, string> = {
  free: 'text-muted',
  basic: 'text-primary',
  pro: 'text-purple-400',
};

export function PricingCard({ plan, price, popular, features, boolFeatures }: Props) {
  return (
    <div className={`relative flex flex-col p-6 rounded-2xl border ${popular ? 'border-primary shadow-lg shadow-primary/10' : 'border-edge'} bg-surface`}>
      {popular && <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] font-bold uppercase px-3 py-0.5 rounded-full bg-purple-500 text-white">Most Popular</span>}
      <div className="text-center mb-6">
        <span className={`text-xs font-bold uppercase ${planColors[plan]}`}>{plan}</span>
        <div className="flex items-baseline justify-center gap-0.5 mt-2">
          <span className="text-4xl font-black text-text">{price}</span>
          <span className="text-sm text-muted">/month</span>
        </div>
      </div>
      <ul className="space-y-3 mb-6 flex-1">
        {features.map(({ label, value }) => (
          <li key={label} className="flex justify-between text-sm">
            <span className="text-text-secondary">{label}</span>
            <span className="font-medium text-text">{value}</span>
          </li>
        ))}
        {boolFeatures.map(({ label, included }) => (
          <li key={label} className="flex justify-between text-sm">
            <span className="text-text-secondary">{label}</span>
            <span className={`material-symbols-outlined text-[16px] ${included ? 'text-green-500 fill-1' : 'text-edge'}`}>
              {included ? 'check_circle' : 'cancel'}
            </span>
          </li>
        ))}
      </ul>
      <Button href={plan === 'free' ? '/download' : '/download'} variant={popular ? 'primary' : 'secondary'} size="md">
        {plan === 'free' ? 'Get Started' : 'Choose Plan'}
      </Button>
    </div>
  );
}
