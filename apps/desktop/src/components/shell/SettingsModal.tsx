import { useState, useEffect } from 'react';
import { useSettingsStore, type Theme, type UiLocale } from '../../stores/settings';
import { useAuthStore } from '../../stores/auth';
import { useProviderAuthStore } from '../../stores/provider-auth';
import { useNotificationsStore } from '../../stores/notifications';
import { electron } from '../../lib/electron';
import { useT } from '../../lib/i18n';
import { UsageMeter } from '../UsageMeter';
import { getTtsVoiceLabel, useTtsVoices } from '../../lib/tts-voices';
import { Button } from '../ui/Button';

type Props = { onClose: () => void; onOpenPricing: () => void };

type SectionId =
  | 'general' | 'account' | 'providers' | 'hotkeys'
  | 'audio' | 'transcription' | 'tts' | 'overlay' | 'advanced';

const SECTIONS: { id: SectionId; labelKey: string; icon: string }[] = [
  { id: 'general', labelKey: 'settings.section.general', icon: 'tune' },
  { id: 'account', labelKey: 'settings.section.account', icon: 'person' },
  { id: 'providers', labelKey: 'settings.section.providers', icon: 'key' },
  { id: 'hotkeys', labelKey: 'settings.section.hotkeys', icon: 'keyboard' },
  { id: 'audio', labelKey: 'settings.section.audio', icon: 'mic' },
  { id: 'transcription', labelKey: 'settings.section.transcription', icon: 'translate' },
  { id: 'tts', labelKey: 'settings.section.tts', icon: 'volume_up' },
  { id: 'overlay', labelKey: 'settings.section.overlay', icon: 'widgets' },
  { id: 'advanced', labelKey: 'settings.section.advanced', icon: 'code' },
];

const HOTKEY_ACTIONS: { action: string; key: string; icon: string }[] = [
  { action: 'dictate', key: 'hotkey.dictate', icon: 'mic' },
  { action: 'read_clipboard', key: 'hotkey.readClipboard', icon: 'volume_up' },
  { action: 'stt_paste', key: 'hotkey.sttPaste', icon: 'content_paste' },
  { action: 'translate', key: 'hotkey.translate', icon: 'translate' },
  { action: 'overlay_toggle', key: 'hotkey.overlayToggle', icon: 'widgets' },
];

const TARGET_LANGS = [
  { value: 'en', label: 'English' }, { value: 'es', label: 'Español' },
  { value: 'fr', label: 'Français' }, { value: 'de', label: 'Deutsch' },
  { value: 'pt', label: 'Português' }, { value: 'ja', label: '日本語' },
  { value: 'zh', label: '中文' },
];
const TTS_LANGS = [
  { value: 'auto', label: 'Auto' }, { value: 'en', label: 'English' }, { value: 'es', label: 'Español' },
  { value: 'fr', label: 'Français' }, { value: 'de', label: 'Deutsch' }, { value: 'pt', label: 'Português' },
  { value: 'it', label: 'Italiano' }, { value: 'ja', label: '日本語' }, { value: 'ko', label: '한국어' }, { value: 'zh', label: '中文' },
];
const THEMES: { value: Theme; key: string; icon: string }[] = [
  { value: 'light', key: 'settings.light', icon: 'light_mode' },
  { value: 'dark', key: 'settings.dark', icon: 'dark_mode' },
  { value: 'system', key: 'settings.system', icon: 'contrast' },
];
const UI_LANGS: { value: UiLocale; label: string }[] = [
  { value: 'en', label: 'English' }, { value: 'es', label: 'Español' },
];

