"use client";

import { useState, useEffect, useRef, useCallback, RefObject } from "react";
import {
  Search,
  Download,
  RotateCcw,
  Users,
  Edit3,
  Check,
  X,
  Clock,
  Save,
  RefreshCw,
} from "lucide-react";
import { TranscriptSegment, DiarizationMethod } from "@/lib/api";
import { cn } from "@/lib/utils";

// Speaker colors for inline highlighting
const SPEAKER_COLORS = [
  "text-blue-400",
  "text-green-400",
  "text-purple-400",
  "text-orange-400",
  "text-pink-400",
  "text-cyan-400",
  "text-yellow-400",
  "text-red-400",
];

function formatTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

interface TranscriptEditorProps {
  segments: TranscriptSegment[];
  speakersDetected: number;
  diarizationMethod?: DiarizationMethod;
  canRediarize?: boolean;
  rediarizeLabel?: string;
  rediarizeTitle?: string;
  audioRef: RefObject<HTMLAudioElement | null>;
  onSegmentsChange: (segments: TranscriptSegment[]) => void;
  onExport: () => void;
  onReset: () => void;
  onRediarize?: () => void;
  isRediarizing?: boolean;
  title?: string;
  createdAt?: string;
}

export default function TranscriptEditor({
  segments,
  speakersDetected,
  diarizationMethod,
  canRediarize = true,
  rediarizeLabel,
  rediarizeTitle,
  audioRef,
  onSegmentsChange,
  onExport,
  onReset,
  onRediarize,
  isRediarizing,
  title,
  createdAt,
}: TranscriptEditorProps) {
  const [showTimestamps, setShowTimestamps] = useState(false);
  const [showSpeakers, setShowSpeakers] = useState(speakersDetected > 0);
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [hoveredSegmentId, setHoveredSegmentId] = useState<string | null>(null);
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Track audio time
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    return () => audio.removeEventListener("timeupdate", handleTimeUpdate);
  }, [audioRef]);

  // Find active segment based on current time
  useEffect(() => {
    if (!segments?.length) return;
    const active = segments.find(
      (seg) => currentTime >= seg.start_time && currentTime < seg.end_time
    );
    if (active) {
      setActiveSegmentId(active.id);
    }
  }, [currentTime, segments]);

  // Update showSpeakers when speakersDetected changes
  useEffect(() => {
    setShowSpeakers(speakersDetected > 0);
  }, [speakersDetected]);

  const handleSeek = useCallback((time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      audioRef.current.play();
    }
  }, [audioRef]);

  // Generate title from first segment if not provided
  const displayTitle = title || (segments?.[0]?.text?.slice(0, 60) + (segments?.[0]?.text?.length > 60 ? "..." : "")) || "Transcription";

  // Convert segments to editable text
  const getFullText = useCallback(() => {
    if (!segments?.length) return "";
    return segments.map(seg => {
      let line = "";
      if (showSpeakers && speakersDetected > 0) {
        line += `[${seg.speaker}] `;
      }
      if (showTimestamps) {
        line += `[${formatTimestamp(seg.start_time)}] `;
      }
      line += seg.text;
      return line;
    }).join("\n\n");
  }, [segments, showSpeakers, showTimestamps, speakersDetected]);

  // Enter edit mode
  const startEditing = () => {
    setEditedText(getFullText());
    setIsEditing(true);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  // Save edited text (simple: update each segment's text)
  const saveEdits = () => {
    if (!segments?.length) {
      setIsEditing(false);
      return;
    }
    // For now, just save as a single merged text update
    // A more sophisticated approach would parse and match segments
    const lines = editedText.split(/\n\n+/).filter(l => l.trim());
    const updated = segments.map((seg, i) => {
      if (i < lines.length) {
        let text = lines[i];
        // Remove speaker/timestamp prefixes if present
        text = text.replace(/^\[Speaker \d+\]\s*/i, "");
        text = text.replace(/^\[\d+:\d+(?::\d+)?\]\s*/, "");
        return { ...seg, text: text.trim() };
      }
      return seg;
    });
    onSegmentsChange(updated);
    setIsEditing(false);
  };

  // Group consecutive segments by speaker for natural flow
  const safeSegments = segments || [];
  const groupedSegments = safeSegments.reduce((groups, seg, i) => {
    const prevSeg = safeSegments[i - 1];
    if (prevSeg && prevSeg.speaker_id === seg.speaker_id) {
      // Same speaker, add to current group
      const lastGroup = groups[groups.length - 1];
      lastGroup.segments.push(seg);
    } else {
      // New speaker, start new group
      groups.push({
        speakerId: seg.speaker_id ?? 0,
        speaker: seg.speaker ?? "Speaker 1",
        segments: [seg],
      });
    }
    return groups;
  }, [] as { speakerId: number; speaker: string; segments: TranscriptSegment[] }[]);

  return (
    <div className="glass-card">
      {/* Header with title and date */}
      <div className="p-6 border-b border-white/10">
        <h2 className="text-2xl font-semibold text-foreground leading-tight select-text cursor-text">
          {displayTitle}
        </h2>
        {createdAt && (
          <p className="text-sm text-foreground-muted mt-1 select-text cursor-text">
            {new Date(createdAt).toLocaleDateString("es-ES", {
              day: "numeric",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        )}

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-4 mt-4">
          {/* Toggle timestamps */}
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input
              type="checkbox"
              checked={showTimestamps}
              onChange={(e) => setShowTimestamps(e.target.checked)}
              className="w-4 h-4 rounded border-white/20 bg-white/5 text-emerald-500 focus:ring-emerald-500"
            />
            <Clock className="w-4 h-4 text-foreground-muted" />
            <span className="text-foreground-muted">Timestamps</span>
          </label>

          {/* Toggle speakers */}
          {speakersDetected > 0 && (
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={showSpeakers}
                onChange={(e) => setShowSpeakers(e.target.checked)}
                className="w-4 h-4 rounded border-white/20 bg-white/5 text-emerald-500 focus:ring-emerald-500"
              />
              <Users className="w-4 h-4 text-foreground-muted" />
              <span className="text-foreground-muted">
                {speakersDetected === 1 ? "1 speaker" : `${speakersDetected} speakers`}
              </span>
              {diarizationMethod && diarizationMethod !== 'none' && (
                <span className={cn(
                  "px-1.5 py-0.5 text-xs rounded",
                  diarizationMethod === 'pyannote'
                    ? "bg-emerald-500/20 text-emerald-400"
                    : "bg-amber-500/20 text-amber-400"
                )}>
                  {diarizationMethod === 'pyannote' ? 'AI' : 'Basic'}
                </span>
              )}
            </label>
          )}

          {/* Search */}
          <div className="relative flex-1 min-w-[150px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="input w-full pl-9 py-1.5 text-sm"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 ml-auto">
            {!isEditing ? (
              <>
                <button onClick={startEditing} className="btn btn-secondary text-sm py-1.5">
                  <Edit3 className="w-4 h-4" />
                  Edit
                </button>
                {onRediarize && (
                  <button
                    onClick={onRediarize}
                    disabled={isRediarizing || !canRediarize}
                    className={cn(
                      "btn btn-secondary text-sm py-1.5",
                      !canRediarize && "opacity-50 cursor-not-allowed"
                    )}
                    title={
                      !canRediarize
                        ? (rediarizeTitle || "Speaker diarization is not available.")
                        : (rediarizeTitle || "Re-run speaker detection")
                    }
                  >
                    <RefreshCw className={cn("w-4 h-4", isRediarizing && "animate-spin")} />
                    {isRediarizing ? "Diarizing..." : (rediarizeLabel || "Re-diarize")}
                  </button>
                )}
                <button onClick={onExport} className="btn btn-primary text-sm py-1.5">
                  <Download className="w-4 h-4" />
                  Export
                </button>
                <button onClick={onReset} className="btn btn-secondary text-sm py-1.5">
                  <RotateCcw className="w-4 h-4" />
                  New
                </button>
              </>
            ) : (
              <>
                <button onClick={saveEdits} className="btn btn-primary text-sm py-1.5">
                  <Save className="w-4 h-4" />
                  Save
                </button>
                <button onClick={() => setIsEditing(false)} className="btn btn-secondary text-sm py-1.5">
                  <X className="w-4 h-4" />
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 max-h-[600px] overflow-y-auto">
        {isEditing ? (
          <textarea
            ref={textareaRef}
            value={editedText}
            onChange={(e) => setEditedText(e.target.value)}
            className="input w-full min-h-[400px] font-serif text-base leading-relaxed resize-y"
          />
        ) : (
          <div className="prose prose-invert max-w-none">
            {groupedSegments.map((group, groupIndex) => (
              <div key={groupIndex} className="mb-4">
                {/* Speaker label (if showing speakers) */}
                {showSpeakers && speakersDetected > 0 && (
                  <span className={cn(
                    "text-sm font-medium mr-2",
                    SPEAKER_COLORS[group.speakerId % SPEAKER_COLORS.length]
                  )}>
                    {group.speaker}:
                  </span>
                )}

                {/* Segments as flowing text */}
                <span className="text-foreground leading-relaxed">
                  {group.segments.map((seg, segIndex) => {
                    const isActive = seg.id === activeSegmentId;
                    const isHovered = seg.id === hoveredSegmentId;
                    const matchesSearch = searchQuery &&
                      seg.text.toLowerCase().includes(searchQuery.toLowerCase());

                    return (
                      <span key={seg.id}>
                        {/* Timestamp (if showing) */}
                        {showTimestamps && (
                          <span
                            className="text-xs text-foreground-muted font-mono mr-1 cursor-pointer hover:text-emerald-400"
                            onClick={() => handleSeek(seg.start_time)}
                          >
                            [{formatTimestamp(seg.start_time)}]
                          </span>
                        )}

                        {/* Text with hover highlight */}
                        <span
                          className={cn(
                            "cursor-pointer transition-all duration-150 rounded px-0.5 -mx-0.5",
                            isActive && "bg-emerald-500/20 text-emerald-200",
                            isHovered && !isActive && "bg-white/10",
                            matchesSearch && "bg-yellow-500/30 text-yellow-200"
                          )}
                          onMouseEnter={() => setHoveredSegmentId(seg.id)}
                          onMouseLeave={() => setHoveredSegmentId(null)}
                          onClick={() => handleSeek(seg.start_time)}
                        >
                          {seg.text}
                        </span>

                        {/* Space between segments in same group */}
                        {segIndex < group.segments.length - 1 && " "}
                      </span>
                    );
                  })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
