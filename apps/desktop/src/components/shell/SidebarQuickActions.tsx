import { useT } from '../../lib/i18n';

type Props = {
  onNewNote: () => void;
  onVoiceNote: () => void;
};

export function SidebarQuickActions({ onNewNote, onVoiceNote }: Props) {
  const t = useT();

  return (
    <div className="no-drag space-y-2">
      <button
        onClick={onNewNote}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors"
        data-testid="new-note-btn"
      >
        <span className="material-symbols-outlined text-[18px]">add</span>{t('notes.new')}
      </button>
      <button
        onClick={onVoiceNote}
        className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-surface border border-edge text-muted text-sm font-medium hover:text-primary hover:border-primary/30 transition-colors"
        data-testid="voice-note-btn"
        title={t('notes.voiceNote')}
      >
        <span className="material-symbols-outlined text-[18px] fill-1">mic</span>{t('notes.voiceNote')}
      </button>
    </div>
  );
}

