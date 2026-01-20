'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, Play, Pause, Scissors, Save, X, Video, Music, Loader2, Download, CheckCircle, AlertTriangle } from 'lucide-react';
import { uploadMedia, trimAndSaveVoice, cleanupTempMedia, getAudioUrl, getFFmpegStatus, installFFmpeg, MediaUploadResponse, FFmpegStatus } from '@/lib/api';
import { cn } from '@/lib/utils';

interface AudioTrimmerProps {
  onVoiceSaved: () => void;
  onClose?: () => void;
}

export function AudioTrimmer({ onVoiceSaved, onClose }: AudioTrimmerProps) {
  // FFmpeg state
  const [ffmpegStatus, setFfmpegStatus] = useState<FFmpegStatus | null>(null);
  const [isCheckingFfmpeg, setIsCheckingFfmpeg] = useState(true);
  const [isInstallingFfmpeg, setIsInstallingFfmpeg] = useState(false);

  // Upload state
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Media state
  const [mediaData, setMediaData] = useState<MediaUploadResponse | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  // Selection state
  const [selectionStart, setSelectionStart] = useState(0);
  const [selectionEnd, setSelectionEnd] = useState(30);
  const [isDraggingSelection, setIsDraggingSelection] = useState<'start' | 'end' | 'range' | null>(null);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartValues, setDragStartValues] = useState({ start: 0, end: 0 });

  // Save state
  const [voiceName, setVoiceName] = useState('');
  const [voiceTags, setVoiceTags] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const waveformRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check FFmpeg on mount
  useEffect(() => {
    checkFfmpeg();
  }, []);

  const checkFfmpeg = async () => {
    setIsCheckingFfmpeg(true);
    try {
      const status = await getFFmpegStatus();
      setFfmpegStatus(status);
    } catch (err) {
      setFfmpegStatus({ available: false, path: null, version: null, error: 'Failed to check FFmpeg status' });
    } finally {
      setIsCheckingFfmpeg(false);
    }
  };

  const handleInstallFfmpeg = async () => {
    setIsInstallingFfmpeg(true);
    setUploadError(null);
    try {
      await installFFmpeg();
      await checkFfmpeg();
    } catch (err: any) {
      setUploadError(err.response?.data?.detail || 'Failed to install FFmpeg');
    } finally {
      setIsInstallingFfmpeg(false);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mediaData) {
        cleanupTempMedia(mediaData.temp_id).catch(console.error);
      }
      audioElement?.pause();
    };
  }, [mediaData, audioElement]);

  // Update selection when media loads
  useEffect(() => {
    if (mediaData) {
      setSelectionStart(0);
      setSelectionEnd(Math.min(30, mediaData.duration));
    }
  }, [mediaData]);

  // Audio time tracking
  useEffect(() => {
    if (!audioElement) return;

    const handleTimeUpdate = () => {
      setCurrentTime(audioElement.currentTime);
      // Stop at selection end
      if (audioElement.currentTime >= selectionEnd) {
        audioElement.pause();
        audioElement.currentTime = selectionStart;
        setIsPlaying(false);
      }
    };

    const handleEnded = () => setIsPlaying(false);

    audioElement.addEventListener('timeupdate', handleTimeUpdate);
    audioElement.addEventListener('ended', handleEnded);

    return () => {
      audioElement.removeEventListener('timeupdate', handleTimeUpdate);
      audioElement.removeEventListener('ended', handleEnded);
    };
  }, [audioElement, selectionStart, selectionEnd]);

  const handleFileSelect = async (file: File) => {
    setUploadError(null);
    setIsUploading(true);

    // Cleanup previous
    if (mediaData) {
      await cleanupTempMedia(mediaData.temp_id).catch(console.error);
      audioElement?.pause();
    }

    try {
      const data = await uploadMedia(file);
      setMediaData(data);

      // Create audio element
      const audio = new Audio(getAudioUrl(data.audio_url));
      audio.preload = 'auto';
      setAudioElement(audio);
      setCurrentTime(0);
      setIsPlaying(false);

      // Extract name from filename
      const baseName = file.name.replace(/\.[^/.]+$/, '');
      setVoiceName(baseName);
    } catch (err: any) {
      setUploadError(err.response?.data?.detail || err.message || 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handlePlayPause = () => {
    if (!audioElement) return;

    if (isPlaying) {
      audioElement.pause();
      setIsPlaying(false);
    } else {
      audioElement.currentTime = selectionStart;
      audioElement.play();
      setIsPlaying(true);
    }
  };

  // Waveform interaction
  const getTimeFromX = useCallback((clientX: number): number => {
    if (!waveformRef.current || !mediaData) return 0;
    const rect = waveformRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    return (x / rect.width) * mediaData.duration;
  }, [mediaData]);

  const handleWaveformMouseDown = (e: React.MouseEvent, type: 'start' | 'end' | 'range') => {
    e.preventDefault();
    setIsDraggingSelection(type);
    setDragStartX(e.clientX);
    setDragStartValues({ start: selectionStart, end: selectionEnd });
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDraggingSelection || !waveformRef.current || !mediaData) return;

    const deltaX = e.clientX - dragStartX;
    const rect = waveformRef.current.getBoundingClientRect();
    const deltaTime = (deltaX / rect.width) * mediaData.duration;

    if (isDraggingSelection === 'start') {
      let newStart = Math.max(0, dragStartValues.start + deltaTime);
      newStart = Math.min(newStart, selectionEnd - 0.5); // Min 0.5s selection
      setSelectionStart(newStart);
    } else if (isDraggingSelection === 'end') {
      let newEnd = Math.min(mediaData.duration, dragStartValues.end + deltaTime);
      newEnd = Math.max(newEnd, selectionStart + 0.5);
      // Limit to 30 seconds
      if (newEnd - selectionStart > 30) {
        newEnd = selectionStart + 30;
      }
      setSelectionEnd(newEnd);
    } else if (isDraggingSelection === 'range') {
      const duration = dragStartValues.end - dragStartValues.start;
      let newStart = dragStartValues.start + deltaTime;
      let newEnd = dragStartValues.end + deltaTime;

      // Clamp to bounds
      if (newStart < 0) {
        newStart = 0;
        newEnd = duration;
      }
      if (newEnd > mediaData.duration) {
        newEnd = mediaData.duration;
        newStart = newEnd - duration;
      }

      setSelectionStart(newStart);
      setSelectionEnd(newEnd);
    }
  }, [isDraggingSelection, dragStartX, dragStartValues, mediaData, selectionStart, selectionEnd]);

  const handleMouseUp = useCallback(() => {
    setIsDraggingSelection(null);
  }, []);

  useEffect(() => {
    if (isDraggingSelection) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDraggingSelection, handleMouseMove, handleMouseUp]);

  const handleSave = async () => {
    if (!mediaData || !voiceName.trim()) return;

    setIsSaving(true);
    try {
      await trimAndSaveVoice(
        mediaData.temp_id,
        selectionStart,
        selectionEnd,
        voiceName.trim(),
        voiceTags
      );
      setMediaData(null);
      setVoiceName('');
      setVoiceTags('');
      onVoiceSaved();
    } catch (err: any) {
      setUploadError(err.response?.data?.detail || 'Failed to save voice');
    } finally {
      setIsSaving(false);
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms}`;
  };

  const selectionDuration = selectionEnd - selectionStart;

  return (
    <div className="glass-card p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-500/20 rounded-lg">
            <Scissors className="w-5 h-5 text-emerald-200" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-100">Trim Audio/Video</h3>
            <p className="text-sm text-slate-400">Extract up to 30 seconds for voice cloning</p>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        )}
      </div>

      {/* FFmpeg Status */}
      {isCheckingFfmpeg ? (
        <div className="flex items-center justify-center gap-3 p-8 bg-white/5 rounded-xl">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          <p className="text-slate-400">Checking FFmpeg...</p>
        </div>
      ) : ffmpegStatus && !ffmpegStatus.available ? (
        <div className="p-6 bg-amber-500/10 border border-amber-500/30 rounded-xl">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-amber-500/20 rounded-lg">
              <AlertTriangle className="w-6 h-6 text-amber-300" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-amber-200">FFmpeg required</h3>
              <p className="text-sm text-slate-400 mt-1">
                FFmpeg is required to process audio and video. It will be installed locally (~80 MB).
              </p>
              <button
                onClick={handleInstallFfmpeg}
                disabled={isInstallingFfmpeg}
                className="btn btn-primary mt-4"
              >
                {isInstallingFfmpeg ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Installing FFmpeg...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Install FFmpeg
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : ffmpegStatus?.available ? (
        <>
          {/* FFmpeg Ready indicator */}
          <div className="flex items-center gap-2 text-sm text-emerald-300 mb-2">
            <CheckCircle className="w-4 h-4" />
            FFmpeg ready {ffmpegStatus.bundled && '(bundled)'}
          </div>

          {/* Upload zone */}
          {!mediaData && (
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all",
                isDragging ? "border-emerald-400 bg-emerald-500/10" : "border-white/10 hover:border-white/20",
                isUploading && "pointer-events-none opacity-50"
              )}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*,audio/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
              />

              {isUploading ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-10 h-10 text-emerald-300 animate-spin" />
                  <p className="text-slate-400">Processing file...</p>
                </div>
              ) : (
                <>
                  <div className="flex justify-center gap-4 mb-4">
                    <div className="p-3 bg-cyan-500/20 rounded-full">
                      <Video className="w-6 h-6 text-cyan-200" />
                    </div>
                    <div className="p-3 bg-emerald-500/20 rounded-full">
                      <Music className="w-6 h-6 text-emerald-300" />
                    </div>
                  </div>
                  <p className="text-slate-100 font-medium">
                    {isDragging ? 'Drop the file here' : 'Drag and drop audio or video'}
                  </p>
                  <p className="text-sm text-slate-400 mt-1">
                    MP4, MOV, AVI, MKV, MP3, WAV, FLAC, M4A
                  </p>
                </>
              )}
            </div>
          )}
        </>
      ) : null}

      {uploadError && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-300 text-sm">
          {uploadError}
        </div>
      )}

      {/* Waveform editor */}
      {mediaData && (
        <div className="space-y-4">
          {/* Waveform visualization */}
          <div className="relative">
            <div
              ref={waveformRef}
              className="h-32 bg-black/40 rounded-lg overflow-hidden relative select-none"
            >
              {/* Waveform bars */}
              <div className="absolute inset-0 flex items-center px-1">
                {mediaData.waveform.map((value, i) => (
                  <div
                    key={i}
                    className="flex-1 mx-px"
                    style={{ height: `${Math.max(4, value * 100)}%` }}
                  >
                    <div
                      className={cn(
                        "w-full h-full rounded-sm transition-colors",
                        i / mediaData.waveform.length >= selectionStart / mediaData.duration &&
                        i / mediaData.waveform.length <= selectionEnd / mediaData.duration
                          ? "bg-emerald-400"
                          : "bg-white/10"
                      )}
                    />
                  </div>
                ))}
              </div>

              {/* Selection overlay */}
              <div
                className="absolute top-0 bottom-0 bg-emerald-400/20 border-x-2 border-emerald-400 cursor-move"
                style={{
                  left: `${(selectionStart / mediaData.duration) * 100}%`,
                  width: `${((selectionEnd - selectionStart) / mediaData.duration) * 100}%`,
                }}
                onMouseDown={(e) => handleWaveformMouseDown(e, 'range')}
              >
                {/* Start handle */}
                <div
                  className="absolute -left-3 top-0 bottom-0 w-6 cursor-ew-resize flex items-center justify-center group"
                  onMouseDown={(e) => { e.stopPropagation(); handleWaveformMouseDown(e, 'start'); }}
                >
                  <div className="w-1 h-full bg-emerald-400 group-hover:bg-emerald-300" />
                  <div className="absolute w-4 h-8 bg-emerald-400 rounded group-hover:bg-emerald-300" />
                </div>

                {/* End handle */}
                <div
                  className="absolute -right-3 top-0 bottom-0 w-6 cursor-ew-resize flex items-center justify-center group"
                  onMouseDown={(e) => { e.stopPropagation(); handleWaveformMouseDown(e, 'end'); }}
                >
                  <div className="w-1 h-full bg-emerald-400 group-hover:bg-emerald-300" />
                  <div className="absolute w-4 h-8 bg-emerald-400 rounded group-hover:bg-emerald-300" />
                </div>
              </div>

              {/* Playhead */}
              {isPlaying && (
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-white pointer-events-none"
                  style={{ left: `${(currentTime / mediaData.duration) * 100}%` }}
                />
              )}

              {/* Time markers */}
              <div className="absolute bottom-1 left-2 text-xs text-white/70">
                {formatTime(selectionStart)}
              </div>
              <div className="absolute bottom-1 right-2 text-xs text-white/70">
                {formatTime(selectionEnd)}
              </div>
            </div>

            {/* Selection info */}
            <div className="flex items-center justify-between mt-2 text-sm">
              <span className="text-slate-400">
                Total duration: {formatTime(mediaData.duration)}
              </span>
              <span className={cn(
                "font-medium",
                selectionDuration > 30 ? "text-red-300" : "text-emerald-300"
              )}>
                Selection: {formatTime(selectionDuration)}
                {selectionDuration > 30 && " (max 30s)"}
              </span>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-4">
            <button
              onClick={handlePlayPause}
              className="btn btn-secondary"
            >
              {isPlaying ? (
                <>
                  <Pause className="w-4 h-4" />
                  Pause
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Play selection
                </>
              )}
            </button>

            <button
              onClick={() => {
                setMediaData(null);
                audioElement?.pause();
                cleanupTempMedia(mediaData.temp_id).catch(console.error);
              }}
              className="btn btn-ghost"
            >
              Change file
            </button>
          </div>

          {/* Save form */}
          <div className="border-t pt-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-100 mb-1">
                  Voice name *
                </label>
                <input
                  type="text"
                  value={voiceName}
                  onChange={(e) => setVoiceName(e.target.value)}
                  placeholder="Example: Narrator - English"
                  className="input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-100 mb-1">
                  Tags (optional)
                </label>
                <input
                  type="text"
                  value={voiceTags}
                  onChange={(e) => setVoiceTags(e.target.value)}
                  placeholder="male, calm, spanish"
                  className="input"
                />
              </div>
            </div>

            <button
              onClick={handleSave}
              disabled={!voiceName.trim() || selectionDuration > 30 || isSaving}
              className="btn btn-primary w-full"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  Save to library ({formatTime(selectionDuration)})
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
