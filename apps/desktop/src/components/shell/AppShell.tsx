import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { SettingsModal } from './SettingsModal';
import { PricingModal } from './PricingModal';
import { TopBar } from './TopBar';
import { isElectron } from '../../lib/electron';
import type { Page } from '../../App';
import { NotificationToast } from '../ui/NotificationsPanel';
import { ActionDock } from '../actions/ActionPill';
import { useSettingsStore } from '../../stores/settings';

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
  const showNotifications = useSettingsStore((s) => s.showNotifications);

  return (
    <div className="flex h-screen overflow-hidden bg-base text-text font-display">
      <Sidebar page={page} onNavigate={onNavigate} onOpenSettings={() => onToggleSettings(true)} onOpenPricing={openPricing}
        onNewNote={onNewNote} onVoiceNote={onVoiceNote} onDeleteFolder={onDeleteFolder} />
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        <TopBar page={page} onNavigate={onNavigate} />
        {!isElectron() && (
          <div className="bg-amber-900/60 border-b border-amber-700/50 px-4 py-2 text-xs text-amber-200 text-center">
            Browser mode - hotkeys, widget &amp; clipboard require the Electron window. Use the desktop window, not this tab.
          </div>
        )}
        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
          {children}
        </div>
      </main>
      {showNotifications && <NotificationToast />}
      <ActionDock />
      {showSettings && <SettingsModal onClose={() => onToggleSettings(false)} onOpenPricing={openPricing} />}
      {showPricing && <PricingModal onClose={() => onTogglePricing(false)} />}
    </div>
  );
}
