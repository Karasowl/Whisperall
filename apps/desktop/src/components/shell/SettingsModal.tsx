import { useState, useEffect } from 'react';
import { useSettingsStore, type Theme, type UiLocale } from '../../stores/settings';
import { useAuthStore } from '../../stores/auth';
import { electron } from '../../lib/electron';
import { useT } from '../../lib/i18n';
import { UsageMeter } from '../UsageMeter';
import { getTtsVoiceLabel, useTtsVoices } from '../../lib/tts-voices';

type Props = { onClose: () => void; onOpenPricing: () => void };

const HOTKEY_ACTIONS: { action: string; key: string; icon: string }[] = [
  { action: 'dictate', key: 'hotkey.dictate', icon: 'mic' },
  { action: 'read_clipboard', key: 'hotkey.readClipboard', icon: 'volume_up' },
  { action: 'stt_paste', key: 'hotkey.sttPaste', icon: 'content_paste' },
  { action: 'translate', key: 'hotkey.translate', icon: 'translate' },
  { action: 'overlay_toggle', key: 'hotkey.overlayToggle', icon: 'widgets' },
];

const TARGET_LANGS = [
  { value: 'en', label: 'English' }, { value: 'es', label: 'Espanol' },
  { value: 'fr', label: 'Francais' }, { value: 'de', label: 'Deutsch' },
  { value: 'pt', label: 'Portugues' }, { value: 'ja', label: '日本語' },
  { value: 'zh', label: '中文' },
];

