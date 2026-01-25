'use client';

import { useRef, useState, useEffect } from 'react';
import { Download, Play, Pause, Volume2, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AudioOutputPanelProps {
  audioUrl: string;
  filename?: string;
  onDownload?: () => void;
  downloadUrl?: string;
  metadata?: {
    duration?: string;
    provider?: string;
    model?: string;
    voice?: string;
  };
  showBadge?: boolean;
  badgeText?: string;
  autoPlay?: boolean;
  className?: string;
}

export function AudioOutputPanel({
  audioUrl,
  filename,
  onDownload,
  downloadUrl,
  metadata,
  showBadge = true,
  badgeText = 'Completed',
  autoPlay = false,
  className,
}: AudioOutputPanelProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => setDuration(audio.duration);
    const handleEnded = () => setIsPlaying(false);
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
    };
  }, []);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
  };

  const handleDownload = () => {
    if (onDownload) {
      onDownload();
    } else if (downloadUrl) {
      window.open(downloadUrl, '_blank');
    } else {
      // Create download link from audioUrl
      const link = document.createElement('a');
      link.href = audioUrl;
      link.download = filename || 'audio.wav';
      link.click();
    }
  };

  const formatTime = (time: number) => {
    if (!isFinite(time)) return '0:00';
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className={cn('glass-card p-6 space-y-4 animate-fade-in', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Volume2 className="w-5 h-5 text-accent-primary" aria-hidden="true" />
          <h3 className="text-lg font-semibold text-foreground">
            {filename || 'Generated Audio'}
          </h3>
        </div>
        {showBadge && (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-400">
            <CheckCircle className="w-3 h-3" aria-hidden="true" />
            {badgeText}
          </span>
        )}
      </div>

      {/* Audio element (hidden) */}
      <audio ref={audioRef} src={audioUrl} autoPlay={autoPlay} preload="metadata" />

      {/* Custom player UI */}
      <div className="space-y-3">
        {/* Progress bar */}
        <div
          className="h-2 bg-surface-2 rounded-full overflow-hidden cursor-pointer"
          onClick={(e) => {
            if (!audioRef.current || !duration) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const percent = x / rect.width;
            audioRef.current.currentTime = percent * duration;
          }}
          role="slider"
          aria-label="Audio progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
        >
          <div
            className="h-full bg-accent-primary transition-all duration-100"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={togglePlay}
              className="p-2 rounded-full bg-accent-primary text-black hover:brightness-110 transition-all"
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <Pause className="w-5 h-5" />
              ) : (
                <Play className="w-5 h-5 ml-0.5" />
              )}
            </button>
            <span className="text-sm text-foreground-muted font-mono">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          <button
            onClick={handleDownload}
            className="btn btn-secondary flex items-center gap-2"
          >
            <Download className="w-4 h-4" aria-hidden="true" />
            Download
          </button>
        </div>
      </div>

      {/* Metadata */}
      {metadata && Object.keys(metadata).some((k) => metadata[k as keyof typeof metadata]) && (
        <div className="pt-3 border-t border-glass-border">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-foreground-muted">
            {metadata.provider && (
              <span>
                Provider: <span className="text-foreground">{metadata.provider}</span>
              </span>
            )}
            {metadata.model && (
              <span>
                Model: <span className="text-foreground">{metadata.model}</span>
              </span>
            )}
            {metadata.voice && (
              <span>
                Voice: <span className="text-foreground">{metadata.voice}</span>
              </span>
            )}
            {metadata.duration && (
              <span>
                Duration: <span className="text-foreground">{metadata.duration}</span>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default AudioOutputPanel;
