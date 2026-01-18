'use client';

import { useEffect, useState } from 'react';
import {
  Settings,
  Key,
  Cpu,
  Keyboard,
  Palette,
  HardDrive,
  Bell,
  Shield,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
  type ProvidersSettings,
  type HotkeysSettings,
  type ModelInfo,
  getAllSettings,
  getProviders,
  setProvider,
  getApiKeys,
  setApiKey,
  testApiKey,
  getHotkeys,
  setHotkey,
  getHealth,
  getAllModels,
  downloadModel,
  deleteModel,
  updateSetting,
} from '@/lib/api';
import { SelectMenu } from '@/components/SelectMenu';

const settingsSections = [
  { id: 'providers', label: 'Providers', icon: Cpu, description: 'Choose providers per feature' },
  { id: 'api-keys', label: 'API Keys', icon: Key, description: 'Manage API keys for cloud services' },
  { id: 'models', label: 'Models', icon: HardDrive, description: 'Install or remove local models' },
  { id: 'hotkeys', label: 'Hotkeys', icon: Keyboard, description: 'Customize global shortcuts' },
  { id: 'appearance', label: 'Appearance', icon: Palette, description: 'Theme and language' },
  { id: 'notifications', label: 'Notifications', icon: Bell, description: 'Alerts and tray behavior' },
  { id: 'privacy', label: 'Privacy', icon: Shield, description: 'History and analytics' },
];

const providerOptions = {
  tts: [
    { value: 'chatterbox', label: 'Chatterbox (Local)' },
    { value: 'kokoro', label: 'Kokoro (Local)' },
    { value: 'elevenlabs', label: 'ElevenLabs' },
    { value: 'openai', label: 'OpenAI TTS' },
  ],
  stt: [
    { value: 'faster-whisper-tiny', label: 'Faster-Whisper Tiny' },
    { value: 'faster-whisper-base', label: 'Faster-Whisper Base' },
    { value: 'faster-whisper-small', label: 'Faster-Whisper Small' },
    { value: 'faster-whisper-medium', label: 'Faster-Whisper Medium' },
    { value: 'faster-whisper-large-v3', label: 'Faster-Whisper Large V3' },
    { value: 'faster-distil-whisper-large-v3', label: 'Distil-Whisper Large V3' },
    { value: 'openai', label: 'OpenAI Whisper' },
    { value: 'deepgram', label: 'Deepgram' },
  ],
  ai_edit: [
    { value: 'ollama', label: 'Ollama (Local)' },
    { value: 'openai', label: 'OpenAI' },
    { value: 'claude', label: 'Claude' },
    { value: 'gemini', label: 'Gemini' },
  ],
  translation: [
    { value: 'argos', label: 'Argos (Local)' },
    { value: 'deepl', label: 'DeepL' },
    { value: 'google', label: 'Google Translate' },
  ],
};

