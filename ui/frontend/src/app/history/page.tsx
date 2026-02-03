'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  History,
  Play,
  Pause,
  Trash2,
  RefreshCw,
  Download,
  Clock,
  FileAudio,
  FileText,
  AlertCircle,
  Users,
  Mic,
  Filter,
  ArrowUp,
  ArrowDown,
  LayoutGrid,
  BarChart3,
  CheckSquare,
  Square,
  X,
} from 'lucide-react';
import {
  getHistory,
  deleteHistoryEntry,
  clearHistory,
  getAudioUrl,
  getTranscriptionHistory,
  deleteTranscriptionJob,
  clearAllTranscriptions,
  HistoryEntry,
  TranscriptionJob,
  NewHistoryEntry,
  HistoryFilter,
  getNewHistory,
  getHistoryStats,
  HistoryStats,
  bulkDeleteHistoryEntries,
} from '@/lib/api';
import { cn } from '@/lib/utils';
import HistoryFilters from '@/components/HistoryFilters';
import HistoryEntryCard from '@/components/HistoryEntryCard';
import { SkeletonHistoryEntry, SkeletonStatsGrid } from '@/components/Skeleton';
import { useToast } from '@/components/Toast';

type TabType = 'all' | 'tts' | 'transcriptions';
type TranscriptionStatus = 'all' | 'completed' | 'paused' | 'interrupted' | 'error' | 'cancelled';
type SortOrder = 'newest' | 'oldest';

