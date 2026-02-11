import { Navbar } from '@/components/shared/Navbar';
import { Footer } from '@/components/shared/Footer';
import { Hero } from '@/components/landing/Hero';
import { FeatureGrid } from '@/components/landing/FeatureGrid';
import { Comparison } from '@/components/landing/Comparison';
import { Stats } from '@/components/landing/Stats';
import { CTA } from '@/components/landing/CTA';

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'WhisperAll',
  operatingSystem: 'Windows, macOS, Linux',
  applicationCategory: 'UtilitiesApplication',
  offers: [
    { '@type': 'Offer', price: '0', priceCurrency: 'USD', name: 'Free' },
    { '@type': 'Offer', price: '4', priceCurrency: 'USD', name: 'Basic' },
    { '@type': 'Offer', price: '10', priceCurrency: 'USD', name: 'Pro' },
  ],
  description: 'All-in-one voice AI desktop app for dictation, transcription, translation, TTS, and live subtitles.',
};

export default function Home() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Navbar />
      <main>
        <Hero />
        <FeatureGrid />
        <Comparison />
        <Stats />
        <CTA />
      </main>
      <Footer />
    </>
  );
}