const apiKeyProviders = [
  { id: 'openai', label: 'OpenAI' },
  { id: 'elevenlabs', label: 'ElevenLabs' },
  { id: 'claude', label: 'Claude' },
  { id: 'gemini', label: 'Gemini' },
  { id: 'deepl', label: 'DeepL' },
  { id: 'deepgram', label: 'Deepgram' },
  { id: 'google', label: 'Google Translate' },
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

const providerDefaults: ProvidersSettings = {
  tts: { selected: 'chatterbox' },
  stt: { selected: 'faster-whisper-base' },
  ai_edit: { selected: 'openai' },
  translation: { selected: 'argos' },
};

function normalizeProviders(input: any): ProvidersSettings {
  if (!input || typeof input !== 'object') {
    return {
      tts: { ...providerDefaults.tts },
      stt: { ...providerDefaults.stt },
      ai_edit: { ...providerDefaults.ai_edit },
      translation: { ...providerDefaults.translation },
    };
  }
  return {
    tts: { ...providerDefaults.tts, ...(input.tts || {}) },
    stt: { ...providerDefaults.stt, ...(input.stt || {}) },
    ai_edit: { ...providerDefaults.ai_edit, ...(input.ai_edit || {}) },
    translation: { ...providerDefaults.translation, ...(input.translation || {}) },
  };
}

function formatLoadError(err: any) {
  if (!err) return 'failed';
  const status = err.response?.status ? ` [${err.response.status}]` : '';
  const url = err.config?.url ? ` (${err.config.url})` : '';
  return `${err.message || 'failed'}${status}${url}`;
}

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState('providers');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [settings, setSettings] = useState<any>(null);
  const [providers, setProvidersState] = useState<ProvidersSettings | null>(null);
  const [apiKeys, setApiKeysState] = useState<Record<string, string | null>>({});
  const [hotkeys, setHotkeysState] = useState<HotkeysSettings>({});
  const [hotkeyDrafts, setHotkeyDrafts] = useState<HotkeysSettings>({});
  const [apiKeyDrafts, setApiKeyDrafts] = useState<Record<string, string>>({});
  const [apiKeyStatus, setApiKeyStatus] = useState<Record<string, string>>({});
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelBusy, setModelBusy] = useState<Record<string, string>>({});
  const [confirmModel, setConfirmModel] = useState<ModelInfo | null>(null);
  const [appMeta, setAppMeta] = useState<{ version?: string; build_time?: string } | null>(null);

  const loadSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const results = await Promise.allSettled([
        getAllSettings(),
        getProviders(),
        getApiKeys(),
        getHotkeys(),
        getAllModels(),
        getHealth(),
      ]);

      const errors: string[] = [];

      if (results[0].status === 'fulfilled') {
        setSettings(results[0].value);
      } else {
        errors.push(`settings ${formatLoadError(results[0].reason)}`);
      }

      if (results[1].status === 'fulfilled') {
        setProvidersState(normalizeProviders(results[1].value));
      } else {
        errors.push(`providers ${formatLoadError(results[1].reason)}`);
      }

      if (results[2].status === 'fulfilled') {
        setApiKeysState(results[2].value.api_keys || {});
      } else {
        errors.push(`api keys ${formatLoadError(results[2].reason)}`);
      }

      if (results[3].status === 'fulfilled') {
        setHotkeysState(results[3].value);
        setHotkeyDrafts(results[3].value);
        if (window.electronAPI?.updateHotkeys) {
          window.electronAPI.updateHotkeys(results[3].value);
        }
      } else {
        errors.push(`hotkeys ${formatLoadError(results[3].reason)}`);
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

  const handleProviderChange = async (functionName: keyof ProvidersSettings, provider: string) => {
    if (!providers) return;
    try {
      await setProvider(functionName, provider);
      setProvidersState({
        ...providers,
        [functionName]: { ...providers[functionName], selected: provider },
      });
    } catch (err: any) {
      setError(err.message || 'Failed to update provider');
    }
  };

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
    } catch (err: any) {
      setError(err.message || 'Failed to update setting');
    }
  };

  const handleModelDownload = async (modelId: string) => {
    setModelBusy((prev) => ({ ...prev, [modelId]: 'Downloading...' }));
    try {
      await downloadModel(modelId);
      await loadSettings();
    } catch (err: any) {
      setError(err.message || 'Model download failed');
    } finally {
      setModelBusy((prev) => ({ ...prev, [modelId]: '' }));
    }
  };

  const handleModelDelete = async (modelId: string) => {
    setModelBusy((prev) => ({ ...prev, [modelId]: 'Deleting...' }));
    try {
      await deleteModel(modelId);
      await loadSettings();
    } catch (err: any) {
      setError(err.message || 'Model delete failed');
    } finally {
      setModelBusy((prev) => ({ ...prev, [modelId]: '' }));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="w-8 h-8 animate-spin text-foreground-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-slide-up">
      <ConfirmDialog
        open={!!confirmModel}
        title={`Install ${confirmModel?.name || 'model'}?`}
        description={
          confirmModel
            ? `This will download about ${confirmModel.size_mb} MB to your disk.`
            : undefined
        }
        confirmLabel="Download"
        onCancel={() => setConfirmModel(null)}
        onConfirm={async () => {
          if (!confirmModel) return;
          const modelId = confirmModel.id;
          setConfirmModel(null);
          await handleModelDownload(modelId);
        }}
        busy={!!(confirmModel && modelBusy[confirmModel.id])}
      />
      <div className="flex items-start justify-between gap-6">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold text-gradient">Settings</h1>
          <p className="text-foreground-muted">
            Configure providers, API keys, models, and hotkeys.
          </p>
        </div>
        <div className="text-xs text-foreground-muted text-right">
          <div>Version {appMeta?.version || 'dev'}</div>
          {appMeta?.build_time && <div>Build {appMeta.build_time}</div>}
        </div>
      </div>

      {error && (
        <div className="glass-card p-4 border-red-500/30 bg-red-500/10 text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1">
          <div className="glass-card p-2 space-y-1">
            {settingsSections.map((section) => {
              const Icon = section.icon;
              return (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={cn(
                    'w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all',
                    activeSection === section.id
                      ? 'bg-gradient-to-r from-emerald-500/20 to-amber-400/20 text-foreground'
                      : 'text-foreground-muted hover:bg-white/5 hover:text-foreground'
                  )}
                >
                  <Icon className={cn(
                    'w-5 h-5',
                    activeSection === section.id ? 'text-emerald-300' : ''
                  )} />
                  <span className="font-medium">{section.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-3">
          <div className="glass-card p-8">
            {activeSection === 'providers' && providers && (
              <ProvidersSection
                providers={normalizeProviders(providers)}
                onChange={handleProviderChange}
              />
            )}
            {activeSection === 'api-keys' && (
              <APIKeysSettings
                apiKeys={apiKeys}
                drafts={apiKeyDrafts}
                status={apiKeyStatus}
                onDraftChange={setApiKeyDrafts}
                onSave={handleApiKeySave}
                onTest={handleApiKeyTest}
              />
            )}
            {activeSection === 'models' && (
              <ModelsSettings
                models={models}
                busy={modelBusy}
                onDownload={(modelId) => {
                  const model = models.find((item) => item.id === modelId) || null;
                  setConfirmModel(model);
                }}
                onDelete={handleModelDelete}
              />
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
  );
}

function ProvidersSection({
  providers,
  onChange,
}: {
  providers: ProvidersSettings;
  onChange: (fn: keyof ProvidersSettings, provider: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground mb-2">Providers</h2>
        <p className="text-foreground-muted text-sm">Pick the engine for each feature</p>
      </div>

      <ProviderSelector
        label="Text to Speech"
        options={providerOptions.tts}
        value={providers.tts.selected}
        onChange={(value) => onChange('tts', value)}
      />
      <ProviderSelector
        label="Speech to Text"
        options={providerOptions.stt}
        value={providers.stt.selected}
        onChange={(value) => onChange('stt', value)}
      />
      <ProviderSelector
        label="AI Edit"
        options={providerOptions.ai_edit}
        value={providers.ai_edit.selected}
        onChange={(value) => onChange('ai_edit', value)}
      />
      <ProviderSelector
        label="Translation"
        options={providerOptions.translation}
        value={providers.translation.selected}
        onChange={(value) => onChange('translation', value)}
      />
    </div>
  );
}

function ProviderSelector({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="glass p-4 rounded-xl flex items-center justify-between">
      <span className="font-medium text-foreground">{label}</span>
      <SelectMenu
        value={value}
        options={options}
        onChange={onChange}
        buttonClassName="w-56 text-sm"
      />
    </div>
  );
}

function APIKeysSettings({
  apiKeys,
  drafts,
  status,
  onDraftChange,
  onSave,
  onTest,
}: {
  apiKeys: Record<string, string | null>;
  drafts: Record<string, string>;
  status: Record<string, string>;
  onDraftChange: (drafts: Record<string, string>) => void;
  onSave: (provider: string) => void;
  onTest: (provider: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground mb-2">API Keys</h2>
        <p className="text-foreground-muted text-sm">Store and validate cloud API keys</p>
      </div>

      <div className="space-y-4">
        {apiKeyProviders.map((provider) => (
          <div key={provider.id} className="glass p-4 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-foreground">{provider.label}</label>
                {provider.description && (
                  <p className="text-xs text-foreground-muted">{provider.description}</p>
                )}
              </div>
              <span className="text-xs text-foreground-muted">
                {apiKeys[provider.id] ? apiKeys[provider.id] : 'Not configured'}
              </span>
            </div>
            <div className="flex gap-2">
              <input
                type="password"
                placeholder="Enter API key"
                className="input flex-1"
                value={drafts[provider.id] || ''}
                onChange={(e) => onDraftChange({ ...drafts, [provider.id]: e.target.value })}
              />
              <button className="btn btn-secondary" onClick={() => onTest(provider.id)}>
                Test
              </button>
              <button className="btn btn-primary" onClick={() => onSave(provider.id)}>
                Save
              </button>
            </div>
            {status[provider.id] && (
              <p className="text-xs text-foreground-muted">{status[provider.id]}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ModelsSettings({
  models,
  busy,
  onDownload,
  onDelete,
}: {
  models: ModelInfo[];
  busy: Record<string, string>;
  onDownload: (modelId: string) => void;
  onDelete: (modelId: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground mb-2">Local Models</h2>
        <p className="text-foreground-muted text-sm">Download or remove models for offline use</p>
      </div>

      <div className="space-y-4 max-h-[520px] overflow-y-auto pr-2">
        {models.map((model) => (
          <div key={model.id} className="glass p-4 rounded-xl flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <p className="font-medium text-foreground">{model.name}</p>
                <span className="badge text-xs">{model.category.toUpperCase()}</span>
                {model.installed && <span className="badge badge-success">Installed</span>}
              </div>
              <p className="text-xs text-foreground-muted mt-1">{model.description}</p>
              <p className="text-xs text-foreground-muted mt-1">Size: {model.size_mb} MB</p>
            </div>

            <div className="flex items-center gap-2">
              {model.installed ? (
                <button
                  className="btn btn-danger text-sm"
                  onClick={() => onDelete(model.id)}
                  disabled={!!busy[model.id]}
                >
                  {busy[model.id] || 'Remove'}
                </button>
              ) : (
                <button
                  className="btn btn-primary text-sm"
                  onClick={() => onDownload(model.id)}
                  disabled={!!busy[model.id]}
                >
                  {busy[model.id] || 'Download'}
                </button>
              )}
            </div>
          </div>
        ))}
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
  const actions = Object.keys(hotkeys);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground mb-2">Hotkeys</h2>
        <p className="text-foreground-muted text-sm">Set global shortcuts</p>
      </div>

      <div className="space-y-4">
        {actions.map((action) => (
          <div key={action} className="glass p-4 rounded-xl flex items-center justify-between gap-4">
            <span className="font-medium text-foreground">{hotkeyLabels[action] || action}</span>
            <div className="flex items-center gap-2">
              <input
                className="input w-40 font-mono text-sm"
                value={drafts[action] || ''}
                onChange={(e) => onDraftChange({ ...drafts, [action]: e.target.value })}
              />
              <button className="btn btn-secondary" onClick={() => onSave(action)}>
                Save
              </button>
            </div>
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
  onChange: (path: string, value: any) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground mb-2">Appearance</h2>
        <p className="text-foreground-muted text-sm">Theme and language settings</p>
      </div>

      <div className="space-y-4">
        <div className="glass p-4 rounded-xl flex items-center justify-between">
          <span className="font-medium text-foreground">Theme</span>
          <SelectMenu
            value={theme}
            options={[
              { value: 'dark', label: 'Dark' },
              { value: 'light', label: 'Light' },
              { value: 'system', label: 'System' },
            ]}
            onChange={(value) => onChange('ui.theme', value)}
            buttonClassName="w-32 text-sm"
          />
        </div>
        <div className="glass p-4 rounded-xl flex items-center justify-between">
          <span className="font-medium text-foreground">Language</span>
          <SelectMenu
            value={language}
            options={[
              { value: 'en', label: 'English' },
              { value: 'es', label: 'Espanol' },
            ]}
            onChange={(value) => onChange('ui.language', value)}
            buttonClassName="w-32 text-sm"
          />
        </div>
      </div>
    </div>
  );
}

function NotificationsSettings({
  showNotifications,
  minimizeToTray,
  onChange,
}: {
  showNotifications: boolean;
  minimizeToTray: boolean;
  onChange: (path: string, value: any) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground mb-2">Notifications</h2>
        <p className="text-foreground-muted text-sm">Configure alerts and tray behavior</p>
      </div>

      <div className="space-y-4">
        <ToggleSetting
          label="Show notifications"
          description="Display system notifications for events"
          checked={showNotifications}
          onToggle={(val) => onChange('ui.show_notifications', val)}
        />
        <ToggleSetting
          label="Minimize to tray"
          description="Keep the app running in the tray when closed"
          checked={minimizeToTray}
          onToggle={(val) => onChange('ui.minimize_to_tray', val)}
        />
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
  onChange: (path: string, value: any) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground mb-2">Privacy</h2>
        <p className="text-foreground-muted text-sm">Control what gets saved locally</p>
      </div>

      <div className="space-y-4">
        <ToggleSetting
          label="Save history"
          description="Store generation history in the local database"
          checked={saveHistory}
          onToggle={(val) => onChange('ui.save_history', val)}
        />
        <ToggleSetting
          label="Analytics"
          description="Share anonymous usage analytics"
          checked={analytics}
          onToggle={(val) => onChange('ui.analytics', val)}
        />
      </div>
    </div>
  );
}

function ToggleSetting({
  label,
  description,
  checked,
  onToggle,
}: {
  label: string;
  description: string;
  checked: boolean;
  onToggle: (value: boolean) => void;
}) {
  return (
    <div className="glass p-4 rounded-xl flex items-center justify-between">
      <div>
        <p className="font-medium text-foreground">{label}</p>
        <p className="text-xs text-foreground-muted">{description}</p>
      </div>
      <button
        onClick={() => onToggle(!checked)}
        className={cn(
          'w-12 h-7 rounded-full transition-colors relative',
          checked ? 'bg-emerald-500' : 'bg-white/10'
        )}
      >
        <div
          className={cn(
            'w-5 h-5 bg-white rounded-full absolute top-1 transition-transform',
            checked ? 'translate-x-6' : 'translate-x-1'
          )}
        />
      </button>
    </div>
  );
}
