'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Calendar,
  ChevronDown,
  Copy,
  Download,
  Eye,
  FileAudio,
  FileText,
  Globe,
  Loader2,
  Mic,
  Music,
  Pause,
  Play,
  Search,
  Sparkles,
  Trash2,
  Wand2,
  Languages,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  deleteHistoryEntry,
  deleteNewHistoryEntry,
  exportTranscript,
  getAudioUrl,
  getHistoryFileDownloadUrl,
  getHistoryModules,
  getNewHistory,
  HistoryFilter,
  HistoryModuleInfo,
  NewHistoryEntry,
} from '@/lib/api';
import { useToast } from '@/components/Toast';

type ModuleTab = {
  id: string;
  label: string;
  count: number;
};

const MODULE_CONFIG: Record<string, { label: string; icon: any; accent: string }> = {
  transcribe: { label: 'Transcriptions', icon: FileAudio, accent: 'text-blue-400' },
  stt: { label: 'Dictation', icon: Mic, accent: 'text-emerald-400' },
  tts: { label: 'Reader', icon: FileText, accent: 'text-indigo-400' },
  reader: { label: 'Reader', icon: FileText, accent: 'text-indigo-400' },
  'ai-edit': { label: 'AI Edit', icon: Sparkles, accent: 'text-purple-400' },
  translate: { label: 'Translate', icon: Languages, accent: 'text-sky-400' },
  dubbing: { label: 'Dubbing', icon: Globe, accent: 'text-amber-400' },
  'voice-changer': { label: 'Voice Changer', icon: Wand2, accent: 'text-pink-400' },
  'voice-isolator': { label: 'Voice Isolator', icon: Wand2, accent: 'text-cyan-400' },
  sfx: { label: 'Sound FX', icon: Sparkles, accent: 'text-orange-400' },
  music: { label: 'Music', icon: Music, accent: 'text-rose-400' },
  loopback: { label: 'Live Capture', icon: Mic, accent: 'text-red-400' },
};

const MODULE_ROUTE_MAP: Record<string, string> = {
  transcribe: '/transcribe',
  stt: '/dictate',
  tts: '/reader',
  reader: '/reader',
  'ai-edit': '/ai-edit',
  translate: '/translate',
  dubbing: '/dubbing',
  'voice-changer': '/voice-changer',
  'voice-isolator': '/voice-isolator',
  sfx: '/sfx',
  music: '/music',
  loopback: '/loopback',
};

const processingStatuses = new Set([
  'pending',
  'processing',
  'transcribing',
  'diarizing',
  'downloading',
  'cleaning',
  'paused',
  'interrupted',
]);

const PREFER_TEXT_MODULES = new Set(['transcribe', 'stt', 'translate', 'ai-edit']);
const PREFER_AUDIO_MODULES = new Set([
  'tts',
  'reader',
  'voice-changer',
  'voice-isolator',
  'music',
  'sfx',
  'loopback',
]);
const PREFER_VIDEO_MODULES = new Set(['dubbing']);

