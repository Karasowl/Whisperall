import { PLANS, FEATURES, BOOL_FEATURES } from '@/lib/constants';
import { PricingCard } from './PricingCard';

export function PricingTable() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
      {PLANS.map(({ plan, price, popular }) => (
        <PricingCard
          key={plan}
          plan={plan}
          price={price}
          popular={popular}
          features={FEATURES.map((f) => ({ label: f.label, value: f[plan] }))}
          boolFeatures={BOOL_FEATURES.map((f) => ({ label: f.label, included: f[plan] }))}
        />
      ))}
    </div>
  );
}
