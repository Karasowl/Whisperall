import { useState, useEffect } from 'react';
import { AppShell } from './components/shell/AppShell';
import { DictatePage } from './pages/DictatePage';
import { HistoryPage } from './pages/HistoryPage';
import { AuthPage } from './pages/AuthPage';
import { useAuthStore } from './stores/auth';
import { requestPlanRefresh, usePlanStore } from './stores/plan';
import { useSettingsStore } from './stores/settings';
import { electron } from './lib/electron';
import { playTTS } from './lib/tts';
import { inferTTSLanguage } from './lib/lang-detect';
import { useT } from './lib/i18n';
import { PricingContext } from './lib/pricing-context';
import { useNotesActionsStore } from './stores/notes-actions';

export type Page = 'dictate' | 'history';

export default function App() {
  const [page, setPage] = useState<Page>('dictate');
  const [showSettings, setShowSettings] = useState(false);
  const [showPricing, setShowPricing] = useState(false);
  const initAuth = useAuthStore((s) => s.init);
  const user = useAuthStore((s) => s.user);
  const authLoading = useAuthStore((s) => s.loading);
  const fetchPlan = usePlanStore((s) => s.fetch);
  const loadSettings = useSettingsStore((s) => s.load);

  useEffect(() => { initAuth(); loadSettings(); }, [initAuth, loadSettings]);
  useEffect(() => {
    if (user) {
      void fetchPlan();
    }
  }, [user, fetchPlan]);
  useEffect(() => {
    if (!user) return;
    const timer = setInterval(() => { requestPlanRefresh(0); }, 60_000);
    return () => clearInterval(timer);
  }, [user]);

  useEffect(() => {
    if (!electron?.onHotkey) return;
    return electron.onHotkey(async (action: string) => {
      if (action === 'open-settings') setShowSettings(true);
      else if (action === 'read-clipboard') {
        const text = await electron!.readClipboard();
        if (text) {
          const s = useSettingsStore.getState();
          const voice = s.ttsVoice && s.ttsVoice !== 'auto' ? s.ttsVoice : undefined;
          const forced = s.ttsLanguage && s.ttsLanguage !== 'auto' ? s.ttsLanguage : undefined;
          const lang = forced ?? inferTTSLanguage(text, { fallback: s.uiLanguage, voice });
          playTTS(text, voice, lang);
        }
      }
    });
  }, []);

  const t = useT();
  const { triggerNewNote, triggerVoiceNote, requestDeleteFolder } = useNotesActionsStore();

  if (authLoading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-base font-display">
        <div className="h-10 w-10 border-3 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-muted">{t('app.connecting')}</p>
      </div>
    );
  }

  if (!user) return <AuthPage />;

  const handleNavigate = (p: Page) => { setPage(p); };

  let content: JSX.Element;
  switch (page) {
    case 'dictate': content = <DictatePage />; break;
    case 'history': content = <HistoryPage />; break;
  }

  const openPricing = () => setShowPricing(true);

  return (
    <PricingContext.Provider value={openPricing}>
      <AppShell page={page} onNavigate={handleNavigate} showSettings={showSettings} onToggleSettings={setShowSettings} showPricing={showPricing} onTogglePricing={setShowPricing}
        onNewNote={triggerNewNote} onVoiceNote={triggerVoiceNote} onDeleteFolder={requestDeleteFolder}>
        {content}
      </AppShell>
    </PricingContext.Provider>
  );
}
