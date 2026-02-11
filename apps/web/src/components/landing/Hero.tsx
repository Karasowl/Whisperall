import { Button } from '../shared/Button';

export function Hero() {
  return (
    <section className="relative overflow-hidden py-24 md:py-32 px-6">
      {/* Background gradient */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] rounded-full bg-primary/10 blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full bg-purple-500/10 blur-[100px]" />
      </div>

      <div className="max-w-4xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-edge bg-surface text-xs font-medium text-muted mb-6">
          <span className="material-symbols-outlined text-primary text-[14px] fill-1">bolt</span>
          All-in-one voice AI desktop app
        </div>

        <h1 className="text-4xl md:text-6xl font-black text-text leading-tight mb-6">
          Your voice,{' '}<span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-purple-500">supercharged.</span>
        </h1>

        <p className="text-lg md:text-xl text-text-secondary max-w-2xl mx-auto mb-10 leading-relaxed">
          Dictate, transcribe, translate, and caption &mdash; all from one app.
          Replaces 4 tools at a fraction of the cost.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <div data-testid="hero-download"><Button href="/download" size="lg">
            <span className="material-symbols-outlined text-[20px] mr-2">download</span>
            Download for Free
          </Button></div>
          <div data-testid="hero-pricing"><Button href="/pricing" variant="secondary" size="lg">View Pricing</Button></div>
        </div>
      </div>
    </section>
  );
}