export default function HistoryPage() {
  const router = useRouter();
  const toast = useToast();
  const [modules, setModules] = useState<HistoryModuleInfo[]>([]);
  const [activeModule, setActiveModule] = useState('all');
  const [entries, setEntries] = useState<NewHistoryEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [playingEntryId, setPlayingEntryId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const loadModules = useCallback(async () => {
    try {
      const data = await getHistoryModules();
      setModules(data.modules || []);
    } catch {
      setModules([]);
    }
  }, []);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    const filter: HistoryFilter = {
      limit: 50,
      offset: 0,
      module: activeModule === 'all' ? undefined : activeModule,
      search: searchTerm.trim() || undefined,
    };
    try {
      const data = await getNewHistory(filter);
      setEntries(data.entries || []);
      setTotal(data.total || 0);
    } catch {
      setEntries([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [activeModule, searchTerm]);

  useEffect(() => {
    loadModules();
  }, [loadModules]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const tabs: ModuleTab[] = useMemo(() => {
    const allCount = modules.reduce((sum, moduleInfo) => sum + moduleInfo.count, 0);
    const sorted = [...modules].sort((a, b) => b.count - a.count);
    return [
      { id: 'all', label: 'All', count: allCount },
      ...sorted.map((moduleInfo) => ({
        id: moduleInfo.module,
        label: MODULE_CONFIG[moduleInfo.module]?.label || moduleInfo.module,
        count: moduleInfo.count,
      })),
    ];
  }, [modules]);

  const completedCount = modules.reduce((sum, moduleInfo) => sum + moduleInfo.count, 0);
  const processingCount = entries.filter((entry) => processingStatuses.has(entry.status || '')).length;

  const formatDuration = (seconds?: number) => {
    if (!seconds || seconds <= 0) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes?: number, mb?: number) => {
    if (typeof bytes === 'number') {
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }
    if (typeof mb === 'number') return `${mb.toFixed(1)} MB`;
    return null;
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) {
      return { date: 'Unknown', time: '' };
    }
    return {
      date: date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }),
      time: date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    };
  };

  const sanitizeFilename = (value: string) =>
    value.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_').slice(0, 80);

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const downloadFromUrl = async (url: string, filename: string) => {
    const headers: HeadersInit = {};
    const token = typeof window !== 'undefined' ? window.electronAPI?.authToken : undefined;
    const trimmed = typeof token === 'string' ? token.trim() : '';
    if (trimmed) {
      headers['Authorization'] = `Bearer ${trimmed}`;
    }
    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`Download failed (${response.status})`);
    }
    const blob = await response.blob();
    downloadBlob(blob, filename);
  };

  const resolveEntryText = (entry: NewHistoryEntry) =>
    entry.output_text || entry.input_text || entry.text || '';

  const resolveAudioPath = (entry: NewHistoryEntry) =>
    entry.output_audio_path || entry.audio_path || entry.input_audio_path || '';

  const resolveVideoPath = (entry: NewHistoryEntry) => entry.output_video_path || '';

  const stopPlayback = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPlayingEntryId(null);
  }, []);

  useEffect(() => {
    return () => stopPlayback();
  }, [stopPlayback]);

  const handleDelete = async (entry: NewHistoryEntry) => {
    if (!confirm('Delete this entry?')) return;
    try {
      try {
        await deleteNewHistoryEntry(entry.id);
      } catch {
        await deleteHistoryEntry(entry.id, true);
      }
      toast.success('Deleted', 'Entry removed');
      loadEntries();
      loadModules();
    } catch {
      toast.error('Delete failed', 'Unable to delete entry');
    }
  };

  const handleView = (entry: NewHistoryEntry) => {
    const route = MODULE_ROUTE_MAP[entry.module];
    const jobId = entry.metadata?.job_id || entry.metadata?.transcription_id || entry.metadata?.jobId;
    if (entry.module === 'transcribe' && jobId) {
      router.push(`/transcribe?job=${jobId}`);
      return;
    }
    if (route) {
      router.push(route);
    }
  };

  const handlePlayAudio = async (entry: NewHistoryEntry) => {
    const audioPath = resolveAudioPath(entry);
    if (!audioPath) {
      toast.warning('No audio available', 'This entry does not include audio output.');
      return;
    }

    if (playingEntryId === entry.id) {
      stopPlayback();
      return;
    }

    stopPlayback();

    try {
      const audio = new Audio(getAudioUrl(audioPath));
      audioRef.current = audio;
      setPlayingEntryId(entry.id);
      audio.onended = () => setPlayingEntryId(null);
      audio.onerror = () => {
        setPlayingEntryId(null);
        toast.error('Playback failed', 'Unable to play audio.');
      };
      await audio.play();
    } catch {
      setPlayingEntryId(null);
      toast.error('Playback failed', 'Unable to play audio.');
    }
  };

  const handleCopyText = async (entry: NewHistoryEntry) => {
    const text = resolveEntryText(entry);
    if (!text) {
      toast.warning('No text available', 'This entry does not include text output.');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied', 'Text copied to clipboard.');
    } catch {
      toast.error('Copy failed', 'Unable to copy text.');
    }
  };

  const handleDownloadEntry = async (entry: NewHistoryEntry, kind?: 'text' | 'audio' | 'video') => {
    const title = sanitizeFilename(entry.title || entry.file_path || entry.input_text || entry.output_text || entry.text || 'output');
    const jobId = entry.metadata?.job_id || entry.metadata?.transcription_id || entry.metadata?.jobId;
    const textContent = resolveEntryText(entry);
    const audioPath = resolveAudioPath(entry);
    const videoPath = resolveVideoPath(entry);

    try {
      if (kind === 'text' || (!kind && PREFER_TEXT_MODULES.has(entry.module))) {
        if (entry.module === 'transcribe' && jobId) {
          const blob = await exportTranscript(jobId, 'txt', true, true);
          downloadBlob(blob, `${title}.txt`);
          return;
        }
        if (!textContent) {
          toast.warning('No text available', 'This entry does not include text output.');
          return;
        }
        downloadBlob(new Blob([textContent], { type: 'text/plain;charset=utf-8' }), `${title}.txt`);
        return;
      }

      if (kind === 'video' || (!kind && (PREFER_VIDEO_MODULES.has(entry.module) || (!!videoPath && !audioPath)))) {
        if (!videoPath) {
          toast.warning('No video available', 'This entry does not include video output.');
          return;
        }
        const extension = videoPath.split('.').pop() || 'mp4';
        const url = getHistoryFileDownloadUrl(entry.id, 'output_video');
        await downloadFromUrl(url, `${title}.${extension}`);
        return;
      }

      if (kind === 'audio' || (!kind && (PREFER_AUDIO_MODULES.has(entry.module) || !!audioPath))) {
        if (!audioPath) {
          toast.warning('No audio available', 'This entry does not include audio output.');
          return;
        }
        const extension = audioPath.split('.').pop() || 'mp3';
        const fileType = entry.output_audio_path ? 'output_audio' : 'input_audio';
        const url = getHistoryFileDownloadUrl(entry.id, fileType);
        await downloadFromUrl(url, `${title}.${extension}`);
        return;
      }

      if (textContent) {
        downloadBlob(new Blob([textContent], { type: 'text/plain;charset=utf-8' }), `${title}.txt`);
        return;
      }
    } catch {
      toast.error('Download failed', 'Unable to download this file.');
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col overflow-x-hidden page-premium">
      <header className="sticky top-0 z-50 flex items-center justify-between whitespace-nowrap border-b border-white/5 bg-background/90 backdrop-blur-md px-10 py-3">
        <div className="flex items-center gap-4 text-foreground">
          <div className="size-8 flex items-center justify-center rounded-lg bg-accent-primary/20 text-accent-primary">
            <FileAudio className="w-4 h-4" />
          </div>
          <h2 className="text-foreground text-base font-semibold leading-tight tracking-tight">Whisperall AI</h2>
        </div>
        <div className="flex flex-1 justify-end gap-8 items-center">
          <div className="hidden md:flex items-center gap-9">
            <Link className="text-foreground-muted hover:text-foreground transition-colors text-xs font-medium uppercase tracking-wide" href="/dictate">Dashboard</Link>
            <Link className="text-foreground text-xs font-medium uppercase tracking-wide border-b border-accent-primary pb-0.5" href="/history">History</Link>
            <Link className="text-foreground-muted hover:text-foreground transition-colors text-xs font-medium uppercase tracking-wide" href="/settings">Settings</Link>
          </div>
          <div className="flex items-center gap-4">
            <Link className="hidden sm:flex h-9 cursor-pointer items-center justify-center rounded-lg bg-accent-primary px-4 text-white text-xs font-bold leading-normal tracking-wide hover:bg-accent-primary/90 transition-colors shadow-lg shadow-accent-primary/20" href="/transcribe">
              New Transcription
            </Link>
            <div className="bg-surface-2 border border-surface-3 rounded-full h-9 w-9" />
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center px-6 md:px-12 py-12">
        <div className="w-full max-w-[1280px] flex flex-col gap-10">
          <div className="flex flex-wrap justify-between items-end gap-4 pb-4 border-b border-white/5">
            <div className="flex flex-col gap-1">
              <h1 className="text-foreground text-2xl font-bold tracking-tight">History</h1>
              <p className="text-foreground-muted text-sm font-normal">Manage your audio processing tasks.</p>
            </div>
            <div className="flex gap-8 text-xs text-foreground-muted font-medium uppercase tracking-wider">
              <div className="flex items-center gap-2">
                <span className="text-foreground font-bold">{completedCount}</span> Completed
              </div>
              <div className="flex items-center gap-2">
                <span className="text-accent-primary font-bold">{processingCount}</span> Processing
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveModule(tab.id)}
                className={cn(
                  'px-4 py-2 rounded-full text-xs font-semibold uppercase tracking-wider transition-colors',
                  activeModule === tab.id
                    ? 'bg-accent-primary/20 text-accent-primary border border-accent-primary/30'
                    : 'bg-surface-2 text-foreground-muted hover:text-foreground'
                )}
              >
                {tab.label}
                <span className="ml-2 text-[10px] opacity-70">{tab.count}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-col xl:flex-row gap-6 justify-between items-center">
            <div className="flex flex-col md:flex-row gap-6 w-full md:w-auto items-center">
              <div className="relative group min-w-[320px]">
                <div className="absolute inset-y-0 left-0 flex items-center pl-0 pointer-events-none text-foreground-muted group-focus-within:text-foreground transition-colors">
                  <Search className="w-4 h-4" />
                </div>
                <input
                  className="block w-full py-2 pl-8 pr-4 text-sm text-foreground bg-transparent border-0 border-b border-surface-3 focus:ring-0 focus:border-white placeholder:text-foreground-muted/50 transition-colors"
                  placeholder="Search filename..."
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="flex gap-6 items-center">
                <button className="text-xs font-medium text-foreground flex items-center gap-1 hover:text-accent-primary transition-colors">
                  Status: All
                  <ChevronDown className="w-4 h-4" />
                </button>
                <button className="text-xs font-medium text-foreground-muted flex items-center gap-1 hover:text-foreground transition-colors">
                  Date Range
                  <Calendar className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex items-center gap-4 justify-end w-full md:w-auto">
              <button
                className="flex items-center gap-2 text-xs font-medium text-foreground-muted hover:text-foreground transition-colors"
                onClick={loadEntries}
              >
                <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
                Refresh
              </button>
              <button className="flex items-center gap-2 text-xs font-medium text-foreground-muted hover:text-foreground transition-colors">
                <Download className="w-4 h-4" />
                Export CSV
              </button>
            </div>
          </div>

          <div className="w-full">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-xs font-medium uppercase tracking-widest text-foreground-muted border-b border-white/5">
                  <th className="px-4 py-6 font-medium w-[45%]" scope="col">Filename</th>
                  <th className="px-4 py-6 font-medium" scope="col">Date</th>
                  <th className="px-4 py-6 font-medium" scope="col">Duration</th>
                  <th className="px-4 py-6 font-medium" scope="col">Status</th>
                  <th className="px-4 py-6 font-medium text-right w-[15%]" scope="col"></th>
                </tr>
              </thead>
              <tbody className="text-[13px] md:text-[14px]">
                {loading ? (
                  <tr>
                    <td className="px-4 py-8 text-foreground-muted" colSpan={5}>
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Loading history...
                      </div>
                    </td>
                  </tr>
                ) : entries.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-foreground-muted" colSpan={5}>
                      No history yet.
                    </td>
                  </tr>
                ) : (
                  entries.map((entry) => {
                    const config = MODULE_CONFIG[entry.module];
                    const Icon = config?.icon || FileAudio;
                    const { date, time } = formatDateTime(entry.created_at);
                    const title = entry.title || entry.file_path || entry.input_audio_path || entry.output_audio_path || entry.output_video_path || entry.input_text || entry.output_text || entry.text || 'Untitled';
                    const duration = entry.duration_seconds ?? entry.duration;
                    const fileSizeLabel = formatFileSize(entry.metadata?.file_size_bytes, entry.metadata?.file_size_mb);
                    const status = entry.status || (entry.error_message ? 'failed' : 'completed');
                    const isProcessing = processingStatuses.has(status);
                    const isFailed = status === 'failed' || status === 'error' || status === 'cancelled';
                    const statusLabel = isProcessing ? 'Processing' : isFailed ? 'Failed' : 'Completed';
                    const statusClass = isProcessing
                      ? 'text-blue-400'
                      : isFailed
                        ? 'text-red-400'
                        : 'text-emerald-400';
                    const jobId = entry.metadata?.job_id || entry.metadata?.transcription_id || entry.metadata?.jobId;
                    const textContent = resolveEntryText(entry);
                    const audioPath = resolveAudioPath(entry);
                    const videoPath = resolveVideoPath(entry);
                    const hasAudio = Boolean(audioPath);
                    const hasVideo = Boolean(videoPath);
                    const hasText = Boolean(textContent);
                    const preferText = PREFER_TEXT_MODULES.has(entry.module);
                    const preferVideo = PREFER_VIDEO_MODULES.has(entry.module);
                    const preferAudio = PREFER_AUDIO_MODULES.has(entry.module);
                    const downloadKind: 'text' | 'audio' | 'video' | null = preferText
                      ? jobId || hasText
                        ? 'text'
                        : null
                      : preferVideo
                        ? hasVideo
                          ? 'video'
                          : null
                        : preferAudio
                          ? hasAudio
                            ? 'audio'
                            : null
                          : hasAudio
                            ? 'audio'
                            : hasVideo
                              ? 'video'
                              : hasText
                                ? 'text'
                                : null;
                    const isPlaying = playingEntryId === entry.id;

                    return (
                      <tr key={entry.id} className="group border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                        <td className="px-4 py-6">
                          <div className="flex items-start gap-4">
                            <div className={cn('mt-1 opacity-80', config?.accent || 'text-foreground-muted')}>
                              <Icon className="w-4 h-4" />
                            </div>
                            <div className="flex flex-col gap-1 min-w-0">
                              <span
                                className="text-foreground font-medium group-hover:text-accent-primary transition-colors cursor-pointer truncate"
                                onClick={() => handleView(entry)}
                              >
                                {title}
                              </span>
                              <span className="text-xs text-foreground-muted">
                                {config?.label || entry.module}
                                {fileSizeLabel ? ` • ${fileSizeLabel}` : ''}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-6 whitespace-nowrap text-foreground-muted">
                          {date} <span className="text-xs opacity-50 ml-1">{time}</span>
                        </td>
                        <td className="px-4 py-6 text-foreground-muted font-mono">
                          {formatDuration(duration)}
                        </td>
                        <td className="px-4 py-6">
                          <div className="flex items-center gap-2">
                            {isProcessing && (
                              <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400/70 opacity-75" />
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-400" />
                              </span>
                            )}
                            <span className={cn('font-medium text-xs', statusClass)}>{statusLabel}</span>
                          </div>
                        </td>
                        <td className="px-4 py-6 text-right">
                          <div className="flex items-center justify-end gap-4 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              className="text-foreground-muted hover:text-foreground transition-colors"
                              title="View details"
                              onClick={() => handleView(entry)}
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            {hasAudio && (
                              <button
                                className="text-foreground-muted hover:text-accent-primary transition-colors"
                                title={isPlaying ? 'Pause audio' : 'Play audio'}
                                onClick={() => handlePlayAudio(entry)}
                              >
                                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                              </button>
                            )}
                            {hasText && (
                              <button
                                className="text-foreground-muted hover:text-foreground transition-colors"
                                title="Copy text"
                                onClick={() => handleCopyText(entry)}
                              >
                                <Copy className="w-4 h-4" />
                              </button>
                            )}
                            {downloadKind && (
                              <button
                                className="text-foreground-muted hover:text-accent-primary transition-colors"
                                title={`Download ${downloadKind}`}
                                onClick={() => handleDownloadEntry(entry, downloadKind)}
                              >
                                <Download className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              className="text-foreground-muted hover:text-red-400 transition-colors"
                              title="Delete"
                              onClick={() => handleDelete(entry)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between pt-8">
            <p className="text-xs text-foreground-muted">
              Showing <span className="font-medium text-foreground">1-{Math.min(entries.length, total)}</span> of{' '}
              <span className="font-medium text-foreground">{total}</span>
            </p>
            <div className="flex gap-6">
              <button className="text-xs font-medium text-foreground-muted hover:text-foreground disabled:opacity-30 transition-colors" disabled>
                Previous
              </button>
              <button className="text-xs font-medium text-foreground-muted hover:text-foreground transition-colors">
                Next
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
