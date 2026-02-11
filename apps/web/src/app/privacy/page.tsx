import type { Metadata } from 'next';
import { Navbar } from '@/components/shared/Navbar';
import { Footer } from '@/components/shared/Footer';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'WhisperAll privacy policy. Learn how we handle your data.',
};

export default function PrivacyPage() {
  return (
    <>
      <Navbar />
      <main className="max-w-3xl mx-auto px-6 py-20">
        <h1 className="text-3xl font-bold text-text mb-2">Privacy Policy</h1>
        <p className="text-muted text-sm mb-10">Last updated: February 11, 2026</p>

        <section className="space-y-6 text-text-secondary leading-relaxed">
          <div>
            <h2 className="text-xl font-bold text-text mb-2">1. What We Collect</h2>
            <p>When you use WhisperAll, we collect: your account information (email, name) provided during sign-up; usage metrics such as feature usage counts and session duration; and application logs for error diagnosis. Voice audio is sent to third-party providers for processing but is <strong>not stored</strong> on our servers after the response is returned.</p>
          </div>

          <div>
            <h2 className="text-xl font-bold text-text mb-2">2. How We Use Your Data</h2>
            <p>We use your data to operate and improve the service, enforce usage limits for your plan tier, provide customer support, and send transactional emails related to your account. We do not sell your personal data.</p>
          </div>

          <div>
            <h2 className="text-xl font-bold text-text mb-2">3. Third-Party Services</h2>
            <p>WhisperAll relies on the following third-party providers to deliver its features:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li><strong>Supabase</strong> -- authentication, database, and file storage.</li>
              <li><strong>OpenAI</strong> -- speech-to-text transcription and AI editing.</li>
              <li><strong>Groq</strong> -- fast file transcription via Whisper models.</li>
              <li><strong>Google Cloud</strong> -- text-to-speech synthesis (WaveNet).</li>
              <li><strong>DeepL</strong> -- real-time translation.</li>
            </ul>
            <p className="mt-2">Each provider processes data according to their own privacy policies. Audio data sent to these providers is used solely for the requested operation and is not retained by WhisperAll afterward.</p>
          </div>

          <div>
            <h2 className="text-xl font-bold text-text mb-2">4. Data Retention</h2>
            <p>Account data is retained for as long as your account is active. Transcription results and notes you save are stored in your account until you delete them. If you delete your account, all associated data is removed within 30 days.</p>
          </div>

          <div>
            <h2 className="text-xl font-bold text-text mb-2">5. Your Rights</h2>
            <p>You may request access to, correction of, or deletion of your personal data at any time by contacting us. You may also export your data or close your account through the application settings.</p>
          </div>

          <div>
            <h2 className="text-xl font-bold text-text mb-2">6. Contact</h2>
            <p>For privacy-related inquiries, reach us at <a href="mailto:hello@whisperall.com" className="text-primary hover:underline">hello@whisperall.com</a>.</p>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
