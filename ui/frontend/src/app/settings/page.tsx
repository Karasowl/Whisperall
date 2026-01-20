'use client';

import { useEffect, useState } from 'react';
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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
  type HotkeysSettings,
  type ModelInfo,
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
} from '@/lib/api';
import { SelectMenu } from '@/components/SelectMenu';
import { HotkeyRecorder } from '@/components/HotkeyRecorder';
import { applyLanguage, applyTheme } from '@/lib/uiSettings';
import { applyActionSoundConfig } from '@/lib/actionSounds';

const settingsSections = [
  { id: 'performance', label: 'Performance', icon: Zap, description: 'GPU, device, and speed settings' },
  { id: 'api-keys', label: 'API Keys', icon: Key, description: 'Manage API keys for cloud services' },
  { id: 'models', label: 'Models', icon: HardDrive, description: 'Install or remove local models' },
  { id: 'hotkeys', label: 'Hotkeys', icon: Keyboard, description: 'Customize global shortcuts' },
  { id: 'appearance', label: 'Appearance', icon: Palette, description: 'Theme and language' },
  { id: 'notifications', label: 'Notifications', icon: Bell, description: 'Alerts and tray behavior' },
  { id: 'privacy', label: 'Privacy', icon: Shield, description: 'History and analytics' },
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
  const [activeSection, setActiveSection] = useState('performance');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [settings, setSettings] = useState<any>(null);
  const [apiKeys, setApiKeysState] = useState<Record<string, string | null>>({});
  const [hotkeys, setHotkeysState] = useState<HotkeysSettings>(defaultHotkeys);
  const [hotkeyDrafts, setHotkeyDrafts] = useState<HotkeysSettings>(defaultHotkeys);
  const [apiKeyDrafts, setApiKeyDrafts] = useState<Record<string, string>>({});
  const [apiKeyStatus, setApiKeyStatus] = useState<Record<string, string>>({});
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelBusy, setModelBusy] = useState<Record<string, string>>({});
  const [confirmModel, setConfirmModel] = useState<ModelInfo | null>(null);
  const [appMeta, setAppMeta] = useState<{ version?: string; build_time?: string } | null>(null);
  const [capabilities, setCapabilities] = useState<SystemCapabilities | null>(null);
  const [providerCatalog, setProviderCatalog] = useState<ProviderCatalogEntry[]>([]);

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
          applyTheme(results[0].value.ui.theme);
          applyLanguage(results[0].value.ui.language);
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
    } catch (err: any) {
      setApiKeyStatus((prev) => ({ ...prev, [provider]: err.message || 'Save failed' }));
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
    } catch (err: any) {
      setApiKeyStatus((prev) => ({ ...prev, [provider]: err.message || 'Test failed' }));
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
    } catch (err: any) {
      setError(err.message || 'Failed to update hotkey');
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
    // Legacy function, now handled in Models page. 
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
    <div className="flex h-[calc(100vh-6rem)] overflow-hidden gap-8">
      {/* Sidebar */}
      <div className="w-64 flex-shrink-0 space-y-1">
        {settingsSections.map((section) => {
          const Icon = section.icon;
          return (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left',
                activeSection === section.id
                  ? 'bg-accent-primary/10 text-accent-primary font-medium'
                  : 'text-foreground-secondary hover:text-foreground hover:bg-surface-2'
              )}
            >
              <Icon className="w-5 h-5" />
              <span>{section.label}</span>
            </button>
          );
        })}
      </div>

      {/* Content Area */}
      <div className="flex-1 min-w-0 max-w-4xl space-y-8 animate-fade-in overflow-y-auto pr-4 custom-scrollbar">
        <div className="flex items-center justify-between sticky top-0 bg-background/80 backdrop-blur-md py-4 z-30">
          <div>
            <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-accent-primary to-accent-secondary">
              Settings
            </h1>
          </div>
          {appMeta && (
            <div className="text-right text-xs text-foreground-muted">
              <p>v{appMeta.version}</p>
            </div>
          )}
        </div>

        <div className="pb-20">
          {activeSection === 'performance' && settings?.performance && (
            <PerformanceSettings
              device={settings.performance.device}
              fastMode={settings.performance.fast_mode}
              preloadModels={settings.performance.preload_models}
              cudaAvailable={capabilities?.cuda_available ?? false}
              onChange={handleSettingChange}
            />
          )}

          {activeSection === 'api-keys' && (
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

          {activeSection === 'models' && (
            <ModelsSettings />
          )}

          {activeSection === 'hotkeys' && (
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
  );
}

/* =========================================================
   SUB-COMPONENTS
   ========================================================= */

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

        <div className="glass-card p-4 flex items-center justify-between">
          <div>
            <span className="font-medium text-foreground">Fast Mode (Turbo)</span>
            <p className="text-xs text-foreground-muted mt-1">
              Optimizes inference for speed (fp16/int8). Slight quality loss.
            </p>
          </div>
          <button
            onClick={() => onChange('performance.fast_mode', !fastMode)}
            className={cn(
              'w-12 h-7 rounded-full transition-colors relative',
              fastMode ? 'bg-accent-primary' : 'bg-surface-3'
            )}
          >
            <div
              className={cn(
                'w-5 h-5 bg-white rounded-full absolute top-1 transition-transform',
                fastMode ? 'translate-x-6' : 'translate-x-1'
              )}
            />
          </button>
        </div>

        <div className="glass-card p-4 flex items-center justify-between">
          <div>
            <span className="font-medium text-foreground">Preload Models</span>
            <p className="text-xs text-foreground-muted mt-1">
              Load TTS models at startup for instant response. Uses more RAM.
            </p>
          </div>
          <button
            onClick={() => onChange('performance.preload_models', !preloadModels)}
            className={cn(
              'w-12 h-7 rounded-full transition-colors relative',
              preloadModels ? 'bg-accent-primary' : 'bg-surface-3'
            )}
          >
            <div
              className={cn(
                'w-5 h-5 bg-white rounded-full absolute top-1 transition-transform',
                preloadModels ? 'translate-x-6' : 'translate-x-1'
              )}
            />
          </button>
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
              { value: 'es', label: 'Español' },
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
        <div className="glass-card p-4 flex items-center justify-between">
          <div>
            <span className="font-medium text-foreground">Show Notifications</span>
            <p className="text-xs text-foreground-muted mt-0.5">System/OS notifications on completion</p>
          </div>
          <button
            onClick={() => onChange('ui.show_notifications', !showNotifications)}
            className={cn(
              'w-12 h-7 rounded-full transition-colors relative',
              showNotifications ? 'bg-accent-primary' : 'bg-surface-3'
            )}
          >
            <div
              className={cn(
                'w-5 h-5 bg-white rounded-full absolute top-1 transition-transform',
                showNotifications ? 'translate-x-6' : 'translate-x-1'
              )}
            />
          </button>
        </div>

        <div className="glass-card p-4 flex items-center justify-between">
          <div>
            <span className="font-medium text-foreground">Minimize to Tray</span>
            <p className="text-xs text-foreground-muted mt-0.5">Keep app running in background</p>
          </div>
          <button
            onClick={() => onChange('ui.minimize_to_tray', !minimizeToTray)}
            className={cn(
              'w-12 h-7 rounded-full transition-colors relative',
              minimizeToTray ? 'bg-accent-primary' : 'bg-surface-3'
            )}
          >
            <div
              className={cn(
                'w-5 h-5 bg-white rounded-full absolute top-1 transition-transform',
                minimizeToTray ? 'translate-x-6' : 'translate-x-1'
              )}
            />
          </button>
        </div>
        <div className="glass-card p-4 flex items-center justify-between">
          <div>
            <span className="font-medium text-foreground">Action sound on start</span>
            <p className="text-xs text-foreground-muted mt-0.5">
              Play a short tone when recording or generation begins.
            </p>
          </div>
          <button
            onClick={() => onChange('ui.action_sounds.start', !startSoundEnabled)}
            className={cn(
              'w-12 h-7 rounded-full transition-colors relative',
              startSoundEnabled ? 'bg-accent-primary' : 'bg-surface-3'
            )}
          >
            <div
              className={cn(
                'w-5 h-5 bg-white rounded-full absolute top-1 transition-transform',
                startSoundEnabled ? 'translate-x-6' : 'translate-x-1'
              )}
            />
          </button>
        </div>
        <div className="glass-card p-4 flex items-center justify-between">
          <div>
            <span className="font-medium text-foreground">Action sound on completion</span>
            <p className="text-xs text-foreground-muted mt-0.5">
              Play a short tone when the current action finishes.
            </p>
          </div>
          <button
            onClick={() => onChange('ui.action_sounds.complete', !completeSoundEnabled)}
            className={cn(
              'w-12 h-7 rounded-full transition-colors relative',
              completeSoundEnabled ? 'bg-accent-primary' : 'bg-surface-3'
            )}
          >
            <div
              className={cn(
                'w-5 h-5 bg-white rounded-full absolute top-1 transition-transform',
                completeSoundEnabled ? 'translate-x-6' : 'translate-x-1'
              )}
            />
          </button>
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
        <div className="glass-card p-4 flex items-center justify-between">
          <div>
            <span className="font-medium text-foreground">Save Generation History</span>
            <p className="text-xs text-foreground-muted mt-0.5">Keep logs of your generated audio</p>
          </div>
          <button
            onClick={() => onChange('ui.save_history', !saveHistory)}
            className={cn(
              'w-12 h-7 rounded-full transition-colors relative',
              saveHistory ? 'bg-accent-primary' : 'bg-surface-3'
            )}
          >
            <div
              className={cn(
                'w-5 h-5 bg-white rounded-full absolute top-1 transition-transform',
                saveHistory ? 'translate-x-6' : 'translate-x-1'
              )}
            />
          </button>
        </div>

        <div className="glass-card p-4 flex items-center justify-between">
          <div>
            <span className="font-medium text-foreground">Share Analytics</span>
            <p className="text-xs text-foreground-muted mt-0.5">Help improve Chatterbox (Anonymous)</p>
          </div>
          <button
            onClick={() => onChange('ui.analytics', !analytics)}
            className={cn(
              'w-12 h-7 rounded-full transition-colors relative',
              analytics ? 'bg-accent-primary' : 'bg-surface-3'
            )}
          >
            <div
              className={cn(
                'w-5 h-5 bg-white rounded-full absolute top-1 transition-transform',
                analytics ? 'translate-x-6' : 'translate-x-1'
              )}
            />
          </button>
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
          <h2 className="text-xl font-semibold text-foreground mb-2">Local Models</h2>
          <p className="text-foreground-muted text-sm">Download or remove models for offline use</p>
        </div>
      </div>

      <div className="card p-8 flex flex-col items-center justify-center text-center space-y-6 border-dashed border-2 border-glass-border bg-transparent">
        <div className="w-16 h-16 rounded-full bg-accent-primary/10 flex items-center justify-center mb-2">
          <HardDrive className="w-8 h-8 text-accent-primary" />
        </div>
        <div className="max-w-md space-y-2">
          <h3 className="text-lg font-semibold text-foreground">Advanced Model Management</h3>
          <p className="text-foreground-secondary">
            We have moved model management to a dedicated page with detailed progress tracking,
            Speech-to-Text models, and API provider diagnostics.
          </p>
        </div>
        <a
          href="/models?tab=local"
          className="btn btn-primary px-8 py-3 flex items-center gap-2 shadow-lg shadow-accent-primary/20 hover:scale-105 transition-transform"
        >
          <Settings2 className="w-4 h-4" />
          Manage Models
        </a>
      </div>
    </div>
  );
}
