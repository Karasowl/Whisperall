import { useCallback, useEffect, useRef, useState } from 'react';
import { useT } from '../../lib/i18n';
import { getSupabase } from '../../lib/supabase';

export type AudioSeekRequest = {
  seconds: number;
  nonce: number;
};

type Props = {
  audioUrl: string;
  title?: string;
  activeSegmentText?: string;
  seekRequest?: AudioSeekRequest | null;
  onTimeUpdate?: (seconds: number) => void;
};

type FetchAudioResult =
  | { ok: true; blob: Blob }
  | { ok: false; message: string };

const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5, 2] as const;
const EXT_TO_MIME: Record<string, string> = {
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.mp4': 'video/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.webm': 'audio/webm',
  '.flac': 'audio/flac',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
};

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function buildDownloadName(title?: string): string {
  const safe = (title || 'audio').trim().replace(/[^a-z0-9-_]+/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return `${safe || 'audio'}.mp3`;
}

function inferMimeType(url: string, blobType?: string): string | null {
  if (blobType && /^(audio|video)\//i.test(blobType)) return blobType;
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    const match = pathname.match(/\.[a-z0-9]+$/i);
    return match ? (EXT_TO_MIME[match[0]] ?? null) : null;
  } catch {
    return null;
  }
}

function normalizeBlobType(url: string, blob: Blob): Blob {
  const inferredType = inferMimeType(url, blob.type);
  if (!inferredType || inferredType === blob.type) return blob;
  return new Blob([blob], { type: inferredType });
}

function extractSupabaseAudioPath(url: string): string | null {
  try {
    const pathname = new URL(url).pathname;
    const marker = '/storage/v1/object/';
    const idx = pathname.indexOf(marker);
    if (idx < 0) return null;
    const tail = pathname.slice(idx + marker.length);
    const parts = tail.split('/').filter(Boolean);
    if (parts.length < 3) return null;
    const mode = parts[0];
    const bucket = parts[1];
    if (!['public', 'authenticated', 'sign'].includes(mode) || bucket !== 'audio') return null;
    return decodeURIComponent(parts.slice(2).join('/'));
  } catch {
    return null;
  }
}

async function fetchDownloadBlob(url: string): Promise<FetchAudioResult> {
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) return { ok: false, message: `HTTP ${response.status}` };
    const blob = await response.blob();
    if (!blob || blob.size === 0) return { ok: false, message: 'empty' };
    return { ok: true, blob: normalizeBlobType(url, blob) };
  } catch (error) {
    return { ok: false, message: (error as Error)?.message || 'fetch_failed' };
  }
}

async function fetchSupabaseAudioBlob(url: string): Promise<FetchAudioResult> {
  const objectPath = extractSupabaseAudioPath(url);
  const sb = getSupabase();
  if (!objectPath || !sb) return { ok: false, message: 'not_supabase_audio' };
  try {
    const { data, error } = await sb.storage.from('audio').download(objectPath);
    if (error || !data || data.size === 0) {
      return { ok: false, message: error?.message || 'empty' };
    }
    return { ok: true, blob: normalizeBlobType(url, data) };
  } catch (error) {
    return { ok: false, message: (error as Error)?.message || 'download_failed' };
  }
}

