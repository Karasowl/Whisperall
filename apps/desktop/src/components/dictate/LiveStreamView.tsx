import { useEffect, useRef } from 'react';
import type { LiveSegment } from '@whisperall/api-client';
import type { LiveStatus } from '../../stores/live';
import { useT } from '../../lib/i18n';

type Props = {
  status: LiveStatus;
  segments: LiveSegment[];
  interimText: string;
  error: string | null;
};

function formatError(err: string, t: (k: string) => string): string {
  if (err.includes('Failed to fetch') || err.includes('NetworkError') || err.includes('WebSocket')) return t('live.errorConnection');
  if (err.includes('401')) return t('live.errorAuth');
  if (err.includes('502')) return t('live.errorService');
  return err;
}

export function LiveStreamView({ status, segments, interimText, error }: Props) {
  const t = useT();
  const bottomRef = useRef<HTMLDivElement>(null);
  const isRecording = status === 'recording';
  const hasContent = segments.length > 0 || interimText;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [segments.length, interimText]);

  return (
    <div className="flex-1 overflow-y-auto px-8 pb-32 pt-8 flex justify-center" data-testid="live-stream-view">
      <div className="w-full max-w-3xl flex flex-col gap-4">
        <h1 className="text-4xl font-black text-text leading-tight mb-4">{t('live.title')}</h1>

        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-3 px-5 py-4 rounded-xl bg-red-900/30 border border-red-500/50 shadow-lg" data-testid="live-error-banner">
            <span className="material-symbols-outlined text-[24px] text-red-400">error</span>
            <p className="text-sm text-red-300">{formatError(error, t)}</p>
          </div>
        )}

        {/* Listening state — recording but nothing yet */}
        {isRecording && !hasContent && !error && (
          <div className="flex flex-col items-center justify-center py-24 gap-5" data-testid="live-listening">
            <div className="relative flex items-center justify-center h-20 w-20">
              <span className="material-symbols-outlined text-[56px] text-primary">hearing</span>
              <span className="absolute inset-0 rounded-full border-2 border-primary/30 animate-ping" />
            </div>
            <p className="text-lg font-semibold text-text">{t('live.listening')}</p>
            <p className="text-sm text-muted text-center max-w-md">{t('live.listeningDesc')}</p>
          </div>
        )}

        {/* Idle state */}
        {!isRecording && !hasContent && !error && (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-muted">
            <span className="material-symbols-outlined text-[48px]">mic_off</span>
            <p className="text-base">{t('live.idle')}</p>
          </div>
        )}

        {/* Committed segments */}
        {segments.map((seg) => (
          <div key={seg.id} className="px-4 py-3 rounded-lg bg-surface-alt/40 border border-edge">
            {seg.speaker && (
              <span className="text-xs font-bold text-primary uppercase tracking-wide mr-2">[{seg.speaker}]</span>
            )}
            <span className="text-base text-text-secondary leading-relaxed">{seg.text}</span>
            {seg.translated_text && (
              <p className="mt-1 text-sm text-muted italic">{seg.translated_text}</p>
            )}
          </div>
        ))}

        {/* Interim text — currently being spoken */}
        {interimText && (
          <div className="px-4 py-3 rounded-lg border border-primary/30 bg-blue-900/10" data-testid="live-interim">
            <span className="text-base text-text-secondary/70 leading-relaxed">{interimText}</span>
            <span className="inline-block w-0.5 h-5 bg-primary ml-1 animate-pulse align-middle" />
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
