import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { SettingsModal } from './SettingsModal';
import { PricingModal } from './PricingModal';
import { isElectron } from '../../lib/electron';
import type { Page } from '../../App';

type Props = {
  page: Page;
  onNavigate: (page: Page) => void;
  showSettings: boolean;
  onToggleSettings: (show: boolean) => void;
  showPricing: boolean;
  onTogglePricing: (show: boolean) => void;
  onNewNote?: () => void;
  onVoiceNote?: () => void;
  onDeleteFolder?: (id: string) => void;
  children: ReactNode;
};

export function AppShell({ page, onNavigate, showSettings, onToggleSettings, showPricing, onTogglePricing, onNewNote, onVoiceNote, onDeleteFolder, children }: Props) {
  const openPricing = () => { onToggleSettings(false); onTogglePricing(true); };

  return (
    <div className="flex h-screen overflow-hidden bg-base text-text font-display">
      <Sidebar page={page} onNavigate={onNavigate} onOpenSettings={() => onToggleSettings(true)} onOpenPricing={openPricing}
        onNewNote={onNewNote} onVoiceNote={onVoiceNote} onDeleteFolder={onDeleteFolder} />
      <main className="flex-1 relative flex flex-col overflow-hidden">
        <div className="drag-region absolute top-0 left-0 right-0 h-10 z-10" />
        {!isElectron() && (
          <div className="bg-amber-900/60 border-b border-amber-700/50 px-4 py-2 text-xs text-amber-200 text-center mt-10 z-20">
            Browser mode — hotkeys, widget &amp; clipboard require the Electron window. Use the desktop window, not this tab.
          </div>
        )}
        {children}
      </main>
      {showSettings && <SettingsModal onClose={() => onToggleSettings(false)} onOpenPricing={openPricing} />}
      {showPricing && <PricingModal onClose={() => onTogglePricing(false)} />}
    </div>
  );
}
