import { useEffect, useMemo, useRef, useState } from 'react';

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

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function AudioPlayer({ audioUrl, title, activeSegmentText, seekRequest, onTimeUpdate }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [speed, setSpeed] = useState(1);
  const speedOptions = useMemo(() => [0.75, 1, 1.25, 1.5, 2], []);

  useEffect(() => {
    const audio = new Audio(audioUrl);
    audio.preload = 'metadata';
    audio.volume = volume;
    audio.playbackRate = speed;
    audioRef.current = audio;

    const handleTime = () => {
      const next = audio.currentTime || 0;
      setCurrentTime(next);
      onTimeUpdate?.(next);
    };
    const handleLoaded = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const handleEnded = () => setPlaying(false);
    const handlePause = () => setPlaying(false);
    const handlePlay = () => setPlaying(true);

    audio.addEventListener('timeupdate', handleTime);
    audio.addEventListener('loadedmetadata', handleLoaded);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('play', handlePlay);

    return () => {
      audio.pause();
      audio.removeEventListener('timeupdate', handleTime);
      audio.removeEventListener('loadedmetadata', handleLoaded);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('play', handlePlay);
      audioRef.current = null;
    };
  }, [audioUrl, onTimeUpdate, speed, volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !seekRequest) return;
    const target = Math.max(0, seekRequest.seconds);
    audio.currentTime = target;
    setCurrentTime(target);
    void audio.play().catch(() => {});
  }, [seekRequest]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      void audio.play().catch(() => {});
      return;
    }
    audio.pause();
  };

  const jump = (deltaSeconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const next = Math.max(0, Math.min(duration || Number.MAX_SAFE_INTEGER, audio.currentTime + deltaSeconds));
    audio.currentTime = next;
    setCurrentTime(next);
  };

  const changeProgress = (value: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = value;
    setCurrentTime(value);
  };

  const changeSpeed = () => {
    const idx = speedOptions.indexOf(speed);
    const next = speedOptions[(idx + 1) % speedOptions.length];
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  const changeVolume = (next: number) => {
    const clamped = Math.max(0, Math.min(1, next));
    setVolume(clamped);
    if (audioRef.current) audioRef.current.volume = clamped;
  };

  return (
    <footer
      className="shrink-0 h-28 bg-surface-alt border-t border-edge px-8 py-3 flex items-center gap-6 shadow-[0_-4px_20px_rgba(0,0,0,0.3)]"
      data-testid="audio-player"
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => jump(-10)}
          className="text-muted hover:text-text transition-colors p-2 rounded-full hover:bg-white/5"
        >
          <span className="material-symbols-outlined text-[22px]">replay_10</span>
        </button>
        <button
          type="button"
          onClick={togglePlay}
          className="bg-primary hover:bg-blue-500 text-white rounded-full p-3 shadow-lg shadow-primary/25 transition-transform active:scale-95"
          data-testid="play-btn"
        >
          <span className="material-symbols-outlined text-[26px] fill-1">{playing ? 'pause' : 'play_arrow'}</span>
        </button>
        <button
          type="button"
          onClick={() => jump(10)}
          className="text-muted hover:text-text transition-colors p-2 rounded-full hover:bg-white/5"
        >
          <span className="material-symbols-outlined text-[22px]">forward_10</span>
        </button>
      </div>

      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-center justify-between gap-3 text-xs text-muted">
          <p className="truncate text-text font-semibold">{title || 'Audio'}</p>
          <p className="font-mono">{formatTime(currentTime)} / {formatTime(duration)}</p>
        </div>
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.05}
          value={Math.min(currentTime, duration || currentTime)}
          onChange={(e) => changeProgress(Number(e.target.value))}
          className="w-full accent-primary"
          data-testid="audio-progress"
        />
        <p className="text-xs text-muted truncate">{activeSegmentText || 'Select a segment to play from that phrase.'}</p>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={changeSpeed}
          className="text-xs font-bold text-muted hover:text-text bg-surface border border-edge rounded px-2 py-1 transition-colors"
          data-testid="speed-btn"
        >
          {speed}x
        </button>

        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-muted">volume_up</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => changeVolume(Number(e.target.value))}
            className="w-20 accent-primary"
            data-testid="audio-volume"
          />
        </div>

        <a
          href={audioUrl}
          download
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted bg-surface border border-edge rounded-lg px-3 py-1.5 hover:text-primary hover:border-primary/40 transition-colors"
          data-testid="audio-download"
        >
          <span className="material-symbols-outlined text-[16px]">download</span>
          Download
        </a>
      </div>
    </footer>
  );
}
