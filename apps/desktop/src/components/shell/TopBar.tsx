import { ThemeToggle } from './ThemeToggle';
import { NotificationBell } from '../ui/NotificationsPanel';
import { useSettingsStore } from '../../stores/settings';
import type { Page } from '../../App';

type Props = {
  page: Page;
  onNavigate: (page: Page) => void;
};

/**
 * Global top chrome.
 *
 * Strictly minimal by design: drag region + theme toggle + notification
 * bell on the right. The widget-dock (previously centered here) has
 * been removed — neither the ghost placeholder nor the filled pill read
 * well as chrome, and it competed with per-page action buttons. The
 * magnetic-snap drop zone for the overlay widget is now handled
 * elsewhere (see DictatePage), so this bar stays uncluttered.
 *
 * Layout (left → right):
 *   [drag handle area — fills remaining width]
 *   [theme toggle]
 *   [notification bell]
 *   [~148 px reservation for Windows min/max/close via titleBarOverlay]
 *
 * Height 48 px keeps the bar discoverable without shouting.
 */
export function TopBar({ page: _page, onNavigate }: Props) {
  const showNotifications = useSettingsStore((s) => s.showNotifications);

  return (
    <div
      className="shrink-0 h-12 border-b border-edge bg-surface-alt/40 backdrop-blur-sm relative z-20 drag-region"
      data-testid="top-bar"
    >
      <div className="absolute top-0 right-0 h-full pr-[148px] flex items-center gap-0.5 no-drag">
        <ThemeToggle />
        {showNotifications && <NotificationBell onOpenProcesses={() => onNavigate('processes')} />}
      </div>
    </div>
  );
}
