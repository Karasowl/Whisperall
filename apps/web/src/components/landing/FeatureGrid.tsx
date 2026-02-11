import { CORE_FEATURES } from '@/lib/constants';
import { FeatureCard } from './FeatureCard';

export function FeatureGrid() {
  return (
    <section id="features" className="py-20 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-black text-text mb-4">7 tools in one</h2>
          <p className="text-text-secondary max-w-xl mx-auto">Everything you need for voice AI, packed into a single desktop app with a floating overlay widget.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {CORE_FEATURES.map((f) => (
            <FeatureCard key={f.title} {...f} />
          ))}
        </div>
      </div>
    </section>
  );
}
