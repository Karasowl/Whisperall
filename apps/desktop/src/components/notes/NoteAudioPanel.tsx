import type { TranscriptSegment } from '@whisperall/api-client';
import { useT } from '../../lib/i18n';
import { AudioPlayer, type AudioSeekRequest } from '../editor/AudioPlayer';
import { TranscriptView } from '../editor/TranscriptView';

type Props = {
  audioUrl: string | null;
  title: string;
  metaText?: string;
  activeSegmentText?: string;
  seekRequest?: AudioSeekRequest | null;
  onTimeUpdate?: (seconds: number) => void;
  segments: TranscriptSegment[];
  activeIndex?: number | null;
  speakerAliases?: Record<string, string>;
  onSelectSegment?: (index: number) => void;
  onRenameSpeaker?: (speaker: string) => void;
};

export function NoteAudioPanel({
  audioUrl,
  title,
  metaText,
  activeSegmentText,
  seekRequest,
  onTimeUpdate,
  segments,
  activeIndex,
  speakerAliases,
  onSelectSegment,
  onRenameSpeaker,
}: Props) {
  const t = useT();

  if (!audioUrl) {
    return (
      <section className="rounded-2xl border border-edge bg-surface/50 p-4" data-testid="note-audio-panel-empty">
        <p className="text-sm font-semibold text-text">{t('notes.linkedAudio')}</p>
        <p className="mt-1 text-xs text-muted">{t('notes.audioMissing')}</p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-edge bg-surface/50 p-4" data-testid="note-audio-panel">
      <div className="mb-4">
        <p className="text-sm font-semibold text-text">{t('notes.linkedAudio')}</p>
        {metaText && <p className="mt-1 text-xs text-muted">{metaText}</p>}
      </div>

      <AudioPlayer
        audioUrl={audioUrl}
        title={title}
        activeSegmentText={activeSegmentText}
        seekRequest={seekRequest}
        onTimeUpdate={onTimeUpdate}
      />

      {segments.length > 0 ? (
        <div className="mt-4 rounded-xl border border-edge bg-base/30 p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">{t('notes.audioSegments')}</p>
            <span className="text-xs text-muted">{segments.length}</span>
          </div>
          <div className="max-h-[320px] overflow-y-auto pr-1">
            <TranscriptView
              segments={segments}
              activeIndex={activeIndex}
              speakerAliases={speakerAliases}
              onSelectSegment={onSelectSegment}
              onRenameSpeaker={onRenameSpeaker}
            />
          </div>
        </div>
      ) : (
        <p className="mt-4 text-xs text-muted">{t('notes.audioNoTranscript')}</p>
      )}
    </section>
  );
}