const TTS_LANGS = [
  { value: 'auto', label: 'Auto' },
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Espanol' },
  { value: 'fr', label: 'Francais' },
  { value: 'de', label: 'Deutsch' },
  { value: 'pt', label: 'Portugues' },
  { value: 'it', label: 'Italiano' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
  { value: 'zh', label: '中文' },
];

const THEMES: { value: Theme; key: string; icon: string }[] = [
  { value: 'light', key: 'settings.light', icon: 'light_mode' },
  { value: 'dark', key: 'settings.dark', icon: 'dark_mode' },
  { value: 'system', key: 'settings.system', icon: 'contrast' },
];

const UI_LANGS: { value: UiLocale; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Espanol' },
];

export function SettingsModal({ onClose, onOpenPricing }: Props) {
  const t = useT();
  const settings = useSettingsStore();
  const { user, signOut } = useAuthStore();
  const { voices: ttsVoices, loading: ttsVoicesLoading } = useTtsVoices();
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [editingHotkey, setEditingHotkey] = useState<string | null>(null);

  useEffect(() => {
    navigator.mediaDevices.enumerateDevices()
      .then((devices) => setAudioDevices(devices.filter((d) => d.kind === 'audioinput')))
      .catch(() => {});
  }, []);

  const handleKeyCapture = (action: string, e: React.KeyboardEvent) => {
    e.preventDefault();
    const parts: string[] = [];
    if (e.ctrlKey) parts.push('Ctrl');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    const key = e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key;
    if (!['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) parts.push(key);
    if (parts.length >= 2) {
      settings.setHotkey(action, parts.join('+'));
      setEditingHotkey(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose} data-testid="settings-modal">
      <div className="bg-surface border border-edge rounded-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-edge">
          <h2 className="text-lg font-bold text-text">{t('settings.title')}</h2>
          <button onClick={onClose} className="text-muted hover:text-text transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="p-5 flex flex-col gap-6">
          {/* Account */}
          {user && (
            <section>
              <h3 className="text-sm font-semibold text-text-secondary mb-3">{t('settings.account')}</h3>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted">{user.email}</span>
                <button onClick={signOut} className="text-sm text-muted hover:text-text transition-colors">{t('auth.signOut')}</button>
              </div>
            </section>
          )}

          {/* Usage */}
          {user && (
            <section>
              <h3 className="text-sm font-semibold text-text-secondary mb-3">{t('settings.usage')}</h3>
              <UsageMeter />
              <button type="button" onClick={onOpenPricing} data-testid="settings-view-plans"
                className="mt-3 flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors">
                <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                {t('settings.viewPlans')}
              </button>
            </section>
          )}

          {/* Theme */}
          <section>
            <h3 className="text-sm font-semibold text-text-secondary mb-3">{t('settings.theme')}</h3>
            <div className="flex gap-2">
              {THEMES.map((th) => (
                <button key={th.value} onClick={() => settings.setTheme(th.value)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    settings.theme === th.value
                      ? 'bg-primary text-white'
                      : 'bg-base border border-edge text-muted hover:text-text hover:border-primary/40'
                  }`} data-testid={`theme-${th.value}`}>
                  <span className="material-symbols-outlined text-[18px]">{th.icon}</span>
                  {t(th.key)}
                </button>
              ))}
            </div>
          </section>

          {/* Interface Language */}
          <section>
            <h3 className="text-sm font-semibold text-text-secondary mb-3">{t('settings.uiLanguage')}</h3>
            <div className="flex gap-2">
              {UI_LANGS.map((lang) => (
                <button key={lang.value} onClick={() => settings.setUiLanguage(lang.value)}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    settings.uiLanguage === lang.value
                      ? 'bg-primary text-white'
                      : 'bg-base border border-edge text-muted hover:text-text hover:border-primary/40'
                  }`} data-testid={`lang-${lang.value}`}>
                  {lang.label}
                </button>
              ))}
            </div>
          </section>

          {/* Keyboard Shortcuts */}
          <section>
            <h3 className="text-sm font-semibold text-text-secondary mb-3">{t('settings.shortcuts')}</h3>
            <div className="flex flex-col gap-2">
              {HOTKEY_ACTIONS.map(({ action, key, icon }) => (
                <div key={action} className="flex items-center justify-between py-2 px-3 rounded-lg bg-base/50">
                  <div className="flex items-center gap-2.5">
                    <span className="material-symbols-outlined text-muted text-[18px]">{icon}</span>
                    <span className="text-sm text-text">{t(key)}</span>
                  </div>
                  {editingHotkey === action ? (
                    <input autoFocus readOnly placeholder={t('settings.pressKeys')}
                      onKeyDown={(e) => handleKeyCapture(action, e)}
                      onBlur={() => setEditingHotkey(null)}
                      className="w-32 bg-primary/20 border border-primary/40 text-primary text-xs text-center font-mono rounded-md px-2 py-1.5 outline-none animate-pulse" />
                  ) : (
                    <button onClick={() => setEditingHotkey(action)}
                      className="bg-base border border-edge text-xs text-text-secondary font-mono rounded-md px-3 py-1.5 hover:border-primary/40 hover:text-primary transition-colors">
                      {settings.hotkeys[action] || '—'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Audio Input */}
          <section>
            <h3 className="text-sm font-semibold text-text-secondary mb-3">{t('settings.audioInput')}</h3>
            <select value={settings.audioDevice ?? 'default'} onChange={(e) => settings.setAudioDevice(e.target.value === 'default' ? null : e.target.value)}
              className="w-full bg-base border border-edge text-text text-sm rounded-lg p-2.5 outline-none appearance-none">
              <option value="default">{t('settings.systemDefault')}</option>
              {audioDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${d.deviceId.slice(0, 8)}`}</option>
              ))}
            </select>
            <div className="mt-4 flex flex-col gap-1">
              <ToggleSwitch label={t('settings.systemIncludeMic')} checked={settings.systemIncludeMic} onChange={settings.setSystemIncludeMic} />
              <p className="text-xs text-muted">{t('settings.systemIncludeMicDesc')}</p>
            </div>
          </section>

          {/* Translation */}
          <section>
            <h3 className="text-sm font-semibold text-text-secondary mb-3">{t('settings.translation')}</h3>
            <div className="flex flex-col gap-4">
              <ToggleSwitch label={t('settings.autoTranslate')} checked={settings.translateEnabled} onChange={settings.setTranslateEnabled} />
              {settings.translateEnabled && (
                <Toggle label={t('settings.targetLang')} description={t('settings.targetLangDesc')}>
                  <select value={settings.translateTo} onChange={(e) => settings.setTranslateTo(e.target.value)}
                    className="bg-base border border-edge text-text text-sm rounded-lg px-3 py-1.5 outline-none appearance-none">
                    {TARGET_LANGS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                  </select>
                </Toggle>
              )}
            </div>
          </section>

          {/* Text-to-speech */}
          <section>
            <h3 className="text-sm font-semibold text-text-secondary mb-3">{t('settings.tts')}</h3>
            <div className="flex flex-col gap-4">
              <Toggle label={t('settings.ttsVoice')} description={t('settings.ttsVoiceDesc')}>
                <select
                  value={settings.ttsVoice}
                  onChange={(e) => settings.setTtsVoice(e.target.value)}
                  className="bg-base border border-edge text-text text-sm rounded-lg px-3 py-1.5 outline-none appearance-none"
                  data-testid="settings-tts-voice"
                  disabled={ttsVoicesLoading}
                >
                  <option value="auto">{t('settings.auto')}</option>
                  {ttsVoices.map((v) => (
                    <option key={`${v.provider}:${v.name}`} value={v.name}>{getTtsVoiceLabel(v)}</option>
                  ))}
                </select>
              </Toggle>
              <Toggle label={t('settings.ttsLanguage')} description={t('settings.ttsLanguageDesc')}>
                <select
                  value={settings.ttsLanguage}
                  onChange={(e) => settings.setTtsLanguage(e.target.value)}
                  className="bg-base border border-edge text-text text-sm rounded-lg px-3 py-1.5 outline-none appearance-none"
                  data-testid="settings-tts-language"
                >
                  {TTS_LANGS.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.value === 'auto' ? t('settings.auto') : l.label}
                    </option>
                  ))}
                </select>
              </Toggle>
            </div>
          </section>

          {/* Dictation & Widget */}
          <section>
            <h3 className="text-sm font-semibold text-text-secondary mb-3">{t('settings.dictation')}</h3>
            <div className="flex flex-col gap-4">
              <Toggle label={t('settings.hotkeyMode')} description={settings.hotkeyMode === 'toggle' ? t('settings.pressToStartStop') : t('settings.holdToRecord')}>
                <select value={settings.hotkeyMode} onChange={(e) => settings.setHotkeyMode(e.target.value as 'toggle' | 'hold')}
                  className="bg-base border border-edge text-text text-sm rounded-lg px-3 py-1.5 outline-none appearance-none">
                  <option value="toggle">{t('settings.toggle')}</option>
                  <option value="hold">{t('settings.hold')}</option>
                </select>
              </Toggle>
              <ToggleSwitch label={t('settings.overlayWidget')} checked={settings.overlayEnabled} onChange={settings.setOverlayEnabled} />
              {settings.overlayEnabled && (
                <>
                  <button onClick={() => electron?.showOverlay()} data-testid="show-widget-btn"
                    className="flex items-center justify-center gap-2 py-2.5 bg-base border border-edge rounded-lg text-sm text-text-secondary hover:border-primary/40 hover:text-primary transition-colors">
                    <span className="material-symbols-outlined text-[18px]">widgets</span> {t('settings.showWidget')}
                  </button>
                  <button
                    type="button"
                    onClick={settings.resetOverlayPosition}
                    data-testid="overlay-reset-btn"
                    className="flex items-center justify-center gap-2 py-2.5 bg-base border border-edge rounded-lg text-sm text-text-secondary hover:border-primary/40 hover:text-primary transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">center_focus_strong</span>
                    {t('settings.overlayResetPosition')}
                  </button>
                </>
              )}
              <ToggleSwitch label={t('settings.minimizeTray')} checked={settings.minimizeToTray} onChange={settings.setMinimizeToTray} />
              <ToggleSwitch label={t('settings.notifications')} checked={settings.showNotifications} onChange={settings.setShowNotifications} />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Toggle({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-text">{label}</span>
        {description && <span className="text-xs text-muted">{description}</span>}
      </div>
      {children}
    </div>
  );
}

function ToggleSwitch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between cursor-pointer group" onClick={() => onChange(!checked)}>
      <span className="text-sm font-medium text-text group-hover:text-primary transition-colors">{label}</span>
      <div className={`relative w-11 h-6 rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-base'}`}>
        <div className={`absolute top-[2px] left-[2px] h-5 w-5 bg-white rounded-full transition-transform ${checked ? 'translate-x-5' : ''}`} />
      </div>
    </div>
  );
}
