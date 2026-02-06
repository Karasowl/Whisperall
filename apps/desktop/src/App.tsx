import { useState, useEffect } from 'react';
import { AppShell } from './components/shell/AppShell';
import { DictatePage } from './pages/DictatePage';
import { TranscribePage } from './pages/TranscribePage';
import { EditorPage } from './pages/EditorPage';
import { HistoryPage } from './pages/HistoryPage';
import { SettingsPage } from './pages/SettingsPage';
import { useAuthStore } from './stores/auth';
import { useSettingsStore } from './stores/settings';
import { electron } from './lib/electron';

export type Page = 'dictate' | 'transcribe' | 'editor' | 'history' | 'settings';

const PAGE_MAP: Record<Page, () => JSX.Element> = {
  dictate: DictatePage,
  transcribe: TranscribePage,
  editor: EditorPage,
  history: HistoryPage,
  settings: SettingsPage,
};

export default function App() {
  const [page, setPage] = useState<Page>('dictate');
  const initAuth = useAuthStore((s) => s.init);
  const loadSettings = useSettingsStore((s) => s.load);

  useEffect(() => {
    initAuth();
    loadSettings();
  }, [initAuth, loadSettings]);

  // Listen for hotkey-driven navigation from Electron main process
  useEffect(() => {
    if (!electron?.onHotkey) return;
    const unsub = electron.onHotkey((action: string) => {
      const routeMap: Record<string, Page> = {
        'ai-edit': 'editor',
        'translate': 'editor',
        'open-settings': 'settings',
      };
      if (routeMap[action]) setPage(routeMap[action]);
    });
    return unsub;
  }, []);

  const PageComponent = PAGE_MAP[page];

  return (
    <AppShell page={page} onNavigate={setPage}>
      <PageComponent />
    </AppShell>
  );
}
