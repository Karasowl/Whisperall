import { Button } from '../shared/Button';

export function CTA() {
  return (
    <section className="py-24 px-6">
      <div className="max-w-3xl mx-auto text-center">
        <h2 className="text-3xl md:text-4xl font-black text-text mb-4">Ready to supercharge your workflow?</h2>
        <p className="text-text-secondary mb-8 max-w-xl mx-auto">
          Download WhisperAll for free and start dictating, transcribing, and translating in seconds.
          No credit card required.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button href="/download" size="lg">
            <span className="material-symbols-outlined text-[20px] mr-2">download</span>
            Download for Free
          </Button>
          <Button href="/pricing" variant="outline" size="lg">See Plans</Button>
        </div>
      </div>
    </section>
  );
}