// ── Shared small building blocks ─────────────────────────────────────
function Row({ label, description, children }: { label: string; description?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-edge/40 last:border-0">
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <span className="text-sm font-medium text-text">{label}</span>
        {description && <span className="text-xs text-muted">{description}</span>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className={`relative w-11 h-6 rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-edge'}`}>
      <span className={`absolute top-[2px] left-[2px] h-5 w-5 bg-white rounded-full transition-transform ${checked ? 'translate-x-5' : ''}`} />
    </button>
  );
}
function SectionHeader({ title, desc }: { title: string; desc?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-lg font-semibold text-text">{title}</h2>
      {desc && <p className="text-xs text-muted mt-0.5">{desc}</p>}
    </div>
  );
}

// ── Pane components ──────────────────────────────────────────────────
function PaneGeneral() {
  const t = useT();
  const settings = useSettingsStore();
  return (
    <>
      <SectionHeader title={t('settings.section.general')} />
      <Row label={t('settings.theme')}>
        <div className="flex gap-1.5">
          {THEMES.map((th) => (
            <button key={th.value} onClick={() => settings.setTheme(th.value)} data-testid={`theme-${th.value}`}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs ${settings.theme === th.value ? 'border-primary/50 bg-primary/10 text-primary' : 'border-edge text-muted hover:text-text'}`}>
              <span className="material-symbols-outlined text-[14px]">{th.icon}</span>{t(th.key)}
            </button>
          ))}
        </div>
      </Row>
      <Row label={t('settings.uiLanguage')}>
        <div className="flex gap-1.5">
          {UI_LANGS.map((l) => (
            <button key={l.value} onClick={() => settings.setUiLanguage(l.value)} data-testid={`lang-${l.value}`}
              className={`rounded-lg border px-3 py-1.5 text-xs ${settings.uiLanguage === l.value ? 'border-primary/50 bg-primary/10 text-primary' : 'border-edge text-muted hover:text-text'}`}>
              {l.label}
            </button>
          ))}
        </div>
      </Row>
    </>
  );
}

function PaneAccount({ onOpenPricing }: { onOpenPricing: () => void }) {
  const t = useT();
  const { user, signOut } = useAuthStore();
  if (!user) {
    return (
      <>
        <SectionHeader title={t('settings.section.account')} />
        <p className="text-sm text-muted">{t('auth.signInDesc')}</p>
      </>
    );
  }
  return (
    <>
      <SectionHeader title={t('settings.section.account')} />
      <Row label={user.email ?? ''}><button onClick={signOut} className="text-xs text-muted hover:text-red-400">{t('auth.signOut')}</button></Row>
      <div className="mt-5">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted/70 mb-2">{t('settings.usage')}</h3>
        <UsageMeter />
        <button type="button" onClick={onOpenPricing} data-testid="settings-view-plans"
          className="mt-3 flex items-center gap-1.5 text-xs text-primary hover:text-primary/80">
          <span className="material-symbols-outlined text-[16px]">arrow_forward</span>{t('settings.viewPlans')}
        </button>
      </div>
    </>
  );
}

function ProviderCard({ title, state, email, latency, mode, error, children }: {
  title: string; state: string; email?: string | null; latency?: number | null; mode?: string; error?: string | null;
  children: React.ReactNode;
}) {
  const t = useT();
  return (
    <div className="rounded-xl border border-edge bg-base/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-text">{title}</p>
        <span className={`text-[10px] uppercase tracking-wide ${state === 'connected' ? 'text-emerald-400' : state === 'error' ? 'text-red-400' : 'text-muted'}`}>{state}</span>
      </div>
      {email ? <p className="mt-1 text-xs text-muted">{email}</p> : null}
      {mode && <p className="mt-1 text-xs text-muted">{t('settings.mode')}: {mode}</p>}
      {latency !== null && latency !== undefined && <p className="mt-1 text-xs text-muted">{t('settings.latency')}: {latency} ms</p>}
      {error && <p className="mt-1 text-xs text-red-400 whitespace-pre-wrap">{error}</p>}
      <div className="mt-2 flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function PaneProviders() {
  const t = useT();
  const settings = useSettingsStore();
  const [claudeCodeInput, setClaudeCodeInput] = useState('');
  const p = useProviderAuthStore();
  useEffect(() => { void p.loadCodexStatus(); void p.loadClaudeStatus(); }, []);
  return (
    <>
      <SectionHeader title={t('settings.section.providers')} />
      <div className="flex flex-col gap-3">
        <ProviderCard title="OpenAI (ChatGPT/Codex)" state={p.codexState} email={p.codexEmail} latency={p.codexLatency} error={p.codexError}>
          <Button variant="primary" size="sm" onClick={() => { void p.connectCodex(); }} data-testid="settings-openai-connect">{t('settings.connectOpenai')}</Button>
          {p.codexState === 'connecting' && (
            <Button variant="outline" size="sm" onClick={p.cancelCodex} data-testid="settings-openai-cancel">{t('widget.cancel')}</Button>
          )}
          <Button variant="outline" size="sm" onClick={() => { void p.testCodex(); }} data-testid="settings-openai-test">{t('settings.testConnection')}</Button>
          <Button variant="outline" size="sm" onClick={() => { void p.disconnectCodex(); }} data-testid="settings-openai-disconnect">{t('settings.disconnect')}</Button>
          <input type="password" value={settings.codexApiKey} onChange={(e) => settings.setCodexApiKey(e.target.value)} placeholder={t('settings.openaiApiKeyOptional')}
            className="w-full bg-surface border border-edge rounded-lg px-3 py-2 text-xs text-text placeholder:text-muted/70 outline-none" data-testid="settings-openai-api-key" />
        </ProviderCard>
        <ProviderCard title="Claude (Auth / API key)" state={p.claudeState} email={p.claudeEmail} mode={p.claudeAuthMode} latency={p.claudeLatency} error={p.claudeError}>
          <Button variant="primary" size="sm" onClick={() => { void p.startClaudeAuth(); }} data-testid="settings-claude-connect">{t('settings.connectClaude')}</Button>
          <Button variant="outline" size="sm" onClick={() => { void p.testClaudeOAuth(); }} data-testid="settings-claude-test-auth">{t('settings.testConnection')}</Button>
          <Button variant="outline" size="sm" onClick={() => { void p.disconnectClaude(); }} data-testid="settings-claude-disconnect">{t('settings.disconnect')}</Button>
          <div className="w-full flex gap-2">
            <input type="text" value={claudeCodeInput} onChange={(e) => setClaudeCodeInput(e.target.value)} placeholder={t('settings.claudeCodePlaceholder')}
              className="flex-1 bg-surface border border-edge rounded-lg px-3 py-2 text-xs text-text placeholder:text-muted/70 outline-none" data-testid="settings-claude-code" />
            <Button variant="outline" size="sm" onClick={() => { void p.exchangeClaudeCode(claudeCodeInput.trim()); }} disabled={!claudeCodeInput.trim()} data-testid="settings-claude-exchange">{t('settings.finishAuth')}</Button>
          </div>
          <div className="w-full flex gap-2">
            <input type="password" value={settings.claudeApiKey} onChange={(e) => settings.setClaudeApiKey(e.target.value)} placeholder={t('settings.claudeApiKeyOptional')}
              className="flex-1 bg-surface border border-edge rounded-lg px-3 py-2 text-xs text-text placeholder:text-muted/70 outline-none" data-testid="settings-claude-api-key" />
            <Button variant="outline" size="sm" onClick={() => { void p.testClaudeApiKey(settings.claudeApiKey); }} disabled={!settings.claudeApiKey.trim()} data-testid="settings-claude-test-key">{t('settings.testKey')}</Button>
          </div>
        </ProviderCard>
      </div>
    </>
  );
}

function PaneHotkeys() {
  const t = useT();
  const settings = useSettingsStore();
  const [editing, setEditing] = useState<string | null>(null);
  const capture = (action: string, e: React.KeyboardEvent) => {
    e.preventDefault();
    const parts: string[] = [];
    if (e.ctrlKey) parts.push('Ctrl');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    const k = e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key;
    if (!['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) parts.push(k);
    if (parts.length >= 2) { settings.setHotkey(action, parts.join('+')); setEditing(null); }
  };
  return (
    <>
      <SectionHeader title={t('settings.section.hotkeys')} />
      {HOTKEY_ACTIONS.map(({ action, key, icon }) => (
        <Row key={action} label={t(key)}>
          {editing === action ? (
            <input autoFocus readOnly placeholder={t('settings.pressKeys')} onKeyDown={(e) => capture(action, e)} onBlur={() => setEditing(null)}
              className="w-36 bg-primary/20 border border-primary/40 text-primary text-xs text-center font-mono rounded-md px-2 py-1.5 outline-none animate-pulse" />
          ) : (
            <button onClick={() => setEditing(action)} className="bg-base border border-edge text-xs text-text font-mono rounded-md px-3 py-1.5 hover:border-primary/40 hover:text-primary transition-colors">
              <span className="material-symbols-outlined text-[14px] align-middle mr-1 text-muted">{icon}</span>{settings.hotkeys[action] || '—'}
            </button>
          )}
        </Row>
      ))}
    </>
  );
}

function PaneAudio() {
  const t = useT();
  const settings = useSettingsStore();
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  useEffect(() => { navigator.mediaDevices.enumerateDevices().then((d) => setDevices(d.filter((x) => x.kind === 'audioinput'))).catch(() => {}); }, []);
  return (
    <>
      <SectionHeader title={t('settings.section.audio')} />
      <Row label={t('settings.audioInput')}>
        <select value={settings.audioDevice ?? 'default'} onChange={(e) => settings.setAudioDevice(e.target.value === 'default' ? null : e.target.value)}
          className="bg-base border border-edge text-text text-sm rounded-lg px-3 py-1.5 outline-none appearance-none min-w-[220px]">
          <option value="default">{t('settings.systemDefault')}</option>
          {devices.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${d.deviceId.slice(0, 8)}`}</option>)}
        </select>
      </Row>
      <Row label={t('settings.systemIncludeMic')} description={t('settings.systemIncludeMicDesc')}>
        <ToggleSwitch checked={settings.systemIncludeMic} onChange={settings.setSystemIncludeMic} />
      </Row>
      <Row label={t('settings.hotkeyMode')} description={settings.hotkeyMode === 'toggle' ? t('settings.pressToStartStop') : t('settings.holdToRecord')}>
        <select value={settings.hotkeyMode} onChange={(e) => settings.setHotkeyMode(e.target.value as 'toggle' | 'hold')}
          className="bg-base border border-edge text-text text-sm rounded-lg px-3 py-1.5 outline-none appearance-none">
          <option value="toggle">{t('settings.toggle')}</option>
          <option value="hold">{t('settings.hold')}</option>
        </select>
      </Row>
      <Row label={t('settings.dictationCueSounds')} description={t('settings.dictationCueSoundsDesc')}>
        <ToggleSwitch checked={settings.dictationCueSounds} onChange={settings.setDictationCueSounds} />
      </Row>
    </>
  );
}

function PaneTranscription() {
  const t = useT();
  const settings = useSettingsStore();
  return (
    <>
      <SectionHeader title={t('settings.section.transcription')} />
      <Row label={t('settings.autoTranslate')}>
        <ToggleSwitch checked={settings.translateEnabled} onChange={settings.setTranslateEnabled} />
      </Row>
      {settings.translateEnabled && (
        <Row label={t('settings.targetLang')} description={t('settings.targetLangDesc')}>
          <select value={settings.translateTo} onChange={(e) => settings.setTranslateTo(e.target.value)}
            className="bg-base border border-edge text-text text-sm rounded-lg px-3 py-1.5 outline-none appearance-none">
            {TARGET_LANGS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        </Row>
      )}
    </>
  );
}

function PaneTts() {
  const t = useT();
  const settings = useSettingsStore();
  const { voices, loading } = useTtsVoices();
  return (
    <>
      <SectionHeader title={t('settings.section.tts')} />
      <Row label={t('settings.ttsVoice')} description={t('settings.ttsVoiceDesc')}>
        <select value={settings.ttsVoice} onChange={(e) => settings.setTtsVoice(e.target.value)} disabled={loading}
          className="bg-base border border-edge text-text text-sm rounded-lg px-3 py-1.5 outline-none appearance-none min-w-[220px]" data-testid="settings-tts-voice">
          <option value="auto">{t('settings.auto')}</option>
          {voices.map((v) => <option key={`${v.provider}:${v.name}`} value={v.name}>{getTtsVoiceLabel(v)}</option>)}
        </select>
      </Row>
      <Row label={t('settings.ttsLanguage')} description={t('settings.ttsLanguageDesc')}>
        <select value={settings.ttsLanguage} onChange={(e) => settings.setTtsLanguage(e.target.value)}
          className="bg-base border border-edge text-text text-sm rounded-lg px-3 py-1.5 outline-none appearance-none" data-testid="settings-tts-language">
          {TTS_LANGS.map((l) => <option key={l.value} value={l.value}>{l.value === 'auto' ? t('settings.auto') : l.label}</option>)}
        </select>
      </Row>
    </>
  );
}

function PaneOverlay() {
  const t = useT();
  const settings = useSettingsStore();
  return (
    <>
      <SectionHeader title={t('settings.section.overlay')} />
      <Row label={t('settings.overlayWidget')}>
        <ToggleSwitch checked={settings.overlayEnabled} onChange={settings.setOverlayEnabled} />
      </Row>
      {settings.overlayEnabled && (
        <>
          <Row label={t('settings.showWidget')}>
            <Button variant="outline" size="sm" leftIcon="widgets" onClick={() => electron?.showOverlay()} data-testid="show-widget-btn">{t('settings.showWidget')}</Button>
          </Row>
          <Row label={t('settings.overlayResetPosition')}>
            <Button variant="outline" size="sm" leftIcon="center_focus_strong" onClick={settings.resetOverlayPosition} data-testid="overlay-reset-btn">{t('settings.overlayResetPosition')}</Button>
          </Row>
        </>
      )}
      <Row label={t('settings.minimizeTray')}>
        <ToggleSwitch checked={settings.minimizeToTray} onChange={settings.setMinimizeToTray} />
      </Row>
      <Row label={t('settings.notifications')}>
        <ToggleSwitch checked={settings.showNotifications} onChange={settings.setShowNotifications} />
      </Row>
    </>
  );
}

function PaneAdvanced() {
  const t = useT();
  const clear = useNotificationsStore((s) => s.clear);
  return (
    <>
      <SectionHeader title={t('settings.section.advanced')} />
      <Row label={t('settings.advanced.debug')} description={t('settings.advanced.debugDesc')}>
        <span className="text-[10px] text-muted/60 font-mono">coming soon</span>
      </Row>
      <Row label={t('settings.advanced.clearLogs')}>
        <Button variant="outline" size="sm" leftIcon="delete_sweep" onClick={clear} className="hover:!text-red-400 hover:!border-red-500/40">{t('settings.advanced.clearLogs')}</Button>
      </Row>
    </>
  );
}

// ── Main modal with rail ─────────────────────────────────────────────
export function SettingsModal({ onClose, onOpenPricing }: Props) {
  const t = useT();
  const [section, setSection] = useState<SectionId>('general');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  let pane: React.ReactNode = null;
  switch (section) {
    case 'general': pane = <PaneGeneral />; break;
    case 'account': pane = <PaneAccount onOpenPricing={onOpenPricing} />; break;
    case 'providers': pane = <PaneProviders />; break;
    case 'hotkeys': pane = <PaneHotkeys />; break;
    case 'audio': pane = <PaneAudio />; break;
    case 'transcription': pane = <PaneTranscription />; break;
    case 'tts': pane = <PaneTts />; break;
    case 'overlay': pane = <PaneOverlay />; break;
    case 'advanced': pane = <PaneAdvanced />; break;
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} data-testid="settings-modal">
      <div className="w-full max-w-4xl h-[80vh] max-h-[720px] flex rounded-2xl border border-edge bg-surface shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <aside className="w-48 shrink-0 border-r border-edge bg-surface-alt/60 flex flex-col">
          <div className="px-4 py-3 border-b border-edge/60">
            <h2 className="text-sm font-bold text-text">{t('settings.title')}</h2>
          </div>
          <nav className="flex-1 overflow-y-auto py-2">
            {SECTIONS.map((s) => (
              <button key={s.id} type="button" onClick={() => setSection(s.id)} data-testid={`settings-rail-${s.id}`}
                className={`w-full flex items-center gap-2.5 px-4 py-2 text-left text-xs transition-colors ${section === s.id ? 'bg-primary/10 text-primary font-semibold' : 'text-muted hover:text-text hover:bg-white/5'}`}>
                <span className={`material-symbols-outlined text-[16px] ${section === s.id ? 'fill-1' : ''}`}>{s.icon}</span>
                <span className="truncate">{t(s.labelKey)}</span>
              </button>
            ))}
          </nav>
        </aside>
        <div className="flex-1 flex flex-col min-w-0">
          <header className="flex items-center justify-end px-5 py-3 border-b border-edge/60 shrink-0">
            <Button variant="ghost" size="icon" leftIcon="close" onClick={onClose} data-testid="settings-close" className="hover:!text-red-400" />
          </header>
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {pane}
          </div>
        </div>
      </div>
    </div>
  );
}
