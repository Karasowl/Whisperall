import type { TranscriptSegment } from '@whisperall/api-client';

const SPEAKER_COLORS = ['text-sky-400', 'text-purple-400', 'text-emerald-400', 'text-orange-400'];
const SPEAKER_BG = ['bg-sky-500/10', 'bg-purple-500/10', 'bg-emerald-500/10', 'bg-orange-500/10'];
const SPEAKER_BORDER = ['border-sky-500/20', 'border-purple-500/20', 'border-emerald-500/20', 'border-orange-500/20'];

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

type TranscriptViewProps = {
  segments: TranscriptSegment[];
  activeIndex?: number | null;
  speakerAliases?: Record<string, string>;
  onSelectSegment?: (index: number) => void;
  onRenameSpeaker?: (speaker: string) => void;
};

export function TranscriptView({
  segments,
  activeIndex = null,
  speakerAliases,
  onSelectSegment,
  onRenameSpeaker,
}: TranscriptViewProps) {
  const speakerMap = new Map<string, number>();
  segments.forEach((seg) => {
    if (seg.speaker && !speakerMap.has(seg.speaker)) speakerMap.set(seg.speaker, speakerMap.size % 4);
  });

  return (
    <div className="max-w-4xl mx-auto space-y-8" data-testid="transcript-view">
      {segments.map((seg, i) => {
        const idx = seg.speaker ? (speakerMap.get(seg.speaker) ?? 0) : 0;
        const speakerLabel = seg.speaker ? (speakerAliases?.[seg.speaker] || seg.speaker) : `Speaker ${idx + 1}`;
        const isActive = activeIndex === i;
        return (
          <div
            key={i}
            className={[
              'group flex gap-5 p-4 rounded-xl -mx-4 transition-colors duration-200',
              onSelectSegment ? 'cursor-pointer' : '',
              isActive ? 'bg-primary/10 ring-1 ring-primary/40' : 'hover:bg-surface-dark/30',
            ].join(' ').trim()}
            onClick={() => onSelectSegment?.(i)}
            data-testid={`transcript-segment-${i}`}
          >
            <div className="flex flex-col items-center gap-2 pt-1">
              <div className={`size-12 rounded-full ${SPEAKER_BG[idx]} flex items-center justify-center text-sm font-bold ${SPEAKER_COLORS[idx]}`}>
                {speakerLabel.slice(0, 2).toUpperCase()}
              </div>
              {i < segments.length - 1 && <div className="flex-1 w-0.5 bg-border-dark/50 group-hover:bg-primary/20 rounded-full" />}
            </div>
            <div className="flex-1 space-y-1">
              <div className="flex items-baseline justify-between">
                <div className="flex items-center gap-3">
                  <span className={`${SPEAKER_COLORS[idx]} font-bold text-base`}>{speakerLabel}</span>
                  {seg.speaker && onRenameSpeaker && (
                    <button
                      type="button"
                      className="inline-flex items-center justify-center rounded p-1 text-muted hover:text-primary hover:bg-white/5"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRenameSpeaker(seg.speaker as string);
                      }}
                      title="Rename speaker"
                      data-testid={`rename-speaker-${i}`}
                    >
                      <span className="material-symbols-outlined text-[14px]">edit</span>
                    </button>
                  )}
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${SPEAKER_BG[idx]} ${SPEAKER_COLORS[idx]} border ${SPEAKER_BORDER[idx]} uppercase`}>
                    Speaker {idx + 1}
                  </span>
                </div>
                <span className={`text-xs font-mono transition-opacity hover:text-primary ${isActive ? 'text-primary opacity-100' : 'text-muted opacity-0 group-hover:opacity-100'}`}>
                  {formatTime(seg.start)}
                </span>
              </div>
              <p className="text-lg text-gray-300 leading-relaxed font-light">{seg.text}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
