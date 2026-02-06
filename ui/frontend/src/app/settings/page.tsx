'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Settings,
  Key,
  Keyboard,
  Palette,
  HardDrive,
  Bell,
  Shield,
  Loader2,
  Zap,
  Gauge,
  Settings2,
  Mic,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { usePlan } from '@/components/PlanProvider';
import { useDevMode } from '@/components/DevModeProvider';
import {
  type HotkeysSettings,
  type Model,
  type SystemCapabilities,
  type ProviderCatalogEntry,
  getAllSettings,
  getApiKeys,
  getProviderCatalog,
  setApiKey,
  testApiKey,
  getHotkeys,
  setHotkey,
  getHealth,
  getAllModels,
  downloadModel,
  deleteModel,
  updateSetting,
  getSystemCapabilities,
  getMonthlyHistoryStats,
} from '@/lib/api';
import { SelectMenu } from '@/components/SelectMenu';
import { HotkeyRecorder } from '@/components/HotkeyRecorder';
import { applyLanguage, applyTheme } from '@/lib/uiSettings';
import { applyActionSoundConfig } from '@/lib/actionSounds';
import { Toggle } from '@/components/Toggle';
import { useToast } from '@/components/Toast';
import { UpgradePrompt, UsageMeter } from '@/components/module';
import type { PlanTier } from '@/lib/entitlements';

type SettingsSection = { id: string; label: string; icon: any; description: string };

const CORE_SETTINGS_SECTIONS: SettingsSection[] = [
  { id: 'plan', label: 'Plan & Usage', icon: Gauge, description: 'Subscription and monthly limits' },
  { id: 'stt', label: 'Speech to Text', icon: Mic, description: 'Dictation and transcription settings' },
  { id: 'appearance', label: 'Appearance', icon: Palette, description: 'Theme and language' },
  { id: 'notifications', label: 'Notifications', icon: Bell, description: 'Alerts and tray behavior' },
  { id: 'privacy', label: 'Privacy', icon: Shield, description: 'History and analytics' },
];

const ADVANCED_SETTINGS_SECTIONS: SettingsSection[] = [
  { id: 'performance', label: 'Performance', icon: Zap, description: 'GPU, device, and speed settings' },
  { id: 'hotkeys', label: 'Hotkeys', icon: Keyboard, description: 'Customize global shortcuts' },
  { id: 'api-keys', label: 'API Keys', icon: Key, description: 'Manage API keys for cloud services' },
  { id: 'models', label: 'Resources', icon: HardDrive, description: 'Manage offline engines and packages' },
];

const apiKeyProviders = [
  { id: 'openai', label: 'OpenAI' },
  { id: 'elevenlabs', label: 'ElevenLabs' },
  { id: 'claude', label: 'Claude' },
  { id: 'gemini', label: 'Gemini' },
  { id: 'deepseek', label: 'DeepSeek' },
  { id: 'zhipu', label: 'Zhipu (GLM)' },
  { id: 'moonshot', label: 'Moonshot (Kimi)' },
  { id: 'minimax', label: 'MiniMax' },
  { id: 'groq', label: 'Groq' },
  { id: 'deepl', label: 'DeepL' },
  { id: 'deepgram', label: 'Deepgram' },
  { id: 'google', label: 'Google Translate' },
  { id: 'fishaudio', label: 'Fish Audio' },
  { id: 'cartesia', label: 'Cartesia' },
  { id: 'playht', label: 'PlayHT' },
  { id: 'siliconflow', label: 'SiliconFlow' },
  { id: 'zyphra', label: 'Zyphra (Zonos)' },
  { id: 'narilabs', label: 'Nari Labs (Dia)' },
  { id: 'huggingface', label: 'HuggingFace', description: 'Required for pyannote speaker diarization' },
];

const hotkeyLabels: Record<string, string> = {
  dictate: 'Dictate (STT)',
  read_clipboard: 'Read Clipboard',
  stt_paste: 'Paste Last Transcript',
  pause: 'Pause/Resume',
  stop: 'Stop',
  ai_edit: 'AI Edit',
  translate: 'Translate',
  speed_up: 'Speed Up',
  speed_down: 'Speed Down',
};

// Default hotkeys - these match the backend defaults in settings_service.py
const defaultHotkeys: HotkeysSettings = {
  dictate: 'Alt+X',
  read_clipboard: 'Ctrl+Shift+R',
  stt_paste: 'Alt+Shift+S',
  pause: 'Ctrl+Shift+P',
  stop: 'Ctrl+Shift+S',
  ai_edit: 'Ctrl+Shift+E',
  translate: 'Ctrl+Shift+T',
  speed_up: 'Ctrl+Shift+Up',
  speed_down: 'Ctrl+Shift+Down',
};

function formatLoadError(err: any) {
  if (!err) return 'failed';
  const status = err.response?.status ? ` [${err.response.status}]` : '';
  const url = err.config?.url ? ` (${err.config.url})` : '';
  return `${err.message || 'failed'}${status}${url}`;
}

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-10 h-10 animate-spin text-accent-primary" />
        </div>
      }
    >
      <SettingsPageInner />
    </Suspense>
  );
}

