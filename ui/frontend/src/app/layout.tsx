import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google"; // Modern, geometric sans
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { STTPasteManager } from "@/components/STTPasteManager";
import { GlobalSttManager } from "@/components/GlobalSttManager";
import { UISettingsInitializer } from "@/components/UISettingsInitializer";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
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
      <body className={`${inter.variable} ${outfit.variable} bg-[var(--background)] text-[var(--foreground)] h-screen overflow-hidden antialiased selection:bg-accent-primary/30 selection:text-white`}>
        <UISettingsInitializer />
        <STTPasteManager />
        <GlobalSttManager />

        {/* Dynamic Background Mesh */}
        <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-accent-primary/10 blur-[90px] animate-blob" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-accent-secondary/10 blur-[90px] animate-blob animation-delay-2000" />
          <div className="absolute top-[20%] left-[20%] w-[60%] h-[60%] rounded-full bg-surface-1/50 blur-[60px]" />
        </div>

        <div className="flex h-full relative z-10 overflow-x-hidden">
          <Sidebar />

          <div className="flex-1 flex flex-col min-w-0 transition-all duration-300 lg:ml-[var(--sidebar-width,16rem)]">
            {/* Window Drag Handle / Titlebar Spacer */}
            {/* This area is draggable. Window controls usually sit top-right. relative to this. */}
            <div className="h-8 w-full shrink-0 electron-drag-region sticky top-0 z-40" />

            <main className="flex-1 overflow-y-auto overflow-x-hidden p-6 lg:p-10 animate-fade-in custom-scrollbar">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