export function AudioPlayer({ audioUrl, title, activeSegmentText, seekRequest, onTimeUpdate }: Props) {
  const t = useT();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pendingSeekRef = useRef<AudioSeekRequest | null>(null);
  const lastAppliedSeekNonceRef = useRef<number | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const fetchSeqRef = useRef(0);
  const lastBlobRef = useRef<Blob | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [resolvedUrl, setResolvedUrl] = useState(audioUrl);
  const [sourceLoading, setSourceLoading] = useState(false);

  const revokeObjectUrl = useCallback(() => {
    if (!objectUrlRef.current) return;
    try {
      URL.revokeObjectURL(objectUrlRef.current);
    } catch {
      // ignore
    }
    objectUrlRef.current = null;
  }, []);

  const applySeekRequest = useCallback((request: AudioSeekRequest | null | undefined) => {
    const audio = audioRef.current;
    if (!audio || !request) return;
    if (lastAppliedSeekNonceRef.current === request.nonce) return;
    if (audio.readyState < 1) {
      pendingSeekRef.current = request;
      return;
    }

    lastAppliedSeekNonceRef.current = request.nonce;
    pendingSeekRef.current = null;
    const target = Math.max(0, Math.min(duration || Number.MAX_SAFE_INTEGER, request.seconds));
    setCurrentTime(target);
    audio.pause();

    let settled = false;
    const playAfterSeek = () => {
      if (settled) return;
      settled = true;
      audio.removeEventListener('seeked', playAfterSeek);
      window.clearTimeout(fallbackId);
      void audio.play().catch((err) => {
        setLoadError((err as Error)?.message || t('notes.audioLoadError'));
      });
    };

    const fallbackId = window.setTimeout(playAfterSeek, 160);
    audio.addEventListener('seeked', playAfterSeek, { once: true });
    audio.currentTime = target;
  }, [duration, t]);

  useEffect(() => {
    const seq = ++fetchSeqRef.current;
    revokeObjectUrl();
    setCurrentTime(0);
    setDuration(0);
    setLoadError(null);
    setResolvedUrl(audioUrl);
    setSourceLoading(false);
    pendingSeekRef.current = null;
    lastAppliedSeekNonceRef.current = null;
    lastBlobRef.current = null;

    if (!audioUrl) return;
    if (/^(blob:|data:|file:)/i.test(audioUrl)) return;

    setSourceLoading(true);
    void (async () => {
      const viaSupabase = await fetchSupabaseAudioBlob(audioUrl);
      const result = viaSupabase.ok ? viaSupabase : await fetchDownloadBlob(audioUrl);
      if (seq !== fetchSeqRef.current) return;
      setSourceLoading(false);
      if (!result.ok) {
        setResolvedUrl(audioUrl);
        return;
      }
      const objectUrl = URL.createObjectURL(result.blob);
      revokeObjectUrl();
      objectUrlRef.current = objectUrl;
      lastBlobRef.current = result.blob;
      setResolvedUrl(objectUrl);
    })();
  }, [audioUrl, revokeObjectUrl]);

  useEffect(() => () => revokeObjectUrl(), [revokeObjectUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    audio.playbackRate = speed;
    audio.load();
  }, [resolvedUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = speed;
  }, [speed]);

  useEffect(() => {
    applySeekRequest(seekRequest);
  }, [applySeekRequest, seekRequest]);

  const handleLoadedMetadata = () => {
    const audio = audioRef.current;
    if (!audio) return;
    setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    setLoadError(null);
    if (pendingSeekRef.current) applySeekRequest(pendingSeekRef.current);
  };

  const handleTimeUpdate = () => {
    const audio = audioRef.current;
    if (!audio) return;
    const next = audio.currentTime || 0;
    setCurrentTime(next);
    onTimeUpdate?.(next);
  };

  const changeSpeed = () => {
    const idx = SPEED_OPTIONS.indexOf(speed as (typeof SPEED_OPTIONS)[number]);
    const next = SPEED_OPTIONS[(idx + 1) % SPEED_OPTIONS.length];
    setSpeed(next);
  };

  const handleDownload = async () => {
    try {
      let blob = lastBlobRef.current;
      if (!blob) {
        const viaSupabase = await fetchSupabaseAudioBlob(audioUrl);
        const fetched = viaSupabase.ok ? viaSupabase : await fetchDownloadBlob(audioUrl);
        if (fetched.ok) {
          blob = fetched.blob;
          lastBlobRef.current = blob;
        }
      }
      if (blob) {
        const objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = buildDownloadName(title);
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
        return;
      }
    } catch {
      // fall through to direct URL download
    }
    const anchor = document.createElement('a');
    anchor.href = audioUrl;
    anchor.download = buildDownloadName(title);
    anchor.target = '_blank';
    anchor.rel = 'noreferrer';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  const statusText = loadError
    ? loadError
    : sourceLoading
      ? t('history.loading')
      : activeSegmentText || t('notes.audioPlayerHint');

  return (
    <div className="rounded-2xl border border-edge bg-base/40 p-4" data-testid="audio-player">
      <audio
        ref={audioRef}
        src={resolvedUrl}
        controls
        preload="metadata"
        className="w-full"
        data-testid="native-audio-player"
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={handleTimeUpdate}
        onError={() => setLoadError(t('notes.audioLoadError'))}
      />

      <div className="mt-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-text">{title || t('notes.audioShort')}</p>
          <p className="mt-1 text-xs font-mono text-muted">{formatTime(currentTime)} / {formatTime(duration)}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={changeSpeed}
            className="rounded-lg border border-edge bg-surface px-2.5 py-1.5 text-xs font-bold text-muted transition-colors hover:text-text"
            data-testid="speed-btn"
          >
            {speed}x
          </button>
          <button
            type="button"
            onClick={() => { void handleDownload(); }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-edge bg-surface px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-primary/40 hover:text-primary"
            data-testid="audio-download"
          >
            <span className="material-symbols-outlined text-[16px]">download</span>
            {t('reader.download')}
          </button>
        </div>
      </div>

      <p className={`mt-3 truncate text-xs ${loadError ? 'text-red-400' : 'text-muted'}`}>{statusText}</p>
    </div>
  );
}
