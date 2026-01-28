'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, Mic, X, Play, Pause, Check } from 'lucide-react';
import { Voice, getAudioUrl } from '@/lib/api';
import { cn } from '@/lib/utils';

interface VoiceSelectorProps {
  voices: Voice[];
  selectedVoiceId: string | null;
  onSelectVoice: (voiceId: string | null) => void;
  onUploadVoice: (file: File) => void;
  uploadedFile: File | null;
  compact?: boolean;
}

export function VoiceSelector({
  voices,
  selectedVoiceId,
  onSelectVoice,
  onUploadVoice,
  uploadedFile,
  compact = false,
}: VoiceSelectorProps) {
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      onUploadVoice(acceptedFiles[0]);
      onSelectVoice(null); // Clear saved voice selection when uploading
    }
  }, [onUploadVoice, onSelectVoice]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'audio/*': ['.wav', '.mp3', '.flac', '.ogg', '.m4a'],
    },
    maxFiles: 1,
  });

  const playVoice = (voice: Voice) => {
    if (playingVoice === voice.id) {
      audioElement?.pause();
      setPlayingVoice(null);
      return;
    }

    const audio = new Audio(getAudioUrl(`/voice-files/${voice.filename}`));
    audio.onended = () => setPlayingVoice(null);
    audio.play();
    setAudioElement(audio);
    setPlayingVoice(voice.id);
  };

  // Compact mode: show as a simple dropdown-like selector
  if (compact) {
    const selectedVoice = voices.find(v => v.id === selectedVoiceId);
    
    return (
      <div className="space-y-2">
        {/* Upload zone - compact */}
        <div
          {...getRootProps()}
          className={cn(
            'border border-dashed rounded-lg p-3 text-center cursor-pointer transition-all',
            isDragActive
              ? 'border-accent-primary bg-accent-primary/10'
              : 'border-glass-border hover:border-foreground-muted',
            uploadedFile && 'border-green-500/50 bg-green-500/10'
          )}
        >
          <input {...getInputProps()} />
          {uploadedFile ? (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
                <span className="text-green-400 text-sm truncate">{uploadedFile.name}</span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onUploadVoice(null as any);
                }}
                className="p-1 hover:bg-white/10 rounded transition-colors flex-shrink-0"
              >
                <X className="w-3.5 h-3.5 text-foreground-muted" />
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 text-foreground-muted">
              <Upload className="w-4 h-4" />
              <span className="text-sm">Upload voice sample</span>
            </div>
          )}
        </div>

        {/* Saved voices - compact list */}
        {voices.length > 0 && (
          <div className="max-h-[200px] overflow-y-auto space-y-1 custom-scrollbar">
            {voices.map((voice) => (
              <div
                key={voice.id}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all text-sm',
                  selectedVoiceId === voice.id && !uploadedFile
                    ? 'bg-accent-primary/10 text-foreground'
                    : 'hover:bg-surface-2 text-foreground-secondary'
                )}
                onClick={() => {
                  onSelectVoice(voice.id);
                  onUploadVoice(null as any);
                }}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    playVoice(voice);
                  }}
                  className={cn(
                    'p-1.5 rounded-md transition-all flex-shrink-0',
                    playingVoice === voice.id
                      ? 'bg-accent-primary text-background'
                      : 'bg-surface-2 hover:bg-surface-3 text-foreground-muted'
                  )}
                >
                  {playingVoice === voice.id ? (
                    <Pause className="w-3 h-3" />
                  ) : (
                    <Play className="w-3 h-3" />
                  )}
                </button>
                <span className="truncate flex-1">{voice.name}</span>
                {selectedVoiceId === voice.id && !uploadedFile && (
                  <Check className="w-3.5 h-3.5 text-accent-primary flex-shrink-0" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <label className="label">Voice Reference</label>

      {/* Upload zone */}
      <div
        {...getRootProps()}
        className={cn(
          'border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-200',
          isDragActive
            ? 'border-emerald-400 bg-emerald-500/10'
            : 'border-glass-border hover:border-foreground-muted',
          uploadedFile && 'border-green-500/50 bg-green-500/10'
        )}
      >
        <input {...getInputProps()} />
        {uploadedFile ? (
          <div className="flex items-center justify-center gap-3">
            <div className="p-2 bg-green-500/20 rounded-lg">
              <Check className="w-5 h-5 text-green-400" />
            </div>
            <span className="text-green-400 font-medium">{uploadedFile.name}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onUploadVoice(null as any);
              }}
              className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
            >
              <X className="w-4 h-4 text-slate-400" />
            </button>
          </div>
        ) : (
          <>
            <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-amber-500/20 flex items-center justify-center">
              <Upload className="w-7 h-7 text-emerald-300" />
            </div>
            <p className="text-foreground-muted">
              {isDragActive ? 'Drop the audio file here' : 'Drag & drop a voice sample'}
            </p>
            <p className="mt-1.5 text-xs text-foreground-muted/60">
              WAV, MP3, FLAC, OGG (10-30 seconds recommended)
            </p>
          </>
        )}
      </div>

      {/* Saved voices */}
      {voices.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm text-foreground-muted">Or select from saved voices:</p>
          <div className="grid grid-cols-1 gap-2 max-h-[300px] overflow-y-auto pr-1">
            {voices.map((voice) => (
              <div
                key={voice.id}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all duration-200',
                  selectedVoiceId === voice.id && !uploadedFile
                    ? 'bg-accent-primary/10 border border-accent-primary/40' // Use accent for selection
                    : 'card-interactive' // Use theme-aware card style
                )}
                onClick={() => {
                  onSelectVoice(voice.id);
                  onUploadVoice(null as any);
                }}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    playVoice(voice);
                  }}
                  className={cn(
                    'p-2 rounded-lg transition-all',
                    playingVoice === voice.id
                      ? 'btn-primary text-white'
                      : 'bg-accent-primary/5 hover:bg-accent-primary/10 text-accent-primary'
                  )}
                >
                  {playingVoice === voice.id ? (
                    <Pause className="w-4 h-4" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate text-foreground">{voice.name}</div>
                  {voice.tags.length > 0 && (
                    <div className="text-xs text-foreground-muted truncate mt-0.5">
                      {voice.tags.join(', ')}
                    </div>
                  )}
                </div>
                {selectedVoiceId === voice.id && !uploadedFile && (
                  <Check className="w-4 h-4 text-accent-primary flex-shrink-0" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
