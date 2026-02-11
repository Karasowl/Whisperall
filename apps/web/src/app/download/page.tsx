import type { Metadata } from 'next';
import { Navbar } from '@/components/shared/Navbar';
import { Footer } from '@/components/shared/Footer';
import { PlatformSelector } from '@/components/download/PlatformSelector';

export const metadata: Metadata = {
  title: 'Download',
  description: 'Download WhisperAll for Windows, macOS, or Linux. Free to get started.',
};

export default function DownloadPage() {
  return (
    <>
      <Navbar />
      <main className="py-20 px-6">
        <div className="text-center mb-12">
          <h1 className="text-3xl md:text-4xl font-black text-text mb-4">Download WhisperAll</h1>
          <p className="text-text-secondary max-w-xl mx-auto">
            Get the desktop app for your platform. Start dictating, transcribing, and translating in seconds.
          </p>
        </div>
        <PlatformSelector />
      </main>
      <Footer />
    </>
  );
}
