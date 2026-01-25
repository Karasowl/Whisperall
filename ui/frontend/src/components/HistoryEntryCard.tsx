'use client';

import { useState } from 'react';
import {
  Play,
  Pause,
  Download,
  Star,
  Trash2,
  Clock,
  Type,
  ChevronDown,
  ChevronUp,
  Mic,
  MessageSquare,
  FileAudio,
  Globe,
  Sparkles,
  Music,
  Video,
  Wand2,
  Languages,
  AudioLines,
  MoreVertical,
  ExternalLink,
  Copy,
  Check,
  Square,
  CheckSquare,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  NewHistoryEntry,
  toggleHistoryFavorite,
  deleteNewHistoryEntry,
  getHistoryFileDownloadUrl,
  api,
} from '@/lib/api';

interface HistoryEntryCardProps {
  entry: NewHistoryEntry;
  onUpdate?: (entry: NewHistoryEntry) => void;
  onDelete?: (entryId: string) => void;
  onRegenerate?: (entry: NewHistoryEntry) => void;
  selectionMode?: boolean;
  selected?: boolean;
  onSelectionChange?: (entryId: string, selected: boolean) => void;
  className?: string;
}

// Module display configuration
const MODULE_CONFIG: Record<string, { label: string; icon: typeof Mic; color: string; bgColor: string }> = {
  'tts': { label: 'TTS', icon: MessageSquare, color: 'text-emerald-400', bgColor: 'bg-emerald-500/10' },
  'stt': { label: 'STT', icon: Mic, color: 'text-blue-400', bgColor: 'bg-blue-500/10' },
  'transcribe': { label: 'Transcribe', icon: FileAudio, color: 'text-purple-400', bgColor: 'bg-purple-500/10' },
  'loopback': { label: 'Live', icon: Mic, color: 'text-red-400', bgColor: 'bg-red-500/10' },
  'voice-changer': { label: 'Voice Changer', icon: Wand2, color: 'text-pink-400', bgColor: 'bg-pink-500/10' },
  'voice-isolator': { label: 'Isolator', icon: AudioLines, color: 'text-cyan-400', bgColor: 'bg-cyan-500/10' },
  'dubbing': { label: 'Dubbing', icon: Globe, color: 'text-amber-400', bgColor: 'bg-amber-500/10' },
  'sfx': { label: 'SFX', icon: Sparkles, color: 'text-orange-400', bgColor: 'bg-orange-500/10' },
  'music': { label: 'Music', icon: Music, color: 'text-rose-400', bgColor: 'bg-rose-500/10' },
  'stems': { label: 'Stems', icon: AudioLines, color: 'text-indigo-400', bgColor: 'bg-indigo-500/10' },
  'ai-edit': { label: 'AI Edit', icon: Wand2, color: 'text-violet-400', bgColor: 'bg-violet-500/10' },
  'translate': { label: 'Translate', icon: Languages, color: 'text-teal-400', bgColor: 'bg-teal-500/10' },
  'reader': { label: 'Reader', icon: FileAudio, color: 'text-sky-400', bgColor: 'bg-sky-500/10' },
};