function SettingsPageInner() {
  const toast = useToast();
  const searchParams = useSearchParams();
  const { plan, setPlan, hasPro } = usePlan();
  const { devMode } = useDevMode();
  const showAdvancedSections = devMode;

  const settingsSections = useMemo(() => {
    return showAdvancedSections
      ? [...CORE_SETTINGS_SECTIONS, ...ADVANCED_SETTINGS_SECTIONS]
      : CORE_SETTINGS_SECTIONS;
  }, [showAdvancedSections]);
  const [activeSection, setActiveSection] = useState('plan');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [upgradeTarget, setUpgradeTarget] = useState<PlanTier | null>(null);
  const [upgradeFeature, setUpgradeFeature] = useState<string | null>(null);

  const [settings, setSettings] = useState<any>(null);
  const [apiKeys, setApiKeysState] = useState<Record<string, string | null>>({});
  const [hotkeys, setHotkeysState] = useState<HotkeysSettings>(defaultHotkeys);
  const [hotkeyDrafts, setHotkeyDrafts] = useState<HotkeysSettings>(defaultHotkeys);
  const [apiKeyDrafts, setApiKeyDrafts] = useState<Record<string, string>>({});
  const [apiKeyStatus, setApiKeyStatus] = useState<Record<string, string>>({});
  const [models, setModels] = useState<Model[]>([]);
  const [modelBusy, setModelBusy] = useState<Record<string, string>>({});
  const [confirmModel, setConfirmModel] = useState<Model | null>(null);
  const [appMeta, setAppMeta] = useState<{ version?: string; build_time?: string } | null>(null);
  const [capabilities, setCapabilities] = useState<SystemCapabilities | null>(null);
  const [providerCatalog, setProviderCatalog] = useState<ProviderCatalogEntry[]>([]);

  useEffect(() => {
    if (!settingsSections.find((section) => section.id === activeSection)) {
      setActiveSection(settingsSections[0]?.id || 'plan');
    }
  }, [settingsSections, activeSection]);

  const loadSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const results = await Promise.allSettled([
        getAllSettings(),
        getApiKeys(),
        getProviderCatalog(),
        getHotkeys(),
        getAllModels(),
        getHealth(),
        getSystemCapabilities(),
      ]);

      const errors: string[] = [];

      if (results[0].status === 'fulfilled') {
        setSettings(results[0].value);
        if (results[0].value?.ui) {
          if (results[0].value.ui.theme) {
            applyTheme(results[0].value.ui.theme);
          }
          if (results[0].value.ui.language) {
            applyLanguage(results[0].value.ui.language);
          }
          if (window.electronAPI?.updateTraySettings) {
            window.electronAPI.updateTraySettings({
              minimizeToTray: results[0].value.ui.minimize_to_tray,
              showNotifications: results[0].value.ui.show_notifications,
            });
          }
        }
      } else {
        errors.push(`settings ${formatLoadError(results[0].reason)}`);
      }

      if (results[1].status === 'fulfilled') {
        setApiKeysState(results[1].value.api_keys || {});
      } else {
        errors.push(`api keys ${formatLoadError(results[1].reason)}`);
      }

      if (results[2].status === 'fulfilled') {
        setProviderCatalog(results[2].value.providers || []);
      } else {
        setProviderCatalog([]);
        errors.push(`provider catalog ${formatLoadError(results[2].reason)}`);
      }

      if (results[3].status === 'fulfilled') {
        const loadedHotkeys = { ...defaultHotkeys, ...results[3].value };
        setHotkeysState(loadedHotkeys);
        setHotkeyDrafts(loadedHotkeys);
        if (window.electronAPI?.updateHotkeys) {
          window.electronAPI.updateHotkeys(loadedHotkeys);
        }
      } else {
        errors.push(`hotkeys ${formatLoadError(results[3].reason)}`);
        if (window.electronAPI?.updateHotkeys) {
          window.electronAPI.updateHotkeys(defaultHotkeys);
        }
      }

      if (results[4].status === 'fulfilled') {
        setModels(results[4].value.models || []);
      } else {
        errors.push(`models ${formatLoadError(results[4].reason)}`);
      }

      if (results[5].status === 'fulfilled') {
        setAppMeta(results[5].value);
      } else {
        setAppMeta(null);
        errors.push(`health ${formatLoadError(results[5].reason)}`);
      }

      if (results[6].status === 'fulfilled') {
        setCapabilities(results[6].value);
      } else {
        errors.push(`capabilities ${formatLoadError(results[6].reason)}`);
      }

      if (errors.length) {
        setError(`Some settings failed to load: ${errors.join(', ')}`);
      }
    } catch (err: any) {
      const status = err.response?.status ? ` [${err.response.status}]` : '';
      const url = err.config?.url ? ` (${err.config.url})` : '';
      setError(`${err.message || 'Failed to load settings'}${status}${url}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  // Deep-linking support (e.g. /settings?tab=api-keys or /settings?upgrade=pro&feature=Live%20Capture)
  useEffect(() => {
    const tab = searchParams.get('tab');
    const upgrade = searchParams.get('upgrade');
    const feature = searchParams.get('feature');

    const upgradeTier: PlanTier | null =
      upgrade === 'free' || upgrade === 'standard' || upgrade === 'pro' ? upgrade : null;

    setUpgradeTarget(upgradeTier);
    setUpgradeFeature(feature);

    if (upgradeTier) {
      setActiveSection('plan');
      return;
    }

    if (tab && settingsSections.some((s) => s.id === tab)) {
      setActiveSection(tab);
    }
  }, [searchParams, settingsSections]);

  // If advanced sections get hidden while we are viewing them, bounce back to Plan.
  useEffect(() => {
    if (showAdvancedSections) return;
    if (activeSection === 'api-keys' || activeSection === 'models') {
      setActiveSection('plan');
    }
  }, [activeSection, showAdvancedSections]);

  const handleApiKeySave = async (provider: string) => {
    const value = apiKeyDrafts[provider];
    if (!value) return;
    setApiKeyStatus((prev) => ({ ...prev, [provider]: 'Saving...' }));
    try {
      await setApiKey(provider, value);
      setApiKeyStatus((prev) => ({ ...prev, [provider]: 'Saved' }));
      const fresh = await getApiKeys();
      setApiKeysState(fresh.api_keys || {});
      setApiKeyDrafts((prev) => ({ ...prev, [provider]: '' }));
      toast.success('API key saved', `${provider} key updated successfully`);
    } catch (err: any) {
      setApiKeyStatus((prev) => ({ ...prev, [provider]: err.message || 'Save failed' }));
      toast.error('Save failed', err.message || 'Could not save API key');
    }
  };

  const handleApiKeyTest = async (provider: string) => {
    setApiKeyStatus((prev) => ({ ...prev, [provider]: 'Testing...' }));
    try {
      const result = await testApiKey(provider);
      setApiKeyStatus((prev) => ({
        ...prev,
        [provider]: result.valid ? 'Valid' : result.error || 'Invalid',
      }));
      if (result.valid) {
        toast.success('API key valid', `${provider} key verified successfully`);
      } else {
        toast.warning('Invalid key', result.error || 'API key verification failed');
      }
    } catch (err: any) {
      setApiKeyStatus((prev) => ({ ...prev, [provider]: err.message || 'Test failed' }));
      toast.error('Test failed', err.message || 'Could not verify API key');
    }
  };

  const handleHotkeySave = async (action: string) => {
    const value = hotkeyDrafts[action];
    if (!value) return;
    try {
      await setHotkey(action, value);
      setHotkeysState((prev) => ({ ...prev, [action]: value }));
      if (window.electronAPI?.updateHotkeys) {
        window.electronAPI.updateHotkeys({ [action]: value });
      }
      toast.success('Hotkey saved', `${hotkeyLabels[action] || action} updated`);
    } catch (err: any) {
      setError(err.message || 'Failed to update hotkey');
      toast.error('Save failed', err.message || 'Could not update hotkey');
    }
  };

  const handleSettingChange = async (path: string, value: any) => {
    try {
      await updateSetting(path, value);
      setSettings((prev: any) => {
        if (!prev) return prev;
        const updated = { ...prev };
        const keys = path.split('.');
        let current = updated;
        for (let i = 0; i < keys.length - 1; i += 1) {
          current[keys[i]] = { ...current[keys[i]] };
          current = current[keys[i]];
        }
        current[keys[keys.length - 1]] = value;
        return updated;
      });
      if (path === 'ui.theme') {
        applyTheme(value);
      }
      if (path === 'ui.language') {
        applyLanguage(value);
      }
      if (path.startsWith('ui.')) {
        const nextUi = {
          ...(settings?.ui || {}),
          [path.split('.')[1]]: value,
        };
        if (window.electronAPI?.updateTraySettings) {
          window.electronAPI.updateTraySettings({
            minimizeToTray: nextUi.minimize_to_tray,
            showNotifications: nextUi.show_notifications,
          });
        }
        if (path.startsWith('ui.action_sounds.')) {
          const key = path.split('.')[2];
          applyActionSoundConfig({ [key]: value });
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to update setting');
    }
  };

  const handleModelDownload = async (modelId: string) => {
    // Legacy function, now handled in Resources page.
    // Kept here if ConfirmDialog needs it or other refs, but eventually safe to remove.
    // For now we just implement minimal logic to satisfy types if needed.
    setModelBusy((prev) => ({ ...prev, [modelId]: 'Downloading...' }));
    try {
      await downloadModel(modelId);
      await loadSettings();
    } finally {
      setModelBusy((prev) => ({ ...prev, [modelId]: '' }));
    }
  };

  const apiProviders = providerCatalog.length
    ? [
      ...providerCatalog
        .filter((provider) => provider.type === 'api' && provider.implemented !== false)
        .map((provider) => ({
          id: provider.id,
          label: provider.name,
          description: provider.description,
          docsUrl: provider.docs_url,
          pricingUrl: provider.pricing_url,
          pricingUnit: provider.pricing_unit,
          pricingNote: provider.pricing_note,
          consoleUrl: provider.console_url,
          keyLabel: provider.key_label,
          keyInstructions: provider.key_instructions,
        })),
      {
        id: 'huggingface',
        label: 'HuggingFace',
        description: 'Required for pyannote speaker diarization',
        docsUrl: 'https://huggingface.co/docs',
        consoleUrl: 'https://huggingface.co/settings/tokens',
        pricingUnit: 'Free (token-gated models may have terms)',
      },
    ]
    : apiKeyProviders.map((provider) => ({
      id: provider.id,
      label: provider.label,
      description: provider.description,
    }));

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-10 h-10 animate-spin text-accent-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col overflow-x-hidden page-premium">
      <header className="sticky top-0 z-50 border-b border-white/5 bg-background/85 backdrop-blur-md px-6 md:px-10 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-6">
          <div className="flex items-center gap-3 text-foreground">
            <div className="size-9 rounded-xl bg-accent-primary/15 border border-accent-primary/30 flex items-center justify-center">
              <Settings className="w-4 h-4 text-accent-primary" />
            </div>
            <span className="text-sm font-semibold tracking-tight">Whisperall</span>
          </div>
          <nav className="hidden md:flex items-center gap-8 text-xs uppercase tracking-wide text-foreground-muted">
            <Link className="hover:text-foreground transition-colors" href="/dictate">Dashboard</Link>
            <Link className="hover:text-foreground transition-colors" href="/history">History</Link>
            <Link className="text-foreground border-b border-accent-primary pb-0.5" href="/settings">Settings</Link>
          </nav>
          <div className="flex items-center gap-3">
            <button className="hidden sm:inline-flex h-9 px-4 rounded-lg border border-white/5 bg-surface-2/60 text-xs font-semibold text-foreground-muted hover:text-foreground hover:border-white/10 transition-colors">
              Help
            </button>
            {appMeta && (
              <div className="hidden sm:flex text-xs text-foreground-muted">
                v{appMeta.version}
              </div>
            )}
            <div className="h-9 w-9 rounded-full bg-surface-2 border border-surface-3" />
          </div>
        </div>
      </header>

      <main className="flex-1 px-6 md:px-10 py-10">
        <div className="max-w-6xl mx-auto flex flex-col gap-10">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-foreground">Settings</h1>
            <p className="text-foreground-muted text-sm md:text-base">
              Manage your preferences, speech settings, and privacy controls.
            </p>
          </div>

          <div className="flex flex-col lg:flex-row gap-8">
            <div className="lg:w-64">
              <div className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0 custom-scrollbar">
                {settingsSections.map((section) => {
                  const Icon = section.icon;
                  return (
                    <button
                      key={section.id}
                      onClick={() => setActiveSection(section.id)}
                      className={cn(
                        'flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left border border-transparent min-w-[160px] lg:min-w-0',
                        activeSection === section.id
                          ? 'bg-accent-primary/15 text-accent-primary border-accent-primary/30 shadow-[0_8px_20px_-18px_rgba(107,107,255,0.5)]'
                          : 'text-foreground-secondary hover:text-foreground hover:bg-surface-2/70'
                      )}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <div className="flex flex-col">
                        <span className="text-sm font-medium whitespace-nowrap lg:whitespace-normal">{section.label}</span>
                        <span className="hidden lg:block text-[11px] text-foreground-muted">
                          {section.description}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <div className="rounded-2xl border border-white/5 bg-surface-1/40 p-6 md:p-8 space-y-10 animate-fade-in shadow-[0_20px_40px_-40px_rgba(0,0,0,0.8)]">
                {error && (
                  <div className="alert alert-warning">
                    <span className="text-sm">{error}</span>
                  </div>
                )}

                {activeSection === 'plan' && (
                  <PlanSettingsView
                    currentPlan={plan}
                    hasPro={hasPro}
                    upgradeTarget={upgradeTarget}
                    upgradeFeature={upgradeFeature}
                    onPlanChange={(next) => {
                      setPlan(next);
                      toast.success('Plan updated', `You are now on ${next.toUpperCase()}.`);
                    }}
                  />
                )}
                {showAdvancedSections && activeSection === 'performance' && settings?.performance && (
                  <PerformanceSettings
                    device={settings.performance.device}
                    fastMode={settings.performance.fast_mode}
                    preloadModels={settings.performance.preload_models}
                    cudaAvailable={capabilities?.cuda_available ?? false}
                    onChange={handleSettingChange}
                  />
                )}

                {showAdvancedSections && activeSection === 'api-keys' && (
                  <APIKeysSettings
                    providers={apiProviders}
                    apiKeys={apiKeys}
                    drafts={apiKeyDrafts}
                    status={apiKeyStatus}
                    onDraftChange={setApiKeyDrafts}
                    onSave={handleApiKeySave}
                    onTest={handleApiKeyTest}
                  />
                )}

                {showAdvancedSections && activeSection === 'models' && (
                  <ModelsSettings />
                )}

                {activeSection === 'stt' && settings?.stt && (
                  <STTSettingsView
                    sttConfig={settings.stt}
                    onChange={handleSettingChange}
                  />
                )}

                {showAdvancedSections && activeSection === 'hotkeys' && (
                  <HotkeysSettingsView
                    hotkeys={hotkeys}
                    drafts={hotkeyDrafts}
                    onDraftChange={setHotkeyDrafts}
                    onSave={handleHotkeySave}
                  />
                )}

                {activeSection === 'appearance' && settings?.ui && (
                  <AppearanceSettings
                    theme={settings.ui.theme}
                    language={settings.ui.language}
                    onChange={handleSettingChange}
                  />
                )}

                {activeSection === 'notifications' && settings?.ui && (
                  <NotificationsSettings
                    showNotifications={settings.ui.show_notifications}
                    minimizeToTray={settings.ui.minimize_to_tray}
                    actionSounds={settings.ui.action_sounds}
                    onChange={handleSettingChange}
                  />
                )}

                {activeSection === 'privacy' && settings?.ui && (
                  <PrivacySettings
                    saveHistory={settings.ui.save_history}
                    analytics={settings.ui.analytics}
                    onChange={handleSettingChange}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

/* =========================================================
   SUB-COMPONENTS
   ========================================================= */

function PlanSettingsView({
  currentPlan,
  hasPro,
  upgradeTarget,
  upgradeFeature,
  onPlanChange,
}: {
  currentPlan: PlanTier;
  hasPro: boolean;
  upgradeTarget: PlanTier | null;
  upgradeFeature: string | null;
  onPlanChange: (plan: PlanTier) => void;
}) {
  const { devMode, setDevMode } = useDevMode();
  const [usage, setUsage] = useState<{
    monthLabel: string;
    dictateHours: number;
    readerHours: number;
    transcribeHours: number;
  } | null>(null);
  const [usageError, setUsageError] = useState<string | null>(null);

  const plans: Array<{
    id: PlanTier;
    name: string;
    price: string;
    caption: string;
    highlights: string[];
  }> = [
    {
      id: 'free',
      name: 'Free',
      price: '$0',
      caption: 'Try Whisperall with light limits',
      highlights: ['Dictate + Reader', 'Basic Transcribe', 'No setup required'],
    },
    {
      id: 'standard',
      name: 'Standard',
      price: '$7/mo',
      caption: 'Best value for daily dictation',
      highlights: ['Dictation-first UX', 'Reader (TTS) unlimited (fair-use)', 'Transcribe up to 10h/mo'],
    },
    {
      id: 'pro',
      name: 'Pro',
      price: '$12/mo',
      caption: 'Power tools + Labs (beta)',
      highlights: ['Unlock Live Capture + Labs', 'Higher monthly limits', 'BYOK (advanced)'],
    },
  ];

  const limitsByPlan: Record<PlanTier, { dictateHours: number; readerHours: number; transcribeHours: number }> = {
    free: { dictateHours: 1, readerHours: 1, transcribeHours: 0.5 },
    standard: { dictateHours: 50, readerHours: 20, transcribeHours: 10 },
    pro: { dictateHours: 100, readerHours: 50, transcribeHours: 30 },
  };

  const limits = limitsByPlan[currentPlan];

  useEffect(() => {
    let active = true;
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const monthLabel = now.toLocaleString('en-US', { month: 'long', year: 'numeric' });

    getMonthlyHistoryStats(year, month)
      .then((stats) => {
        if (!active) return;
        const byModule = stats?.by_module || {};
        const sttSeconds = byModule.stt?.total_duration || 0;
        const readerSeconds = byModule.reader?.total_duration || 0;
        const transcribeSeconds = byModule.transcribe?.total_duration || 0;
        setUsage({
          monthLabel,
          dictateHours: sttSeconds / 3600,
          readerHours: readerSeconds / 3600,
          transcribeHours: transcribeSeconds / 3600,
        });
      })
      .catch((err: any) => {
        if (!active) return;
        setUsage(null);
        setUsageError(err?.message || 'Failed to load usage');
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground mb-2">Plan &amp; Usage</h2>
          <p className="text-foreground-muted text-sm">
            Manage subscription tier and monthly limits (billing integration coming soon).
          </p>
        </div>
        <span className="badge badge-accent">{currentPlan.toUpperCase()}</span>
      </div>

      {upgradeTarget === 'pro' && !hasPro && (
        <UpgradePrompt
          requiredPlan="pro"
          feature={upgradeFeature ?? undefined}
          title={upgradeFeature ? `Unlock ${upgradeFeature}` : 'Upgrade to Pro'}
          description={
            upgradeFeature
              ? `This feature is part of Pro. Upgrade to unlock it.`
              : 'Upgrade to Pro to unlock Live Capture + Labs.'
          }
          ctaLabel="Upgrade to Pro"
          onUpgrade={() => onPlanChange('pro')}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {plans.map((p) => {
          const isCurrent = p.id === currentPlan;
          const isTarget = p.id === upgradeTarget;
          return (
            <div
              key={p.id}
              className={cn(
                'glass-card p-5 border transition-all',
                isCurrent && 'border-accent-primary/40 shadow-[0_0_0_1px_rgba(14,165,233,0.25)]',
                !isCurrent && isTarget && 'border-amber-500/25'
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{p.name}</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{p.price}</p>
                  <p className="text-xs text-foreground-muted mt-2">{p.caption}</p>
                </div>
                {isCurrent && <span className="badge badge-success">Current</span>}
                {!isCurrent && isTarget && <span className="badge badge-warning">Recommended</span>}
              </div>

              <ul className="mt-4 space-y-2 text-sm text-foreground-secondary">
                {p.highlights.map((h) => (
                  <li key={h} className="flex gap-2">
                    <span className="text-accent-primary">•</span>
                    <span>{h}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-5">
                <button
                  className={cn(
                    'btn w-full',
                    isCurrent ? 'btn-secondary opacity-70 cursor-default' : 'btn-primary'
                  )}
                  disabled={isCurrent}
                  onClick={() => onPlanChange(p.id)}
                >
                  {isCurrent ? 'Current plan' : p.id === 'pro' ? 'Upgrade' : 'Select'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="glass-card p-6 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h3 className="text-lg font-semibold text-foreground">Monthly usage</h3>
          <span className="text-xs text-foreground-muted">
            {usage?.monthLabel ?? 'This month'}
          </span>
        </div>

        <div className="grid gap-4">
          {usageError && (
            <div className="text-xs text-foreground-muted">
              Usage unavailable: {usageError}
            </div>
          )}
          <UsageMeter
            label="Dictation (STT)"
            used={usage?.dictateHours ?? 0}
            limit={limits.dictateHours}
            unit="h"
            caption="Soft limit, then throttle"
          />
          <UsageMeter
            label="Reader (TTS)"
            used={usage?.readerHours ?? 0}
            limit={limits.readerHours}
            unit="h"
            caption="Fair-use limit"
          />
          <UsageMeter
            label="Transcribe (files)"
            used={usage?.transcribeHours ?? 0}
            limit={limits.transcribeHours}
            unit="h"
            caption="Monthly cap"
          />
        </div>
      </div>

      <div className="glass-card p-6 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h3 className="text-lg font-semibold text-foreground">Developer</h3>
          <span className="text-xs text-foreground-muted">
            {devMode ? 'On' : 'Off'}
          </span>
        </div>

        <Toggle
          label="Developer mode"
          description="Enables diagnostics and advanced configuration tools."
          enabled={devMode}
          onChange={setDevMode}
          className="justify-between flex-row-reverse w-full gap-0"
        />

        <p className="text-xs text-foreground-muted">
          Keep this off for a cleaner experience unless you need troubleshooting tools.
        </p>
      </div>
    </div>
  );
}

function PerformanceSettings({
  device,
  fastMode,
  preloadModels,
  onChange,
  cudaAvailable,
}: {
  device: string;
  fastMode: boolean;
  preloadModels: boolean;
  onChange: (key: string, value: any) => void;
  cudaAvailable: boolean;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground mb-2">Performance</h2>
          <p className="text-foreground-muted text-sm">Manage compute resources and optimization</p>
        </div>
      </div>

      <div className="grid gap-4">
        <div className="glass-card p-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-foreground">Inference Device</span>
              {device === 'cuda' && <span className="badge badge-success text-xs">CUDA Active</span>}
            </div>
            <p className="text-xs text-foreground-muted mt-1">
              Select hardware for AI processing
            </p>
          </div>
          <SelectMenu
            value={device}
            options={[
              { value: 'auto', label: 'Auto (Best Available)' },
              { value: 'cuda', label: 'GPU (NVIDIA CUDA)', disabled: !cudaAvailable },
              { value: 'cpu', label: 'CPU (Slower)' },
            ]}
            onChange={(val) => onChange('performance.device', val)}
            buttonClassName="w-48"
          />
        </div>

        <div className="glass-card p-4">
          <Toggle
            label="Fast Mode (Turbo)"
            description="Optimizes inference for speed (fp16/int8). Slight quality loss."
            enabled={fastMode}
            onChange={(val) => onChange('performance.fast_mode', val)}
            className="justify-between flex-row-reverse w-full gap-0"
          />
        </div>

        <div className="glass-card p-4">
          <Toggle
            label="Preload Resources"
            description="Load speech engines at startup for instant response. Uses more RAM."
            enabled={preloadModels}
            onChange={(val) => onChange('performance.preload_models', val)}
            className="justify-between flex-row-reverse w-full gap-0"
          />
        </div>
      </div>
    </div>
  );
}

function APIKeysSettings({
  providers,
  apiKeys,
  drafts,
  status,
  onDraftChange,
  onSave,
  onTest,
}: {
  providers: Array<{ id: string; label: string; description?: string; docsUrl?: string; pricingUrl?: string; consoleUrl?: string; keyLabel?: string; keyInstructions?: string; pricingUnit?: string; pricingNote?: string; }>;
  apiKeys: Record<string, string | null>;
  drafts: Record<string, string>;
  status: Record<string, string>;
  onDraftChange: (drafts: Record<string, string>) => void;
  onSave: (provider: string) => void;
  onTest: (provider: string) => void;
}) {
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});

  const toggleVisibility = (provider: string) => {
    setVisibleKeys((prev) => ({ ...prev, [provider]: !prev[provider] }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground mb-2">API Keys</h2>
          <p className="text-foreground-muted text-sm">Configure access to cloud AI providers</p>
        </div>
      </div>

      <div className="grid gap-4">
        {providers.map((provider) => {
          const isConfigured = !!apiKeys[provider.id];
          const currentStatus = status[provider.id];
          const draftValue = drafts[provider.id] || '';
          const isVisible = visibleKeys[provider.id];

          return (
            <div key={provider.id} className="glass-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{provider.label}</span>
                    {isConfigured && <span className="badge badge-success text-[10px]">Active</span>}
                  </div>
                  {currentStatus && (
                    <span className={cn(
                      "text-xs font-mono block mt-0.5",
                      currentStatus === 'Valid' ? "text-emerald-400" :
                        currentStatus === 'Saved' ? "text-emerald-400" : "text-amber-400"
                    )}>
                      {currentStatus}
                    </span>
                  )}
                </div>
              </div>

              {provider.description && (
                <p className="text-xs text-foreground-muted">{provider.description}</p>
              )}

              <div className="flex flex-wrap gap-2 text-xs text-foreground-muted">
                {provider.docsUrl && (
                  <button
                    onClick={() => {
                      if (window.electronAPI?.openExternal) {
                        window.electronAPI.openExternal(provider.docsUrl!);
                      } else {
                        window.open(provider.docsUrl, '_blank');
                      }
                    }}
                    className="underline hover:text-accent-primary"
                  >
                    Docs
                  </button>
                )}
                {provider.pricingUrl && (
                  <button
                    onClick={() => {
                      if (window.electronAPI?.openExternal) {
                        window.electronAPI.openExternal(provider.pricingUrl!);
                      } else {
                        window.open(provider.pricingUrl, '_blank');
                      }
                    }}
                    className="underline hover:text-accent-primary"
                  >
                    Pricing
                  </button>
                )}
                {provider.consoleUrl && (
                  <button
                    onClick={() => {
                      if (window.electronAPI?.openExternal) {
                        window.electronAPI.openExternal(provider.consoleUrl!);
                      } else {
                        window.open(provider.consoleUrl, '_blank');
                      }
                    }}
                    className="underline hover:text-accent-primary"
                  >
                    Get Key
                  </button>
                )}
              </div>

              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={isVisible ? "text" : "password"}
                    value={draftValue}
                    onChange={(e) => onDraftChange({ ...drafts, [provider.id]: e.target.value })}
                    placeholder={isConfigured ? "••••••••••••••••" : "Enter API Key"}
                    className="input font-mono text-sm pr-10"
                  />
                  <button
                    onClick={() => toggleVisibility(provider.id)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground-muted hover:text-foreground"
                    type="button"
                  >
                    {isVisible ? <Settings className="w-4 h-4" /> : <Key className="w-4 h-4" />}
                  </button>
                </div>
                <button
                  onClick={() => onSave(provider.id)}
                  disabled={!draftValue}
                  className="btn btn-primary px-4"
                >
                  Save
                </button>
                {isConfigured && (
                  <button
                    onClick={() => onTest(provider.id)}
                    className="btn btn-secondary px-4"
                  >
                    Test
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HotkeysSettingsView({
  hotkeys,
  drafts,
  onDraftChange,
  onSave,
}: {
  hotkeys: HotkeysSettings;
  drafts: HotkeysSettings;
  onDraftChange: (drafts: HotkeysSettings) => void;
  onSave: (action: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground mb-2">Hotkeys</h2>
          <p className="text-foreground-muted text-sm">Global system shortcuts</p>
        </div>
      </div>

      <div className="grid gap-4">
        {Object.entries(hotkeyLabels).map(([action, label]) => (
          <div key={action} className="glass-card p-4 flex items-center justify-between gap-4">
            <span className="font-medium text-foreground min-w-[140px]">{label}</span>
            <div className="flex-1 max-w-sm">
              <HotkeyRecorder
                value={drafts[action as keyof HotkeysSettings] || ''}
                onChange={(val) => {
                  onDraftChange({ ...drafts, [action]: val });
                }}
              />
            </div>
            <button
              onClick={() => onSave(action)}
              disabled={drafts[action as keyof HotkeysSettings] === hotkeys[action as keyof HotkeysSettings]}
              className="btn btn-secondary text-xs h-9"
            >
              Save
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function AppearanceSettings({
  theme,
  language,
  onChange,
}: {
  theme: string;
  language: string;
  onChange: (key: string, value: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground mb-2">Appearance</h2>
          <p className="text-foreground-muted text-sm">Customize UI theme and language</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="glass-card p-4 flex items-center justify-between relative z-20">
          <span className="font-medium text-foreground">Theme</span>
          <SelectMenu
            value={theme}
            options={[
              { value: 'dark', label: 'Dark (Midnight)' },
              { value: 'light', label: 'Light (Clean)' },
              { value: 'system', label: 'System Default' },
            ]}
            onChange={(val) => onChange('ui.theme', val)}
            buttonClassName="w-40"
          />
        </div>
        <div className="glass-card p-4 flex items-center justify-between relative z-10">
          <span className="font-medium text-foreground">Language</span>
          <SelectMenu
            value={language}
            options={[
              { value: 'en', label: 'English' },
              { value: 'es', label: 'Spanish' },
            ]}
            onChange={(val) => onChange('ui.language', val)}
            buttonClassName="w-40"
          />
        </div>
      </div>
    </div>
  );
}

function NotificationsSettings({
  showNotifications,
  minimizeToTray,
  actionSounds,
  onChange,
}: {
  showNotifications: boolean;
  minimizeToTray: boolean;
  actionSounds?: { start?: boolean; complete?: boolean };
  onChange: (key: string, value: boolean) => void;
}) {
  const startSoundEnabled = actionSounds?.start ?? true;
  const completeSoundEnabled = actionSounds?.complete ?? true;
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground mb-2">Notifications & Tray</h2>
          <p className="text-foreground-muted text-sm">Control desktop integration</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="glass-card p-4">
          <Toggle
            label="Show Notifications"
            description="System/OS notifications on completion"
            enabled={showNotifications}
            onChange={(val) => onChange('ui.show_notifications', val)}
            className="justify-between flex-row-reverse w-full gap-0"
          />
        </div>

        <div className="glass-card p-4">
          <Toggle
            label="Minimize to Tray"
            description="Keep app running in background"
            enabled={minimizeToTray}
            onChange={(val) => onChange('ui.minimize_to_tray', val)}
            className="justify-between flex-row-reverse w-full gap-0"
          />
        </div>

        <div className="glass-card p-4">
          <Toggle
            label="Action sound on start"
            description="Play a short tone when recording or generation begins."
            enabled={startSoundEnabled}
            onChange={(val) => onChange('ui.action_sounds.start', val)}
            className="justify-between flex-row-reverse w-full gap-0"
          />
        </div>

        <div className="glass-card p-4">
          <Toggle
            label="Action sound on completion"
            description="Play a short tone when the current action finishes."
            enabled={completeSoundEnabled}
            onChange={(val) => onChange('ui.action_sounds.complete', val)}
            className="justify-between flex-row-reverse w-full gap-0"
          />
        </div>
      </div>
    </div>
  );
}

function PrivacySettings({
  saveHistory,
  analytics,
  onChange,
}: {
  saveHistory: boolean;
  analytics: boolean;
  onChange: (key: string, value: boolean) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground mb-2">Privacy</h2>
          <p className="text-foreground-muted text-sm">Data retention and reporting</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="glass-card p-4">
          <Toggle
            label="Save Generation History"
            description="Keep logs of your generated audio"
            enabled={saveHistory}
            onChange={(val) => onChange('ui.save_history', val)}
            className="justify-between flex-row-reverse w-full gap-0"
          />
        </div>

        <div className="glass-card p-4">
          <Toggle
            label="Share Analytics"
            description="Help improve Chatterbox (Anonymous)"
            enabled={analytics}
            onChange={(val) => onChange('ui.analytics', val)}
            className="justify-between flex-row-reverse w-full gap-0"
          />
        </div>
      </div>
    </div>
  );
}

function ModelsSettings() {
  const router = typeof window !== 'undefined' ? require('next/navigation').useRouter() : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground mb-2">Local Resources</h2>
          <p className="text-foreground-muted text-sm">Download or remove offline engines and packages</p>
        </div>
      </div>

      <div className="card p-8 flex flex-col items-center justify-center text-center space-y-6 border-dashed border-2 border-glass-border bg-transparent">
        <div className="w-16 h-16 rounded-full bg-accent-primary/10 flex items-center justify-center mb-2">
          <HardDrive className="w-8 h-8 text-accent-primary" />
        </div>
        <div className="max-w-md space-y-2">
          <h3 className="text-lg font-semibold text-foreground">Advanced Resource Management</h3>
          <p className="text-foreground-secondary">
            We have moved engine management to a dedicated page with detailed progress tracking,
            transcription packages, and API provider diagnostics.
          </p>
        </div>
        <a
          href="/models?tab=local"
          className="btn btn-primary px-8 py-3 flex items-center gap-2 shadow-lg shadow-accent-primary/20 hover:scale-105 transition-transform"
        >
          <Settings2 className="w-4 h-4" />
          Manage Resources
        </a>
      </div>
    </div>
  );
}

function STTSettingsView({
  sttConfig,
  onChange,
}: {
  sttConfig: {
    transcription_mode?: string;
    hotkey_mode?: string;
    auto_paste?: boolean;
    overlay_enabled?: boolean;
    overlay_always_on?: boolean;
    input_device_id?: string;
  };
  onChange: (key: string, value: any) => void;
}) {
  const transcriptionMode = sttConfig.transcription_mode || 'final';
  const hotkeyMode = sttConfig.hotkey_mode || 'toggle';
  const autoPaste = sttConfig.auto_paste ?? false;
  const overlayEnabled = sttConfig.overlay_enabled ?? true;
  const overlayAlwaysOn = sttConfig.overlay_always_on ?? false;

  const handleChange = (key: string, value: any) => {
    onChange(`stt.${key}`, value);
    // Notify Electron to reload STT settings
    if (window.electronAPI?.reloadSttSettings) {
      setTimeout(() => {
        window.electronAPI?.reloadSttSettings?.();
      }, 100);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground mb-2">Speech to Text</h2>
          <p className="text-foreground-muted text-sm">Configure dictation and transcription behavior</p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Audio Input Selector */}
        <AudioInputSelector
          value={sttConfig.input_device_id}
          onChange={(val) => handleChange('input_device_id', val)}
        />

        <div className="glass-card p-4 flex items-center justify-between relative z-20">
          <div>
            <span className="font-medium text-foreground">Transcription Mode</span>
            <p className="text-xs text-foreground-muted mt-1">
              {transcriptionMode === 'live'
                ? 'Live: Shows transcription in real-time while speaking (may be less accurate)'
                : 'Final: Transcribes after you stop speaking (more accurate)'}
            </p>
          </div>
          <SelectMenu
            value={transcriptionMode}
            options={[
              { value: 'final', label: 'Final Only' },
              { value: 'live', label: 'Live Preview' },
            ]}
            onChange={(val) => handleChange('transcription_mode', val)}
            buttonClassName="w-40"
          />
        </div>

        <div className="glass-card p-4 flex items-center justify-between relative z-10">
          <div>
            <span className="font-medium text-foreground">Hotkey Mode</span>
            <p className="text-xs text-foreground-muted mt-1">
              {hotkeyMode === 'hold'
                ? 'Hold: Press hotkey to start, press again to stop'
                : 'Toggle: Press hotkey once to start, press again to stop'}
            </p>
          </div>
          <SelectMenu
            value={hotkeyMode}
            options={[
              { value: 'toggle', label: 'Toggle' },
              { value: 'hold', label: 'Press to Talk' },
            ]}
            onChange={(val) => handleChange('hotkey_mode', val)}
            buttonClassName="w-40"
          />
        </div>

        <div className="glass-card p-4">
          <Toggle
            label="Show Overlay"
            description="Display a floating indicator showing recording status and audio level"
            enabled={overlayEnabled}
            onChange={(val) => handleChange('overlay_enabled', val)}
            className="justify-between flex-row-reverse w-full gap-0"
          />
        </div>

        <div className="glass-card p-4">
          <Toggle
            label="Always Visible Overlay"
            description="Keep the overlay visible on screen even when not recording"
            enabled={overlayAlwaysOn}
            onChange={(val) => handleChange('overlay_always_on', val)}
            disabled={!overlayEnabled}
            className="justify-between flex-row-reverse w-full gap-0"
          />
        </div>

        <div className="glass-card p-4 flex items-center justify-between">
          <div>
            <span className="font-medium text-foreground">Locate Widget</span>
            <p className="text-xs text-foreground-muted mt-1">
              Center the widget on your main monitor and highlight it briefly.
            </p>
          </div>
          <button
            className="btn btn-secondary"
            onClick={() => {
              window.electronAPI?.showWidgetOverlay?.();
              window.electronAPI?.centerWidget?.();
            }}
          >
            Center Widget
          </button>
        </div>

        <div className="glass-card p-4">
          <Toggle
            label="Auto-Paste Result"
            description="Automatically paste transcription at cursor position when done"
            enabled={autoPaste}
            onChange={(val) => handleChange('auto_paste', val)}
            className="justify-between flex-row-reverse w-full gap-0"
          />
        </div>

        <div className="glass-card p-4 bg-accent-primary/5 border-accent-primary/20">
          <div className="flex items-start gap-3">
            <Mic className="w-5 h-5 text-accent-primary mt-0.5" />
            <div>
              <span className="font-medium text-foreground block mb-1">Quick Paste Hotkey</span>
              <p className="text-xs text-foreground-muted">
                Use the "Paste Last Transcript" hotkey (configured in Hotkeys section) to paste
                your last transcription anywhere without affecting your clipboard.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AudioInputSelector({
  value,
  onChange,
}: {
  value?: string;
  onChange: (deviceId: string) => void;
}) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [volume, setVolume] = useState(0);
  const [isTesting, setIsTesting] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const analyserRef = useState<AnalyserNode | null>(null); // Hack to keep ref in state for simple disposal logic if needed
  const animationRef = useState<number | null>(null);

  // Load devices
  const loadDevices = async (forcePermission = false) => {
    try {
      if (forcePermission) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(t => t.stop());
      }
      const devs = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devs.filter(d => d.kind === 'audioinput');
      setDevices(audioInputs);
      setPermissionError(null);
    } catch (err: any) {
      console.error("Failed to list devices", err);
      if (forcePermission) setPermissionError("Microphone access denied. Please allow access.");
    }
  };

  useEffect(() => {
    loadDevices(false);
    navigator.mediaDevices.addEventListener('devicechange', () => loadDevices(false));
    return () => navigator.mediaDevices.removeEventListener('devicechange', () => loadDevices(false));
  }, []);

  // Audio visualizer logic
  const toggleTest = async () => {
    if (isTesting) {
      setIsTesting(false);
      setVolume(0);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: value ? { exact: value } : undefined
        }
      });

      setIsTesting(true);

      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      const microphone = audioContext.createMediaStreamSource(stream);
      const javascriptNode = audioContext.createScriptProcessor(2048, 1, 1);

      analyser.smoothingTimeConstant = 0.8;
      analyser.fftSize = 1024;

      microphone.connect(analyser);
      analyser.connect(javascriptNode);
      javascriptNode.connect(audioContext.destination);

      const runLoop = () => {
        if (!isTesting) { // Check if we should stop. This is tricky inside closure, relying on cleanup function instead.
          // Actually script processor is deprecated but easiest for volume meter.
          // Let's use requestAnimationFrame with analyser.getByteFrequencyData
        }
      };

      javascriptNode.onaudioprocess = () => {
        // Safe check? In React hooks this is messy.
        // Let's simplify: just update volume state
        const array = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(array);
        let values = 0;
        const length = array.length;
        for (let i = 0; i < length; i++) {
          values += array[i];
        }
        const average = values / length;
        setVolume(Math.min(100, average * 1.5)); // Scale up a bit
      };

      // Store cleanup function
      (window as any).__stopAudioTest = () => {
        stream.getTracks().forEach(t => t.stop());
        javascriptNode.disconnect();
        analyser.disconnect();
        microphone.disconnect();
        audioContext.close();
      };

    } catch (err) {
      console.error("Failed to start audio test", err);
      setIsTesting(false);
    }
  };

  useEffect(() => {
    if (!isTesting && (window as any).__stopAudioTest) {
      (window as any).__stopAudioTest();
      (window as any).__stopAudioTest = null;
    }
    return () => {
      if ((window as any).__stopAudioTest) {
        (window as any).__stopAudioTest();
      }
    };
  }, [isTesting]);

  return (
    <div className="glass-card p-4 space-y-3 relative z-30">
      <div className="flex items-center justify-between">
        <div>
          <span className="font-medium text-foreground">Microphone Input</span>
          <p className="text-xs text-foreground-muted mt-1">Select the device to use for dictation</p>
        </div>
        {permissionError && <span className="text-xs text-error">{permissionError}</span>}
      </div>

      <div className="flex gap-2 items-center">
        <SelectMenu
          value={value || 'default'}
          options={[
            { value: 'default', label: 'Default System Device' },
            ...devices.map(d => ({ value: d.deviceId, label: d.label || `Device ${d.deviceId.slice(0, 4)}...` }))
          ]}
          onChange={onChange}
          buttonClassName="flex-1"
        />
        <button
          onClick={() => loadDevices(true)}
          className="btn btn-secondary px-3 shrink-0"
          title="Refresh device list"
        >
          ↻
        </button>
        <button
          onClick={toggleTest}
          className={cn(
            "btn px-3 w-24 shrink-0 transition-all",
            isTesting ? "btn-danger" : "btn-secondary"
          )}
        >
          {isTesting ? "Stop" : "Test"}
        </button>
      </div>

      {/* Volume Meter */}
      <div className="h-2 bg-surface-2 rounded-full overflow-hidden mt-2 relative">
        <div
          className={cn(
            "absolute top-0 left-0 h-full transition-all duration-75 ease-out",
            volume > 80 ? "bg-red-500" : volume > 50 ? "bg-amber-400" : "bg-emerald-400"
          )}
          style={{ width: `${isTesting ? volume : 0}%` }}
        />
      </div>
    </div>
  );
}
