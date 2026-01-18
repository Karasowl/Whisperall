'use client';

import { useState, useRef, useEffect } from 'react';
import { Play, Pause, Download, Volume2, VolumeX } from 'lucide-react';
import { formatDuration } from '@/lib/utils';

interface AudioPlayerProps {
  src: string;
  filename: string;
}

export function AudioPlayer({ src, filename }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => setDuration(audio.duration);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [src]);

  const togglePlay = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!audioRef.current) return;
    const time = parseFloat(e.target.value);
    audioRef.current.currentTime = time;
    setCurrentTime(time);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!audioRef.current) return;
    const vol = parseFloat(e.target.value);
    audioRef.current.volume = vol;
    setVolume(vol);
  };

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = src;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const progressPercent = duration ? (currentTime / duration) * 100 : 0;

  return (
    <div className="glass rounded-xl p-5">
      <audio ref={audioRef} src={src} preload="metadata" />

      <div className="flex items-center gap-4">
        {/* Play button */}
        <button
          onClick={togglePlay}
          className="w-14 h-14 flex items-center justify-center bg-gradient-to-br from-emerald-400 to-amber-400 rounded-full hover:shadow-lg hover:shadow-emerald-400/30 transition-all hover:scale-105"
        >
          {isPlaying ? (
            <Pause className="w-6 h-6 text-white" />
          ) : (
            <Play className="w-6 h-6 text-white ml-1" />
          )}
        </button>

        {/* Progress */}
        <div className="flex-1 space-y-2">
          {/* Custom progress bar */}
          <div className="relative h-2 bg-white/10 rounded-full overflow-hidden group cursor-pointer">
            <div
              className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-400 to-amber-400 rounded-full transition-all"
              style={{ width: `${progressPercent}%` }}
            />
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={currentTime}
              onChange={handleSeek}
              className="absolute inset-0 w-full opacity-0 cursor-pointer"
            />
          </div>
          <div className="flex justify-between text-xs text-foreground-muted">
            <span>{formatDuration(currentTime)}</span>
            <span>{formatDuration(duration)}</span>
          </div>
        </div>

        {/* Volume */}
        <div className="flex items-center gap-2 group">
          <button
            onClick={() => {
              if (!audioRef.current) return;
              const newVol = volume === 0 ? 1 : 0;
              audioRef.current.volume = newVol;
              setVolume(newVol);
            }}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            {volume === 0 ? (
              <VolumeX className="w-5 h-5 text-foreground-muted" />
            ) : (
              <Volume2 className="w-5 h-5 text-foreground-muted" />
            )}
          </button>
          <div className="w-20 relative h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 bg-emerald-400/70 rounded-full"
              style={{ width: `${volume * 100}%` }}
            />
            <input
              type="range"
              min={0}
              max={1}
              step={0.1}
              value={volume}
              onChange={handleVolumeChange}
              className="absolute inset-0 w-full opacity-0 cursor-pointer"
            />
          </div>
        </div>

        {/* Download */}
        <button
          onClick={handleDownload}
          className="btn btn-secondary px-4"
          title="Download"
        >
          <Download className="w-5 h-5" />
          <span className="hidden sm:inline">Download</span>
        </button>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <span className="badge badge-primary text-xs">{filename.split('.').pop()?.toUpperCase()}</span>
        <span className="text-sm text-foreground-muted truncate">{filename}</span>
      </div>
    </div>
  );
}