export function HistoryEntryCard({
  entry,
  onUpdate,
  onDelete,
  onRegenerate,
  selectionMode = false,
  selected = false,
  onSelectionChange,
  className,
}: HistoryEntryCardProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  const moduleConfig = MODULE_CONFIG[entry.module] || MODULE_CONFIG['tts'];

  // Check if this entry type supports regeneration
  const canRegenerate = ['tts', 'stt', 'voice-changer', 'voice-isolator', 'sfx', 'music', 'translate', 'ai-edit', 'reader'].includes(entry.module);
  const ModuleIcon = moduleConfig.icon;

  // Format date
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  // Format duration
  const formatDuration = (seconds: number) => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Get display text
  const getDisplayText = () => {
    if (entry.input_text) return entry.input_text;
    if (entry.output_text) return entry.output_text;
    if (entry.metadata?.text) return entry.metadata.text;
    if (entry.metadata?.prompt) return entry.metadata.prompt;
    if (entry.metadata?.lyrics) return entry.metadata.lyrics;
    return null;
  };

  const displayText = getDisplayText();
  const truncatedText = displayText && displayText.length > 150
    ? displayText.substring(0, 150) + '...'
    : displayText;

  // Audio playback
  const handlePlayPause = async () => {
    if (!entry.output_audio_path) return;

    if (isPlaying && audio) {
      audio.pause();
      setIsPlaying(false);
      return;
    }

    if (audio) {
      audio.play();
      setIsPlaying(true);
      return;
    }

    // Create new audio element
    const downloadUrl = getHistoryFileDownloadUrl(entry.id, 'output_audio');
    const newAudio = new Audio(downloadUrl);
    newAudio.onended = () => setIsPlaying(false);
    newAudio.onerror = () => {
      console.error('Audio playback failed');
      setIsPlaying(false);
    };
    setAudio(newAudio);
    newAudio.play();
    setIsPlaying(true);
  };

  // Favorite toggle
  const handleFavorite = async () => {
    setLoading(true);
    try {
      const result = await toggleHistoryFavorite(entry.id);
      if (onUpdate) {
        onUpdate({ ...entry, favorite: result.favorite });
      }
    } catch (err) {
      console.error('Failed to toggle favorite:', err);
    } finally {
      setLoading(false);
    }
  };

  // Delete entry
  const handleDelete = async () => {
    if (!confirm('Delete this history entry?')) return;
    setLoading(true);
    try {
      await deleteNewHistoryEntry(entry.id);
      if (onDelete) {
        onDelete(entry.id);
      }
    } catch (err) {
      console.error('Failed to delete entry:', err);
    } finally {
      setLoading(false);
    }
  };

  // Copy text
  const handleCopyText = () => {
    if (!displayText) return;
    navigator.clipboard.writeText(displayText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Download
  const handleDownload = (type: 'input_audio' | 'output_audio' | 'input_video' | 'output_video') => {
    const url = getHistoryFileDownloadUrl(entry.id, type);
    window.open(url, '_blank');
  };

  // Get metadata display
  const getMetadataItems = () => {
    const items: { label: string; value: string }[] = [];

    if (entry.provider) {
      items.push({ label: 'Provider', value: entry.provider });
    }
    if (entry.model) {
      items.push({ label: 'Model', value: entry.model });
    }
    if (entry.metadata?.voice_name) {
      items.push({ label: 'Voice', value: entry.metadata.voice_name });
    }
    if (entry.metadata?.language) {
      items.push({ label: 'Language', value: entry.metadata.language });
    }
    if (entry.metadata?.target_language) {
      items.push({ label: 'Target', value: entry.metadata.target_language });
    }
    if (entry.characters_count) {
      items.push({ label: 'Characters', value: entry.characters_count.toLocaleString() });
    }
    if (entry.duration_seconds) {
      items.push({ label: 'Duration', value: formatDuration(entry.duration_seconds) });
    }

    return items;
  };

  return (
    <div className={cn(
      'card p-4 rounded-xl transition-all',
      entry.favorite && 'ring-1 ring-amber-500/30',
      selected && 'ring-2 ring-accent-primary bg-accent-primary/5',
      className
    )}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {/* Selection Checkbox */}
          {selectionMode && (
            <button
              onClick={() => onSelectionChange?.(entry.id, !selected)}
              className="p-1 rounded hover:bg-surface-2 transition-colors shrink-0"
            >
              {selected ? (
                <CheckSquare className="w-5 h-5 text-accent-primary" />
              ) : (
                <Square className="w-5 h-5 text-foreground-muted" />
              )}
            </button>
          )}

          {/* Module Icon */}
          <div className={cn('p-2 rounded-lg shrink-0', moduleConfig.bgColor)}>
            <ModuleIcon className={cn('w-5 h-5', moduleConfig.color)} />
          </div>

          {/* Title & Meta */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className={cn(
                'text-xs font-medium px-2 py-0.5 rounded-full',
                moduleConfig.bgColor,
                moduleConfig.color
              )}>
                {moduleConfig.label}
              </span>
              {entry.favorite && (
                <Star className="w-3.5 h-3.5 text-amber-400 fill-current" />
              )}
              <span className="text-xs text-foreground-muted">
                {formatDate(entry.created_at)}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-foreground-secondary truncate">
                {entry.provider}
                {entry.model && ` / ${entry.model}`}
              </span>
              {entry.duration_seconds && (
                <span className="flex items-center gap-1 text-xs text-foreground-muted">
                  <Clock className="w-3 h-3" />
                  {formatDuration(entry.duration_seconds)}
                </span>
              )}
              {entry.characters_count && (
                <span className="flex items-center gap-1 text-xs text-foreground-muted">
                  <Type className="w-3 h-3" />
                  {entry.characters_count}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {entry.output_audio_path && (
            <button
              onClick={handlePlayPause}
              className={cn(
                'p-2 rounded-lg transition-colors',
                isPlaying
                  ? 'bg-accent-primary text-white'
                  : 'hover:bg-surface-2 text-foreground-secondary'
              )}
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
          )}

          <button
            onClick={handleFavorite}
            disabled={loading}
            className={cn(
              'p-2 rounded-lg transition-colors',
              entry.favorite
                ? 'text-amber-400 hover:bg-amber-500/10'
                : 'hover:bg-surface-2 text-foreground-secondary'
            )}
            title={entry.favorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            <Star className={cn('w-4 h-4', entry.favorite && 'fill-current')} />
          </button>

          {/* More actions */}
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-2 rounded-lg hover:bg-surface-2 text-foreground-secondary transition-colors"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {showMenu && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowMenu(false)}
                />
                <div className="absolute right-0 top-full mt-1 w-48 bg-surface-1 border border-border rounded-lg shadow-xl z-50 py-1">
                  {entry.output_audio_path && (
                    <button
                      onClick={() => { handleDownload('output_audio'); setShowMenu(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-surface-2 transition-colors text-left"
                    >
                      <Download className="w-4 h-4" />
                      Download Audio
                    </button>
                  )}
                  {entry.output_video_path && (
                    <button
                      onClick={() => { handleDownload('output_video'); setShowMenu(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-surface-2 transition-colors text-left"
                    >
                      <Video className="w-4 h-4" />
                      Download Video
                    </button>
                  )}
                  {displayText && (
                    <button
                      onClick={() => { handleCopyText(); setShowMenu(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-surface-2 transition-colors text-left"
                    >
                      {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                      Copy Text
                    </button>
                  )}
                  {canRegenerate && onRegenerate && (
                    <button
                      onClick={() => { onRegenerate(entry); setShowMenu(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-surface-2 transition-colors text-left"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Regenerate
                    </button>
                  )}
                  <div className="border-t border-border my-1" />
                  <button
                    onClick={() => { handleDelete(); setShowMenu(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-error/10 text-error transition-colors text-left"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Content Preview */}
      {displayText && (
        <div className="mt-3">
          <p className="text-sm text-foreground-secondary line-clamp-2">
            {expanded ? displayText : truncatedText}
          </p>
          {displayText.length > 150 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-xs text-accent-primary hover:underline mt-1"
            >
              {expanded ? (
                <>
                  <ChevronUp className="w-3 h-3" />
                  Show less
                </>
              ) : (
                <>
                  <ChevronDown className="w-3 h-3" />
                  Show more
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* Metadata Tags */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-border">
          <div className="flex flex-wrap gap-2">
            {getMetadataItems().map((item, idx) => (
              <span
                key={idx}
                className="text-xs px-2 py-1 rounded-full bg-surface-2 text-foreground-secondary"
              >
                <span className="text-foreground-muted">{item.label}:</span> {item.value}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* User Tags & Notes */}
      {(entry.tags?.length || entry.notes) && (
        <div className="mt-3 pt-3 border-t border-border">
          {entry.tags && entry.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {entry.tags.map((tag, idx) => (
                <span
                  key={idx}
                  className="text-xs px-2 py-0.5 rounded-full bg-accent-primary/10 text-accent-primary"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
          {entry.notes && (
            <p className="text-xs text-foreground-muted italic">
              {entry.notes}
            </p>
          )}
        </div>
      )}

      {/* Error Message */}
      {entry.status === 'failed' && entry.error_message && (
        <div className="mt-3 p-2 rounded-lg bg-error/10 border border-error/30">
          <p className="text-xs text-error">{entry.error_message}</p>
        </div>
      )}
    </div>
  );
}

export default HistoryEntryCard;
