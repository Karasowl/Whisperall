type Props = { icon: string; title: string; description: string };

export function FeatureCard({ icon, title, description }: Props) {
  return (
    <div className="group p-6 rounded-2xl border border-edge bg-surface hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300">
      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
        <span className="material-symbols-outlined text-primary text-[22px]">{icon}</span>
      </div>
      <h3 className="text-base font-bold text-text mb-2">{title}</h3>
      <p className="text-sm text-text-secondary leading-relaxed">{description}</p>
    </div>
  );
}
