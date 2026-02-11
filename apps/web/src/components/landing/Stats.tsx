import { STATS } from '@/lib/constants';

export function Stats() {
  return (
    <section className="py-16 px-6">
      <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6">
        {STATS.map(({ value, label }) => (
          <div key={label} className="text-center p-6 rounded-2xl border border-edge bg-surface">
            <div className="text-3xl md:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-primary to-purple-500 mb-1">{value}</div>
            <div className="text-sm text-muted">{label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
