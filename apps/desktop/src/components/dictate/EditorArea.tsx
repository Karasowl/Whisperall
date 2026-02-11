import { useT } from '../../lib/i18n';
import { useSettingsStore } from '../../stores/settings';

type Props = {
  title: string;
  text: string;
  translatedText?: string;
  isRecording: boolean;
  onTextChange?: (text: string) => void;
};

export function EditorArea({ title, text, translatedText, isRecording, onTextChange }: Props) {
  const t = useT();
  const locale = useSettingsStore((s) => s.uiLanguage);
  const now = new Date();
  const date = now.toLocaleDateString(locale === 'es' ? 'es-ES' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const time = now.toLocaleTimeString(locale === 'es' ? 'es-ES' : 'en-US', { hour: 'numeric', minute: '2-digit' });

  return (
    <div className="flex-1 overflow-y-auto px-8 pb-32 pt-8 flex justify-center">
      <div className="w-full max-w-3xl flex flex-col gap-6">
        <h1 className="text-4xl font-black text-text leading-tight" data-testid="dictate-title">
          {title || t('dictate.untitled')}
        </h1>

        <div className="flex items-center gap-4 text-sm text-muted pb-4 border-b border-edge">
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[18px]">calendar_today</span>
            <span>{date}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[18px]">schedule</span>
            <span>{time}</span>
          </div>
        </div>

        <textarea
          value={text}
          onChange={(e) => onTextChange?.(e.target.value)}
          readOnly={isRecording}
          placeholder={t('dictate.placeholder')}
          data-testid="dictate-text"
          className="relative min-h-[400px] w-full resize-none bg-transparent text-lg leading-relaxed text-text-secondary font-normal placeholder:text-muted placeholder:italic focus:outline-none"
        />

        {translatedText && (
          <div className="pt-4 border-t border-edge text-base leading-relaxed text-muted italic whitespace-pre-wrap" data-testid="translated-text">
            {translatedText}
          </div>
        )}
      </div>
    </div>
  );
}