export default function HistoryPage() {
  const router = useRouter();
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<TabType>('all');

  // New unified history state
  const [newHistory, setNewHistory] = useState<NewHistoryEntry[]>([]);
  const [newHistoryLoading, setNewHistoryLoading] = useState(true);
  const [newHistoryTotal, setNewHistoryTotal] = useState(0);
  const [filters, setFilters] = useState<HistoryFilter>({ limit: 50, offset: 0 });
  const [stats, setStats] = useState<HistoryStats | null>(null);

  // TTS History state (legacy)
  const [ttsHistory, setTtsHistory] = useState<HistoryEntry[]>([]);
  const [ttsLoading, setTtsLoading] = useState(true);
  const [ttsTotal, setTtsTotal] = useState(0);

  // Transcription History state
  const [transcriptions, setTranscriptions] = useState<TranscriptionJob[]>([]);
  const [transcriptionsLoading, setTranscriptionsLoading] = useState(true);
  const [transcriptionsTotal, setTranscriptionsTotal] = useState(0);

  // Error state removed - now using toast notifications
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);

  // Filter state for transcriptions
  const [statusFilter, setStatusFilter] = useState<TranscriptionStatus>('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');

  // Selection state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Load new history
  const loadNewHistory = useCallback(async () => {
    setNewHistoryLoading(true);
    try {
      const data = await getNewHistory(filters);
      setNewHistory(data.entries);
      setNewHistoryTotal(data.total);
    } catch (err) {
      console.error('Error loading new history:', err);
    } finally {
      setNewHistoryLoading(false);
    }
  }, [filters]);

  // Load stats
  const loadStats = async () => {
    try {
      const data = await getHistoryStats();
      setStats(data);
    } catch (err) {
      console.error('Error loading stats:', err);
    }
  };

  useEffect(() => {
    loadNewHistory();
    loadStats();
  }, [loadNewHistory]);

  useEffect(() => {
    loadTtsHistory();
    loadTranscriptionHistory();
  }, []);

  const loadTtsHistory = async () => {
    setTtsLoading(true);
    try {
      const data = await getHistory(50, 0);
      setTtsHistory(data.history);
      setTtsTotal(data.total);
    } catch (err) {
      console.error('Error loading TTS history:', err);
    } finally {
      setTtsLoading(false);
    }
  };

  const loadTranscriptionHistory = async () => {
    setTranscriptionsLoading(true);
    try {
      const data = await getTranscriptionHistory();
      setTranscriptions(data.jobs);
      setTranscriptionsTotal(data.total);
    } catch (err) {
      console.error('Error loading transcription history:', err);
    } finally {
      setTranscriptionsLoading(false);
    }
  };

  const handleFiltersChange = (newFilters: HistoryFilter) => {
    setFilters(newFilters);
  };

  const handleEntryUpdate = (updatedEntry: NewHistoryEntry) => {
    setNewHistory(prev => prev.map(e => e.id === updatedEntry.id ? updatedEntry : e));
  };

  const handleEntryDelete = (entryId: string) => {
    setNewHistory(prev => prev.filter(e => e.id !== entryId));
    setNewHistoryTotal(prev => prev - 1);
    selectedIds.delete(entryId);
    setSelectedIds(new Set(selectedIds));
  };

  // Selection handlers
  const handleSelectionChange = (entryId: string, selected: boolean) => {
    const newSelection = new Set(selectedIds);
    if (selected) {
      newSelection.add(entryId);
    } else {
      newSelection.delete(entryId);
    }
    setSelectedIds(newSelection);
  };

  const handleSelectAll = () => {
    if (selectedIds.size === newHistory.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(newHistory.map(e => e.id)));
    }
  };

  const handleExitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} selected entries?`)) return;

    setBulkDeleting(true);
    try {
      const result = await bulkDeleteHistoryEntries(Array.from(selectedIds));
      setNewHistory(prev => prev.filter(e => !selectedIds.has(e.id)));
      setNewHistoryTotal(prev => prev - result.deleted_count);
      setSelectedIds(new Set());
      setSelectionMode(false);

      if (result.failed_count > 0) {
        toast.warning('Partial delete', `Deleted ${result.deleted_count} entries. ${result.failed_count} failed.`);
      } else {
        toast.success('Deleted', `${result.deleted_count} entries removed`);
      }
    } catch (err) {
      toast.error('Bulk delete failed', 'Please try again');
    } finally {
      setBulkDeleting(false);
    }
  };

  // Regeneration handler - navigate to appropriate module with params
  const handleRegenerate = (entry: NewHistoryEntry) => {
    const params = new URLSearchParams();

    switch (entry.module) {
      case 'tts':
        params.set('text', entry.input_text || '');
        if (entry.provider) params.set('provider', entry.provider);
        if (entry.model) params.set('model', entry.model);
        if (entry.metadata?.voice_id) params.set('voice', entry.metadata.voice_id);
        router.push(`/?${params.toString()}`);
        break;
      case 'stt':
        router.push('/dictate');
        break;
      case 'voice-changer':
        if (entry.metadata?.target_voice_id) params.set('voice', entry.metadata.target_voice_id);
        router.push(`/voice-changer?${params.toString()}`);
        break;
      case 'voice-isolator':
        if (entry.provider) params.set('provider', entry.provider);
        router.push(`/voice-isolator?${params.toString()}`);
        break;
      case 'sfx':
        if (entry.input_text) params.set('prompt', entry.input_text);
        router.push(`/sfx?${params.toString()}`);
        break;
      case 'music':
        if (entry.metadata?.lyrics) params.set('lyrics', entry.metadata.lyrics);
        if (entry.metadata?.style) params.set('style', entry.metadata.style);
        router.push(`/music?${params.toString()}`);
        break;
      case 'translate':
        params.set('text', entry.input_text || '');
        if (entry.metadata?.source_language) params.set('from', entry.metadata.source_language);
        if (entry.metadata?.target_language) params.set('to', entry.metadata.target_language);
        router.push(`/translate?${params.toString()}`);
        break;
      case 'ai-edit':
        params.set('text', entry.input_text || '');
        if (entry.metadata?.instruction) params.set('command', entry.metadata.instruction);
        router.push(`/ai-edit?${params.toString()}`);
        break;
      case 'reader':
        if (entry.input_text) params.set('text', entry.input_text);
        if (entry.metadata?.source_url) params.set('url', entry.metadata.source_url);
        if (entry.metadata?.voice_id) params.set('voice', entry.metadata.voice_id);
        router.push(`/reader?${params.toString()}`);
        break;
      default:
        // For other modules, just navigate to the module page
        router.push(`/${entry.module}`);
    }
  };

  const handlePlay = (entry: HistoryEntry) => {
    if (!entry.file_exists || !entry.output_url) return;

    if (playingId === entry.id) {
      audioElement?.pause();
      setPlayingId(null);
      return;
    }

    audioElement?.pause();

    const audio = new Audio(getAudioUrl(entry.output_url));
    audio.onended = () => setPlayingId(null);
    audio.onerror = () => {
      setPlayingId(null);
      toast.error('Playback failed', 'Unable to play audio file');
    };
    audio.play();
    setAudioElement(audio);
    setPlayingId(entry.id);
  };

  const handleDeleteTts = async (entry: HistoryEntry) => {
    if (!confirm('Delete this entry and its audio file?')) return;
    try {
      await deleteHistoryEntry(entry.id, true);
      await loadTtsHistory();
      toast.success('Deleted', 'Entry removed');
    } catch {
      toast.error('Delete failed', 'Could not remove entry');
    }
  };

  const handleDeleteTranscription = async (job: TranscriptionJob) => {
    if (!confirm('Delete this transcription?')) return;
    try {
      await deleteTranscriptionJob(job.job_id);
      await loadTranscriptionHistory();
      toast.success('Deleted', 'Transcription removed');
    } catch {
      toast.error('Delete failed', 'Could not remove transcription');
    }
  };

  const handleClearAll = async () => {
    if (activeTab === 'tts') {
      if (!confirm('Delete all TTS history entries?')) return;
      if (!confirm('Also delete audio files to free disk space?')) {
        try {
          await clearHistory(false);
          await loadTtsHistory();
          toast.success('Cleared', 'History entries removed');
        } catch {
          toast.error('Clear failed', 'Could not clear history');
        }
        return;
      }

      try {
        const result = await clearHistory(true);
        await loadTtsHistory();
        toast.success('History cleared', `${(result.freed_bytes / (1024 * 1024)).toFixed(2)} MB freed`);
      } catch {
        toast.error('Clear failed', 'Could not clear history');
      }
    } else if (activeTab === 'transcriptions') {
      if (!confirm('Delete all transcriptions? This will also delete any temporary media files.')) return;

      try {
        const result = await clearAllTranscriptions();
        await loadTranscriptionHistory();
        toast.success('Transcriptions cleared', `${result.deleted_count} deleted, ${(result.freed_bytes / (1024 * 1024)).toFixed(2)} MB freed`);
      } catch {
        toast.error('Clear failed', 'Could not clear transcriptions');
      }
    }
  };

  const handleDownloadTts = (entry: HistoryEntry) => {
    if (!entry.file_exists || !entry.output_url) return;
    const link = document.createElement('a');
    link.href = getAudioUrl(entry.output_url);
    link.download = entry.filename || 'audio.wav';
    link.click();
  };

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDuration = (seconds: number | undefined) => {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatBillingValue = (value?: number | null) =>
    value != null ? new Intl.NumberFormat().format(value) : null;

  const formatBytes = (bytes: number | undefined) => {
    if (bytes === undefined) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const modelNames: Record<string, string> = {
    original: 'Original',
    turbo: 'Turbo',
    multilingual: 'Multilingual',
  };

  const loading = activeTab === 'all' ? newHistoryLoading
    : activeTab === 'tts' ? ttsLoading
    : transcriptionsLoading;

  const total = activeTab === 'all' ? newHistoryTotal
    : activeTab === 'tts' ? ttsTotal
    : transcriptionsTotal;

  // Filter and sort transcriptions
  const filteredTranscriptions = transcriptions
    .filter(job => statusFilter === 'all' || job.status === statusFilter)
    .sort((a, b) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
    });

  const statusCounts = {
    all: transcriptions.length,
    completed: transcriptions.filter(j => j.status === 'completed').length,
    paused: transcriptions.filter(j => j.status === 'paused').length,
    interrupted: transcriptions.filter(j => j.status === 'interrupted').length,
    error: transcriptions.filter(j => j.status === 'error').length,
    cancelled: transcriptions.filter(j => j.status === 'cancelled').length,
  };

  const handleRefresh = () => {
    if (activeTab === 'all') {
      loadNewHistory();
      loadStats();
    } else if (activeTab === 'tts') {
      loadTtsHistory();
    } else {
      loadTranscriptionHistory();
    }
  };

  return (
    <div className="space-y-8 animate-slide-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gradient flex items-center gap-3">
            <History className="w-7 h-7" />
            History
          </h1>
          <p className="mt-2 text-foreground-secondary">
            {activeTab === 'transcriptions' && statusFilter !== 'all'
              ? `${filteredTranscriptions.length} of ${total} entries`
              : `${total} ${total === 1 ? 'entry' : 'entries'} saved`}
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleRefresh}
            className="btn btn-secondary"
          >
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
            Refresh
          </button>
          {activeTab === 'all' && newHistory.length > 0 && !selectionMode && (
            <button
              onClick={() => setSelectionMode(true)}
              className="btn btn-secondary"
            >
              <CheckSquare className="w-4 h-4" />
              Select
            </button>
          )}
          {activeTab !== 'all' && ((activeTab === 'tts' && ttsHistory.length > 0) || (activeTab === 'transcriptions' && transcriptions.length > 0)) && (
            <button
              onClick={handleClearAll}
              className="btn btn-danger"
            >
              <Trash2 className="w-4 h-4" />
              Clear All
            </button>
          )}
        </div>
      </div>

      {/* Selection Action Bar */}
      {selectionMode && (
        <div className="flex items-center justify-between p-4 bg-surface-2 rounded-xl border border-border">
          <div className="flex items-center gap-4">
            <button
              onClick={handleSelectAll}
              className="flex items-center gap-2 text-sm hover:text-accent-primary transition-colors"
            >
              {selectedIds.size === newHistory.length ? (
                <>
                  <CheckSquare className="w-4 h-4" />
                  Deselect All
                </>
              ) : (
                <>
                  <Square className="w-4 h-4" />
                  Select All ({newHistory.length})
                </>
              )}
            </button>
            <span className="text-sm text-foreground-muted">
              {selectedIds.size} selected
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleBulkDelete}
              disabled={selectedIds.size === 0 || bulkDeleting}
              className={cn(
                'btn btn-danger',
                (selectedIds.size === 0 || bulkDeleting) && 'opacity-50 cursor-not-allowed'
              )}
            >
              {bulkDeleting ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              Delete ({selectedIds.size})
            </button>
            <button
              onClick={handleExitSelectionMode}
              className="btn btn-secondary"
            >
              <X className="w-4 h-4" />
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Stats Summary */}
      {activeTab === 'all' && stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="card p-4 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-accent-primary/10">
                <LayoutGrid className="w-5 h-5 text-accent-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.total_entries}</p>
                <p className="text-xs text-foreground-muted">Total Entries</p>
              </div>
            </div>
          </div>
          <div className="card p-4 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10">
                <Clock className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{formatDuration(stats.total_duration_seconds)}</p>
                <p className="text-xs text-foreground-muted">Total Duration</p>
              </div>
            </div>
          </div>
          <div className="card p-4 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <FileText className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{(stats.total_characters ?? 0).toLocaleString()}</p>
                <p className="text-xs text-foreground-muted">Characters</p>
              </div>
            </div>
          </div>
          <div className="card p-4 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <BarChart3 className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{formatBytes(stats.storage_bytes)}</p>
                <p className="text-xs text-foreground-muted">Storage Used</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border pb-2">
        <button
          onClick={() => setActiveTab('all')}
          className={cn(
            "px-4 py-2 rounded-t-lg flex items-center gap-2 transition-colors",
            activeTab === 'all'
              ? "bg-surface-2 text-foreground"
              : "text-foreground-secondary hover:text-foreground"
          )}
        >
          <LayoutGrid className="w-4 h-4" />
          All Modules
          {newHistoryTotal > 0 && (
            <span className="text-xs bg-accent-primary/20 text-accent-primary px-2 py-0.5 rounded-full">{newHistoryTotal}</span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('tts')}
          className={cn(
            "px-4 py-2 rounded-t-lg flex items-center gap-2 transition-colors",
            activeTab === 'tts'
              ? "bg-surface-2 text-foreground"
              : "text-foreground-secondary hover:text-foreground"
          )}
        >
          <Mic className="w-4 h-4" />
          TTS (Legacy)
          {ttsTotal > 0 && (
            <span className="text-xs bg-surface-3 px-2 py-0.5 rounded-full">{ttsTotal}</span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('transcriptions')}
          className={cn(
            "px-4 py-2 rounded-t-lg flex items-center gap-2 transition-colors",
            activeTab === 'transcriptions'
              ? "bg-surface-2 text-foreground"
              : "text-foreground-secondary hover:text-foreground"
          )}
        >
          <FileText className="w-4 h-4" />
          Transcriptions
          {transcriptionsTotal > 0 && (
            <span className="text-xs bg-surface-3 px-2 py-0.5 rounded-full">{transcriptionsTotal}</span>
          )}
        </button>
      </div>

      {/* New History Filters */}
      {activeTab === 'all' && (
        <HistoryFilters
          filters={filters}
          onFiltersChange={handleFiltersChange}
        />
      )}

      {/* Transcription Filters */}
      {activeTab === 'transcriptions' && transcriptions.length > 0 && (
        <div className="flex flex-wrap items-center gap-4">
          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-foreground-muted" />
            <div className="flex flex-wrap gap-1">
              {(['all', 'completed', 'paused', 'interrupted', 'error'] as TranscriptionStatus[]).map((status) => (
                statusCounts[status] > 0 && (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    className={cn(
                      "px-3 py-1 text-xs rounded-full transition-colors",
                      statusFilter === status
                        ? status === 'completed' ? "bg-emerald-500/30 text-emerald-300"
                          : status === 'paused' ? "bg-blue-500/30 text-blue-300"
                          : status === 'interrupted' ? "bg-amber-500/30 text-amber-300"
                          : status === 'error' ? "bg-red-500/30 text-red-300"
                          : "bg-surface-3 text-foreground"
                        : "bg-surface-2 text-foreground-secondary hover:bg-surface-3"
                    )}
                  >
                    {status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
                    <span className="ml-1 opacity-70">({statusCounts[status]})</span>
                  </button>
                )
              ))}
            </div>
          </div>

          {/* Sort Order */}
          <button
            onClick={() => setSortOrder(sortOrder === 'newest' ? 'oldest' : 'newest')}
            className="flex items-center gap-1 px-3 py-1 text-xs rounded-full bg-surface-2 text-foreground-secondary hover:bg-surface-3 transition-colors"
          >
            {sortOrder === 'newest' ? (
              <>
                <ArrowDown className="w-3 h-3" />
                Newest first
              </>
            ) : (
              <>
                <ArrowUp className="w-3 h-3" />
                Oldest first
              </>
            )}
          </button>
        </div>
      )}

      {/* Loading State with Skeletons */}
      {loading && activeTab === 'all' && (
        <div className="space-y-4">
          {!stats && <SkeletonStatsGrid />}
          <SkeletonHistoryEntry />
          <SkeletonHistoryEntry />
          <SkeletonHistoryEntry />
          <SkeletonHistoryEntry />
        </div>
      )}
      
      {loading && activeTab !== 'all' && (
        <div className="flex items-center justify-center min-h-[200px]">
          <RefreshCw className="w-8 h-8 animate-spin text-foreground-muted" />
        </div>
      )}

      {/* New History (All Modules) */}
      {activeTab === 'all' && !loading && (
        newHistory.length === 0 ? (
          <div className="text-center py-16 text-foreground-muted">
            <LayoutGrid className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p className="text-lg">No history yet</p>
            <p className="text-sm mt-2">Your activity across all modules will appear here</p>
          </div>
        ) : (
          <div className="space-y-4">
            {newHistory.map((entry) => (
              <HistoryEntryCard
                key={entry.id}
                entry={entry}
                onUpdate={handleEntryUpdate}
                onDelete={handleEntryDelete}
                onRegenerate={handleRegenerate}
                selectionMode={selectionMode}
                selected={selectedIds.has(entry.id)}
                onSelectionChange={handleSelectionChange}
              />
            ))}

            {/* Load More */}
            {newHistory.length < newHistoryTotal && (
              <div className="text-center pt-4">
                <button
                  onClick={() => setFilters(prev => ({ ...prev, limit: (prev.limit || 50) + 50 }))}
                  className="btn btn-secondary"
                >
                  Load More ({newHistory.length} of {newHistoryTotal})
                </button>
              </div>
            )}
          </div>
        )
      )}

      {/* TTS History (Legacy) */}
      {activeTab === 'tts' && !loading && (
        ttsHistory.length === 0 ? (
          <div className="text-center py-16 text-foreground-muted">
            <FileAudio className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p className="text-lg">No TTS history yet</p>
            <p className="text-sm mt-2">Your TTS generations will show up here</p>
          </div>
        ) : (
          <div className="space-y-4">
            {ttsHistory.map((entry) => (
              <div
                key={entry.id}
                className={cn(
                  'card p-4 rounded-xl flex items-start gap-4',
                  !entry.file_exists && 'opacity-60'
                )}
              >
                <button
                  onClick={() => handlePlay(entry)}
                  disabled={!entry.file_exists}
                  className={cn(
                    'w-12 h-12 rounded-full flex items-center justify-center transition-colors flex-shrink-0',
                    entry.file_exists
                      ? playingId === entry.id
                        ? 'bg-emerald-500 text-white'
                        : 'bg-surface-2 text-foreground hover:bg-surface-3'
                      : 'bg-surface-1 text-foreground-muted cursor-not-allowed'
                  )}
                >
                  {playingId === entry.id ? (
                    <Pause className="w-5 h-5" />
                  ) : (
                    <Play className="w-5 h-5 ml-0.5" />
                  )}
                </button>

                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground line-clamp-2">{entry.text}</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    <span className="badge">{(entry.model && modelNames[entry.model]) || entry.model || 'unknown'}</span>
                    <span className="badge">{(entry.language || 'en').toUpperCase()}</span>
                    <span className="badge">T:{entry.temperature ?? '-'} E:{entry.exaggeration ?? '-'}</span>
                    {entry.billing?.value != null && (
                      <span
                        className="badge badge-info"
                        title={entry.billing.details ?? undefined}
                      >
                        {formatBillingValue(entry.billing.value)} {entry.billing.unit ?? 'units'}
                      </span>
                    )}
                    {entry.file_size_mb && (
                      <span className="badge">{entry.file_size_mb} MB</span>
                    )}
                    {!entry.file_exists && (
                      <span className="badge badge-error">File missing</span>
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-3 text-right">
                  <div className="text-xs text-foreground-muted flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatDate(entry.created_at)}
                  </div>
                  <div className="flex gap-2">
                    {entry.file_exists && (
                      <button
                        onClick={() => handleDownloadTts(entry)}
                        className="btn btn-secondary btn-icon"
                        title="Download"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteTts(entry)}
                      className="btn btn-ghost btn-icon"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* Transcription History */}
      {activeTab === 'transcriptions' && !loading && (
        transcriptions.length === 0 ? (
          <div className="text-center py-16 text-foreground-muted">
            <FileText className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p className="text-lg">No transcriptions yet</p>
            <p className="text-sm mt-2">Your transcriptions will show up here</p>
          </div>
        ) : filteredTranscriptions.length === 0 ? (
          <div className="text-center py-16 text-foreground-muted">
            <Filter className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p className="text-lg">No transcriptions match this filter</p>
            <button
              onClick={() => setStatusFilter('all')}
              className="mt-4 btn btn-secondary"
            >
              Show all
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredTranscriptions.map((job) => (
              <div
                key={job.job_id}
                className="card p-4 rounded-xl cursor-pointer hover:border-border-hover transition-colors"
                onClick={() => router.push(`/transcribe?job=${job.job_id}`)}
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-full bg-surface-2 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 text-foreground-muted" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {job.filename || 'Untitled'}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      <span className={cn(
                        "badge",
                        job.status === 'completed' && "badge-success",
                        job.status === 'error' && "badge-error",
                        job.status === 'interrupted' && "bg-amber-500/20 text-amber-400",
                        job.status === 'paused' && "bg-blue-500/20 text-blue-400",
                        job.status === 'cancelled' && "bg-gray-500/20 text-gray-400"
                      )}>
                        {job.status}
                      </span>
                      {(job.status === 'interrupted' || job.status === 'paused') && job.segments?.length && job.segments.length > 0 && (
                        <span className="badge bg-blue-500/10 text-blue-300">
                          {job.segments.length} segments saved
                        </span>
                      )}
                      {(job.status === 'interrupted' || job.status === 'paused') && (job.progress ?? 0) > 0 && (
                        <span className="badge bg-blue-500/10 text-blue-300">
                          {(job.progress ?? 0).toFixed(0)}% done
                        </span>
                      )}
                      {(job.speakers_detected ?? 0) > 0 && (
                        <span className="badge flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {job.speakers_detected} speakers
                        </span>
                      )}
                      {(job.total_duration ?? 0) > 0 && (
                        <span className="badge">
                          {formatDuration(job.total_duration)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-3 text-right">
                    <div className="text-xs text-foreground-muted flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDate(job.created_at)}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteTranscription(job);
                      }}
                      className="btn btn-ghost btn-icon"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
