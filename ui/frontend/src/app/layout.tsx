import type { Metadata } from "next";
import { IBM_Plex_Sans, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { Navigation } from "@/components/Navigation";

const plex = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
});

const space = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "Whisperall - Local speech suite",
  description: "Free, local text-to-speech with voice cloning",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${plex.variable} ${space.variable} bg-gradient-animated min-h-screen relative`}>
        {/* Ambient glow orbs for visual depth */}
        <div className="ambient-orb ambient-orb-1" />
        <div className="ambient-orb ambient-orb-2" />

        {/* Main content */}
        <div className="relative z-10">
          <Navigation />
          <main className="max-w-6xl mx-auto px-4 py-8 animate-fade-in">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
