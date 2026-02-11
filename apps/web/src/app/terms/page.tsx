import type { Metadata } from 'next';
import { Navbar } from '@/components/shared/Navbar';
import { Footer } from '@/components/shared/Footer';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'WhisperAll terms of service. Read before using the app.',
};

export default function TermsPage() {
  return (
    <>
      <Navbar />
      <main className="max-w-3xl mx-auto px-6 py-20">
        <h1 className="text-3xl font-bold text-text mb-2">Terms of Service</h1>
        <p className="text-muted text-sm mb-10">Last updated: February 11, 2026</p>

        <section className="space-y-6 text-text-secondary leading-relaxed">
          <div>
            <h2 className="text-xl font-bold text-text mb-2">1. Acceptance of Terms</h2>
            <p>By creating an account or using WhisperAll, you agree to these Terms of Service. If you do not agree, do not use the service.</p>
          </div>

          <div>
            <h2 className="text-xl font-bold text-text mb-2">2. Account Responsibilities</h2>
            <p>You are responsible for maintaining the security of your account credentials. You must provide accurate information during registration and keep it up to date. You are liable for all activity that occurs under your account.</p>
          </div>

          <div>
            <h2 className="text-xl font-bold text-text mb-2">3. Acceptable Use</h2>
            <p>You agree not to use WhisperAll to: violate any applicable law; infringe on intellectual property rights; transmit malicious software; attempt to reverse-engineer the service; or abuse API rate limits or circumvent usage restrictions.</p>
          </div>

          <div>
            <h2 className="text-xl font-bold text-text mb-2">4. Intellectual Property</h2>
            <p>WhisperAll and its original content, features, and functionality are owned by WhisperAll and protected by copyright and trademark laws. Content you create using the service (transcriptions, notes, translations) remains yours.</p>
          </div>

          <div>
            <h2 className="text-xl font-bold text-text mb-2">5. Limitation of Liability</h2>
            <p>WhisperAll is provided &ldquo;as is&rdquo; without warranty of any kind. We are not liable for any indirect, incidental, or consequential damages arising from your use of the service, including loss of data or business interruption.</p>
          </div>

          <div>
            <h2 className="text-xl font-bold text-text mb-2">6. Termination</h2>
            <p>We may suspend or terminate your account at our discretion if you violate these terms. You may delete your account at any time through the application settings. Upon termination, your right to use the service ceases immediately.</p>
          </div>

          <div>
            <h2 className="text-xl font-bold text-text mb-2">7. Changes to Terms</h2>
            <p>We reserve the right to modify these terms at any time. Material changes will be communicated via email or an in-app notice. Continued use after changes constitutes acceptance of the revised terms.</p>
          </div>

          <div>
            <h2 className="text-xl font-bold text-text mb-2">8. Governing Law</h2>
            <p>These terms are governed by and construed in accordance with applicable law, without regard to conflict of law principles.</p>
          </div>

          <div>
            <h2 className="text-xl font-bold text-text mb-2">9. Contact</h2>
            <p>For questions about these terms, reach us at <a href="mailto:hello@whisperall.com" className="text-primary hover:underline">hello@whisperall.com</a>.</p>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
