'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Clipboard, Loader2, Play } from 'lucide-react';
import { readerSpeak, getAudioUrl } from '@/lib/api';
import { AudioPlayer } from '@/components/AudioPlayer';
import { SelectMenu } from '@/components/SelectMenu';

const languageOptions = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'it', label: 'Italian' },
  { value: 'pt', label: 'Portuguese' },
];

export default function ReaderPage() {
  const [text, setText] = useState('');
  const [language, setLanguage] = useState('en');
  const [speed, setSpeed] = useState(1.0);
  const [autoRead, setAutoRead] = useState(false);
  const [skipUrls, setSkipUrls] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<{ url: string; filename: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lastClipboardRef = useRef('');

  const handleSpeak = useCallback(async (overrideText?: string) => {
    const input = (overrideText ?? text).trim();
    if (!input) return;
    if (skipUrls && /https?:\/\//i.test(input)) {
      return;
    }

    setError(null);
    setIsLoading(true);
    try {
      const res = await readerSpeak({
        text: input,
        language,
        speed,
      });
      setResult({
        url: getAudioUrl(res.output_url),
        filename: res.filename,
      });
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to synthesize audio');
    } finally {
      setIsLoading(false);
    }
  }, [language, skipUrls, speed, text]);

  const readClipboard = useCallback(async () => {
    try {
      const clip = window.electronAPI?.readClipboard
        ? await window.electronAPI.readClipboard()
        : await navigator.clipboard.readText();
      if (clip) {
        setText(clip);
        await handleSpeak(clip);
      }
    } catch (err: any) {
      setError(err.message || 'Clipboard access failed');
    }
  }, [handleSpeak]);

  useEffect(() => {
    if (!autoRead) return;
    const interval = setInterval(async () => {
      try {
        const clip = window.electronAPI?.readClipboard
          ? await window.electronAPI.readClipboard()
          : await navigator.clipboard.readText();
        if (!clip || clip === lastClipboardRef.current) {
          return;
        }
        lastClipboardRef.current = clip;
        setText(clip);
        await handleSpeak(clip);
      } catch {
        // Ignore clipboard polling errors
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [autoRead, handleSpeak]);

  useEffect(() => {
    const handler = (event: Event) => {
      const action = (event as CustomEvent).detail;
      if (action === 'read-clipboard') {
        readClipboard();
      }
    };
    window.addEventListener('hotkey-action', handler as EventListener);
    return () => window.removeEventListener('hotkey-action', handler as EventListener);
  }, [readClipboard]);

  return (
    <div className="space-y-8 animate-slide-up">
      <div className="space-y-2">
        <h1 className="text-4xl font-bold text-gradient">Real-time Reader</h1>
        <p className="text-foreground-muted">
          Read clipboard text or paste content and generate audio instantly.
        </p>
      </div>

      {error && (
        <div className="glass-card p-4 border-red-500/30 bg-red-500/10 text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <div className="glass-card p-6 space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Reader Controls</h2>

            <SelectMenu
              label="Language"
              value={language}
              options={languageOptions}
              onChange={setLanguage}
            />

            <label className="label mt-4">Speed ({speed.toFixed(1)}x)</label>
            <input
              type="range"
              min={0.5}
              max={2.5}
              step={0.1}
              value={speed}
              onChange={(e) => setSpeed(parseFloat(e.target.value))}
              className="slider"
            />

            <div className="flex items-center justify-between mt-4">
              <span className="text-sm text-foreground-muted">Auto-read clipboard</span>
              <button
                onClick={() => setAutoRead(!autoRead)}
                className={`w-12 h-7 rounded-full transition-colors relative ${autoRead ? 'bg-emerald-500' : 'bg-white/10'}`}
              >
                <span
                  className={`w-5 h-5 bg-white rounded-full absolute top-1 transition-transform ${autoRead ? 'translate-x-6' : 'translate-x-1'}`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground-muted">Skip URLs</span>
              <button
                onClick={() => setSkipUrls(!skipUrls)}
                className={`w-12 h-7 rounded-full transition-colors relative ${skipUrls ? 'bg-emerald-500' : 'bg-white/10'}`}
              >
                <span
                  className={`w-5 h-5 bg-white rounded-full absolute top-1 transition-transform ${skipUrls ? 'translate-x-6' : 'translate-x-1'}`}
                />
              </button>
            </div>

            <div className="flex flex-col gap-2 mt-4">
              <button onClick={() => handleSpeak()} className="btn btn-primary">
                <Play className="w-4 h-4" />
                Read Text
              </button>
              <button onClick={readClipboard} className="btn btn-secondary">
                <Clipboard className="w-4 h-4" />
                Read Clipboard
              </button>
            </div>

            {isLoading && (
              <div className="flex items-center gap-2 text-foreground-muted">
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating audio...
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div className="glass-card p-6 space-y-4">
            <label className="label">Text to Read</label>
            <textarea
              className="input textarea min-h-[220px]"
              placeholder="Paste text here or use Read Clipboard"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>

          {result && (
            <div className="glass-card p-6">
              <AudioPlayer src={result.url} filename={result.filename} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
