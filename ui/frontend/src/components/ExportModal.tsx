"use client";

import { useState } from "react";
import { X, FileText, Subtitles, Download } from "lucide-react";

interface ExportModalProps {
  onExport: (format: "txt" | "srt" | "vtt", includeSpeakers: boolean, includeTimestamps: boolean) => void;
  onClose: () => void;
}

const EXPORT_FORMATS = [
  {
    id: "txt" as const,
    name: "Plain Text",
    description: "Simple text file with transcript",
    icon: FileText,
    extension: ".txt",
  },
  {
    id: "srt" as const,
    name: "SRT Subtitles",
    description: "SubRip format for video players",
    icon: Subtitles,
    extension: ".srt",
  },
  {
    id: "vtt" as const,
    name: "WebVTT",
    description: "Web Video Text Tracks format",
    icon: Subtitles,
    extension: ".vtt",
  },
];

export default function ExportModal({ onExport, onClose }: ExportModalProps) {
  const [selectedFormat, setSelectedFormat] = useState<"txt" | "srt" | "vtt">("txt");
  const [includeSpeakers, setIncludeSpeakers] = useState(true);
  const [includeTimestamps, setIncludeTimestamps] = useState(true);

  const handleExport = () => {
    onExport(selectedFormat, includeSpeakers, includeTimestamps);
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div
        className="glass-card w-full max-w-md animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Download className="w-5 h-5 text-emerald-400" />
            Export Transcript
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-foreground-muted hover:text-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-6">
          {/* Format selection */}
          <div>
            <label className="block text-sm font-medium text-foreground-muted mb-3">
              Export Format
            </label>
            <div className="space-y-2">
              {EXPORT_FORMATS.map((format) => {
                const Icon = format.icon;
                return (
                  <label
                    key={format.id}
                    className={`
                      flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all
                      ${selectedFormat === format.id
                        ? "bg-emerald-500/10 border-emerald-400/40"
                        : "bg-white/5 border-white/10 hover:border-white/20"}
                    `}
                  >
                    <input
                      type="radio"
                      name="format"
                      value={format.id}
                      checked={selectedFormat === format.id}
                      onChange={() => setSelectedFormat(format.id)}
                      className="sr-only"
                    />
                    <div
                      className={`
                        w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0
                        ${selectedFormat === format.id ? "bg-emerald-500/20" : "bg-white/10"}
                      `}
                    >
                      <Icon
                        className={`w-5 h-5 ${
                          selectedFormat === format.id ? "text-emerald-400" : "text-foreground-muted"
                        }`}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        className={`font-medium ${
                          selectedFormat === format.id ? "text-emerald-300" : "text-foreground"
                        }`}
                      >
                        {format.name}
                        <span className="text-foreground-muted text-sm ml-2">{format.extension}</span>
                      </p>
                      <p className="text-sm text-foreground-muted">{format.description}</p>
                    </div>
                    <div
                      className={`
                        w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center
                        ${selectedFormat === format.id
                          ? "border-emerald-500 bg-emerald-500"
                          : "border-white/30"}
                      `}
                    >
                      {selectedFormat === format.id && (
                        <div className="w-2 h-2 rounded-full bg-white" />
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Options */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-foreground-muted mb-2">
              Options
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={includeSpeakers}
                onChange={(e) => setIncludeSpeakers(e.target.checked)}
                className="w-5 h-5 rounded border-white/20 bg-white/5 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0"
              />
              <div>
                <span className="text-foreground">Include speaker labels</span>
                <p className="text-xs text-foreground-muted">Add speaker identification to each segment</p>
              </div>
            </label>

            {selectedFormat === "txt" && (
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeTimestamps}
                  onChange={(e) => setIncludeTimestamps(e.target.checked)}
                  className="w-5 h-5 rounded border-white/20 bg-white/5 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0"
                />
                <div>
                  <span className="text-foreground">Include timestamps</span>
                  <p className="text-xs text-foreground-muted">Add time markers before each segment</p>
                </div>
              </label>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-white/10">
          <button
            onClick={onClose}
            className="btn btn-secondary"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            className="btn btn-primary"
          >
            <Download className="w-4 h-4" />
            Download {selectedFormat.toUpperCase()}
          </button>
        </div>
      </div>
    </div>
  );
}
