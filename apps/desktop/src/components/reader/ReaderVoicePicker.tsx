import { useMemo } from 'react';
import { useT } from '../../lib/i18n';
import { getTtsVoiceLabel, useTtsVoices } from '../../lib/tts-voices';

type Props = {
  rate: number;
  ttsLanguage: string;
  onTtsLanguageChange: (lang: string) => void;
  ttsVoice: string;
  onTtsVoiceChange: (voice: string) => void;
  onCycleSpeed: () => void;
};

const TTS_LANGS = [
  { value: 'auto', label: 'Auto' },
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Espanol' },
  { value: 'fr', label: 'Francais' },
  { value: 'de', label: 'Deutsch' },
  { value: 'pt', label: 'Portugues' },
  { value: 'it', label: 'Italiano' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'zh', label: 'Chinese' },
] as const;

export function ReaderVoicePicker(props: Props) {
  const t = useT();
  const { voices } = useTtsVoices();
  const { edgeVoices, googleVoices } = useMemo(() => {
    const base = (props.ttsLanguage || '').toLowerCase();
    const filtered = base && base !== 'auto'
      ? voices.filter((v) => {
        const loc = (v.locale || '').toLowerCase();
        if (base === 'zh') return loc.startsWith('zh') || loc.startsWith('cmn');
        return loc.startsWith(`${base}-`) || loc === base;
      })
      : voices;
    const byLabel = (a: { label?: string | null; name: string }, b: { label?: string | null; name: string }) =>
      (a.label || a.name).localeCompare(b.label || b.name);
    return {
      edgeVoices: filtered.filter((v) => v.provider === 'edge').slice().sort(byLabel),
      googleVoices: filtered.filter((v) => v.provider === 'google').slice().sort(byLabel),
    };
  }, [props.ttsLanguage, voices]);

  const selectCls = 'styled-select bg-surface-alt border border-edge text-text text-xs rounded-lg px-2.5 py-1.5 outline-none cursor-pointer hover:border-primary/40 transition-colors';

  return (
    <div className="flex items-center gap-3" data-testid="reader-voice-picker">
      <div className="flex items-center gap-1.5">
        <span className="material-symbols-outlined text-[16px] text-muted">record_voice_over</span>
        <select value={props.ttsVoice} onChange={(e) => props.onTtsVoiceChange(e.target.value)}
          className={`${selectCls} max-w-[180px]`} data-testid="reader-voice-select">
          <option value="auto">{t('settings.auto')}</option>
          {edgeVoices.length > 0 && (
            <optgroup label="Edge">
              {edgeVoices.map((v) => <option key={`${v.provider}:${v.name}`} value={v.name}>{getTtsVoiceLabel(v)}</option>)}
            </optgroup>
          )}
          {googleVoices.length > 0 && (
            <optgroup label="Google">
              {googleVoices.map((v) => <option key={`${v.provider}:${v.name}`} value={v.name}>{getTtsVoiceLabel(v)}</option>)}
            </optgroup>
          )}
        </select>
      </div>

      <div className="flex items-center gap-1.5">
        <span className="material-symbols-outlined text-[16px] text-muted">language</span>
        <select value={props.ttsLanguage} onChange={(e) => props.onTtsLanguageChange(e.target.value)}
          className={selectCls} data-testid="reader-language-select">
          {TTS_LANGS.map((l) => <option key={l.value} value={l.value}>{l.value === 'auto' ? t('settings.auto') : l.label}</option>)}
        </select>
      </div>

      <button type="button" onClick={props.onCycleSpeed} data-testid="reader-speed-btn" title={t('reader.speed')}
        className="px-2.5 py-1.5 rounded-lg bg-surface-alt border border-edge text-xs font-bold text-text-secondary hover:border-primary/40 hover:text-primary transition-colors tabular-nums">
        {props.rate}x
      </button>
    </div>
  );
}
