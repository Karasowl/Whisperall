"use client";

import { useState, type FormEvent } from "react";
import { X, Link2, Globe, CloudDownload } from "lucide-react";

interface ImportLinkModalProps {
  onImport: (url: string) => void;
  onClose: () => void;
  isImporting?: boolean;
  error?: string | null;
}

const PROVIDER_LABELS = [
  "YouTube",
  "Dropbox",
  "Google Drive",
  "Facebook",
  "Vimeo",
  "X",
  "Direct URL",
];

export default function ImportLinkModal({
  onImport,
  onClose,
  isImporting = false,
  error,
}: ImportLinkModalProps) {
  const [value, setValue] = useState("");

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }
    onImport(trimmed);
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div
        className="glass-card w-full max-w-lg animate-in fade-in zoom-in-95 duration-200"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            <Link2 className="w-5 h-5 text-emerald-400" />
            Import from Link
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-slate-400 hover:text-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="text-sm text-slate-400">
            Paste a public media link. We will download the audio and start transcription.
          </div>

          <div className="flex flex-wrap gap-2">
            {PROVIDER_LABELS.map((label) => (
              <span
                key={label}
                className="px-2 py-1 rounded-full text-[11px] bg-white/10 text-slate-400"
              >
                {label}
              </span>
            ))}
          </div>

          <label className="block text-sm font-medium text-slate-400">
            Media Link
          </label>
          <div className="relative">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="url"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="input w-full pl-9"
              autoFocus
            />
          </div>

          {error && (
            <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
              {error}
            </div>
          )}

          <div className="text-xs text-slate-400 flex items-center gap-2">
            <CloudDownload className="w-4 h-4 text-emerald-400" />
            The link must be publicly accessible.
          </div>

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
              disabled={isImporting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!value.trim() || isImporting}
            >
              {isImporting ? "Importing..." : "Import"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
