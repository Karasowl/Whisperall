'use client';

import { useState, useEffect } from 'react';
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
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
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
} from '@/lib/api';
import { cn } from '@/lib/utils';

type TabType = 'tts' | 'transcriptions';
type TranscriptionStatus = 'all' | 'completed' | 'paused' | 'interrupted' | 'error' | 'cancelled';
type SortOrder = 'newest' | 'oldest';

export default function HistoryPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>('tts');

  // TTS History state
  const [ttsHistory, setTtsHistory] = useState<HistoryEntry[]>([]);
  const [ttsLoading, setTtsLoading] = useState(true);
  const [ttsTotal, setTtsTotal] = useState(0);

  // Transcription History state
  const [transcriptions, setTranscriptions] = useState<TranscriptionJob[]>([]);
  const [transcriptionsLoading, setTranscriptionsLoading] = useState(true);
  const [transcriptionsTotal, setTranscriptionsTotal] = useState(0);

  const [error, setError] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);

  // Filter state
  const [statusFilter, setStatusFilter] = useState<TranscriptionStatus>('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');

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
      setError('Failed to play audio');
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
    } catch {
      setError('Delete failed');
    }
  };

  const handleDeleteTranscription = async (job: TranscriptionJob) => {
    if (!confirm('Delete this transcription?')) return;
    try {
      await deleteTranscriptionJob(job.job_id);
      await loadTranscriptionHistory();
    } catch {
      setError('Delete failed');
    }
  };

  const handleClearAll = async () => {
    if (activeTab === 'tts') {
      if (!confirm('Delete all TTS history entries?')) return;
      if (!confirm('Also delete audio files to free disk space?')) {
        try {
          await clearHistory(false);
          await loadTtsHistory();
        } catch {
          setError('Clear failed');
        }
        return;
      }

      try {
        const result = await clearHistory(true);
        await loadTtsHistory();
        alert(`History cleared. ${(result.freed_bytes / (1024 * 1024)).toFixed(2)} MB freed.`);
      } catch {
        setError('Clear failed');
      }
    } else if (activeTab === 'transcriptions') {
      if (!confirm('Delete all transcriptions? This will also delete any temporary media files.')) return;

      try {
        const result = await clearAllTranscriptions();
        await loadTranscriptionHistory();
        alert(`${result.deleted_count} transcriptions deleted. ${(result.freed_bytes / (1024 * 1024)).toFixed(2)} MB freed.`);
      } catch {
        setError('Clear failed');
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

  const formatDuration = (seconds: number) => {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatBillingValue = (value?: number | null) =>
    value != null ? new Intl.NumberFormat().format(value) : null;

  const modelNames: Record<string, string> = {
    original: 'Original',
    turbo: 'Turbo',
    multilingual: 'Multilingual',
  };

  const loading = activeTab === 'tts' ? ttsLoading : transcriptionsLoading;
  const total = activeTab === 'tts' ? ttsTotal : transcriptionsTotal;

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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <RefreshCw className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-slide-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gradient flex items-center gap-3">
            <History className="w-7 h-7" />
            History
          </h1>
          <p className="mt-2 text-slate-400">
            {activeTab === 'transcriptions' && statusFilter !== 'all'
              ? `${filteredTranscriptions.length} of ${total} entries`
              : `${total} ${total === 1 ? 'entry' : 'entries'} saved`}
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => activeTab === 'tts' ? loadTtsHistory() : loadTranscriptionHistory()}
            className="btn btn-secondary"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          {((activeTab === 'tts' && ttsHistory.length > 0) || (activeTab === 'transcriptions' && transcriptions.length > 0)) && (
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

      {/* Tabs */}
      <div className="flex gap-2 border-b border-white/10 pb-2">
        <button
          onClick={() => setActiveTab('tts')}
          className={cn(
            "px-4 py-2 rounded-t-lg flex items-center gap-2 transition-colors",
            activeTab === 'tts'
              ? "bg-white/10 text-slate-100"
              : "text-slate-400 hover:text-slate-100"
          )}
        >
          <Mic className="w-4 h-4" />
          TTS Generations
          {ttsTotal > 0 && (
            <span className="text-xs bg-white/10 px-2 py-0.5 rounded-full">{ttsTotal}</span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('transcriptions')}
          className={cn(
            "px-4 py-2 rounded-t-lg flex items-center gap-2 transition-colors",
            activeTab === 'transcriptions'
              ? "bg-white/10 text-slate-100"
              : "text-slate-400 hover:text-slate-100"
          )}
        >
          <FileText className="w-4 h-4" />
          Transcriptions
          {transcriptionsTotal > 0 && (
            <span className="text-xs bg-white/10 px-2 py-0.5 rounded-full">{transcriptionsTotal}</span>
          )}
        </button>
      </div>

      {/* Transcription Filters */}
      {activeTab === 'transcriptions' && transcriptions.length > 0 && (
        <div className="flex flex-wrap items-center gap-4">
          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
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
                          : "bg-white/20 text-slate-100"
                        : "bg-white/5 text-slate-400 hover:bg-white/10"
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
            className="flex items-center gap-1 px-3 py-1 text-xs rounded-full bg-white/5 text-slate-400 hover:bg-white/10 transition-colors"
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

      {error && (
        <div className="glass-card p-4 border-red-500/30 bg-red-500/10 text-red-300 flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )}

      {/* TTS History */}
      {activeTab === 'tts' && (
        ttsHistory.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
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
                  'glass-card p-4 flex items-start gap-4',
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
                        : 'bg-white/10 text-slate-100 hover:bg-white/20'
                      : 'bg-white/5 text-slate-400 cursor-not-allowed'
                  )}
                >
                  {playingId === entry.id ? (
                    <Pause className="w-5 h-5" />
                  ) : (
                    <Play className="w-5 h-5 ml-0.5" />
                  )}
                </button>

                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-100 line-clamp-2">{entry.text}</p>
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
                  <div className="text-xs text-slate-400 flex items-center gap-1">
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
      {activeTab === 'transcriptions' && (
        transcriptions.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <FileText className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p className="text-lg">No transcriptions yet</p>
            <p className="text-sm mt-2">Your transcriptions will show up here</p>
          </div>
        ) : filteredTranscriptions.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
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
                className="glass-card p-4 cursor-pointer hover:border-white/20 transition-colors"
                onClick={() => router.push(`/transcribe?job=${job.job_id}`)}
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 text-slate-400" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-100">
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
                      {/* Show partial segments info for paused/interrupted jobs */}
                      {(job.status === 'interrupted' || job.status === 'paused') && job.segments?.length > 0 && (
                        <span className="badge bg-blue-500/10 text-blue-300">
                          {job.segments.length} segments saved
                        </span>
                      )}
                      {(job.status === 'interrupted' || job.status === 'paused') && job.progress > 0 && (
                        <span className="badge bg-blue-500/10 text-blue-300">
                          {job.progress.toFixed(0)}% done
                        </span>
                      )}
                      {job.speakers_detected > 0 && (
                        <span className="badge flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {job.speakers_detected} speakers
                        </span>
                      )}
                      {job.total_duration > 0 && (
                        <span className="badge">
                          {formatDuration(job.total_duration)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-3 text-right">
                    <div className="text-xs text-slate-400 flex items-center gap-1">
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
