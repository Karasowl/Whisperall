import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { STTPasteManager } from "@/components/STTPasteManager";
import { GlobalSttManager } from "@/components/GlobalSttManager";
import { UISettingsInitializer } from "@/components/UISettingsInitializer";
import { ToastProvider } from "@/components/Toast";
import { PlanProvider } from "@/components/PlanProvider";
import { DevModeProvider } from "@/components/DevModeProvider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Whisperall - Dictation & Reader",
  description: "Dictation-first speech app for Windows: fast STT + real-time reader.",
};
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} bg-[var(--background)] text-[var(--foreground)] h-screen overflow-hidden antialiased selection:bg-accent-primary/20 selection:text-white`}>
        <ToastProvider>
        <PlanProvider>
          <DevModeProvider>
          <UISettingsInitializer />
          <STTPasteManager />
          <GlobalSttManager />

          <AppShell>{children}</AppShell>
          </DevModeProvider>
        </PlanProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
