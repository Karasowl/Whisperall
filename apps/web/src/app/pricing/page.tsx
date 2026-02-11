import type { Metadata } from 'next';
import { Navbar } from '@/components/shared/Navbar';
import { Footer } from '@/components/shared/Footer';
import { PricingTable } from '@/components/pricing/PricingTable';
import { FAQ } from '@/components/pricing/FAQ';
import { FAQ_ITEMS } from '@/lib/constants';

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Simple, transparent pricing. Start free, upgrade when you need more.',
};

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ_ITEMS.map(({ q, a }) => ({
    '@type': 'Question', name: q,
    acceptedAnswer: { '@type': 'Answer', text: a },
  })),
};

export default function PricingPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <Navbar />
      <main className="py-20 px-6">
        <div className="text-center mb-12">
          <h1 className="text-3xl md:text-4xl font-black text-text mb-4">Simple, transparent pricing</h1>
          <p className="text-text-secondary max-w-xl mx-auto">Start for free, upgrade when you need more. No hidden fees.</p>
        </div>
        <PricingTable />
        <div className="mt-20">
          <FAQ />
        </div>
      </main>
      <Footer />
    </>
  );
}
