import { useTranscriptionStore } from '../stores/transcription';
import { api } from '../lib/api';
import { useState } from 'react';

export function EditorPage() {
  const { segments, fullText } = useTranscriptionStore();
  const [editedText, setEditedText] = useState('');
  const [processing, setProcessing] = useState(false);

  const text = editedText || fullText;

  const handleAiEdit = async (mode: string) => {
    if (!text) return;
    setProcessing(true);
    try {
      const res = await api.aiEdit.edit({ text, mode });
      setEditedText(res.text);
    } catch {
      // TODO: toast
    } finally {
      setProcessing(false);
    }
  };

  if (!fullText && segments.length === 0) {
    return (
      <div className="page">
        <h2>Editor</h2>
        <p className="empty-state">
          No transcript loaded. Go to <strong>Transcribe</strong> to process a file first.
        </p>
      </div>
    );
  }

  return (
    <div className="page">
      <h2>Editor</h2>

      <div className="editor-toolbar">
        <button
          className="btn-ghost"
          onClick={() => handleAiEdit('clean_fillers')}
          disabled={processing}
        >
          Clean fillers
        </button>
        <button
          className="btn-ghost"
          onClick={() => handleAiEdit('formal')}
          disabled={processing}
        >
          Formalize
        </button>
        <button
          className="btn-ghost"
          onClick={() => handleAiEdit('summarize')}
          disabled={processing}
        >
          Summarize
        </button>
        {processing && <span className="status-text">Processing...</span>}
      </div>

      {segments.length > 0 ? (
        <div className="segments-view">
          {segments.map((seg, i) => (
            <div key={i} className="segment">
              {seg.speaker && <span className="segment-speaker">{seg.speaker}</span>}
              <span className="segment-time">
                {formatTime(seg.start)}–{formatTime(seg.end)}
              </span>
              <p className="segment-text">{seg.text}</p>
            </div>
          ))}
        </div>
      ) : (
        <textarea
          className="text-output full"
          value={text}
          onChange={(e) => setEditedText(e.target.value)}
          rows={20}
        />
      )}
    </div>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
