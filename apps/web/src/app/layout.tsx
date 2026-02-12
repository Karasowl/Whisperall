import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import '@/styles/globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', weight: ['300', '400', '500', '600', '700', '900'] });

export const metadata: Metadata = {
  metadataBase: new URL('https://whisperall.com'),
  title: { default: 'WhisperAll — Your voice, supercharged', template: '%s | WhisperAll' },
  description: 'Dictate, transcribe, translate, and caption — all from one app. Replaces wisprflow, granola, speechify, and turboscribe.',
  keywords: ['transcription', 'dictation', 'text-to-speech', 'translation', 'subtitles', 'voice AI', 'meeting transcription'],
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/apple-icon.png',
  },
  openGraph: {
    siteName: 'WhisperAll',
    type: 'website',
  },
  twitter: { card: 'summary_large_image' },
  alternates: { canonical: 'https://whisperall.com' },
};

function ThemeScript() {
  const script = `(function(){try{var t=localStorage.getItem('whisperall-theme');if(t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme:dark)').matches))document.documentElement.classList.add('dark')}catch(e){}})()`;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <ThemeScript />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" />
      </head>
      <body className="bg-base text-text font-display antialiased">
        {children}
      </body>
    </html>
  );
}
