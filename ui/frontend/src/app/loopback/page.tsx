'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Radio,
  Square,
  Play,
  Pause,
  MonitorSpeaker,
  Languages,
  Users,
  Trash2,
  ExternalLink,
  AlertCircle,
  Loader2,
  Settings2,
} from 'lucide-react';
import {
  getLoopbackStatus,
  getLoopbackDevices,
  getLoopbackWebSocketUrl,
  getProviderSelection,
  setProvider,
  LoopbackDevice,
  LoopbackStatus,
} from '@/lib/api';
import { cn } from '@/lib/utils';
import { SelectMenu } from '@/components/SelectMenu';
import { Toggle } from '@/components/Toggle';

interface TranscriptEntry {
  id: string;
  text: string;
  speaker_id: number;
  speaker_name: string;
  timestamp: number;
  language: string;
  translation?: string;
}

interface Speaker {
  id: number;
  name: string;
  segment_count: number;
}

const speakerColors = [
  'text-sky-400',
  'text-violet-400',
  'text-pink-400',
  'text-emerald-400',
  'text-orange-400',
  'text-red-400',
  'text-cyan-400',
  'text-yellow-400',
];

const languageOptions = [
  { value: 'auto', label: 'Auto Detect' },
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'it', label: 'Italian' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'zh', label: 'Chinese' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'ru', label: 'Russian' },
  { value: 'ar', label: 'Arabic' },
];

export default function LoopbackPage() {
  const [status, setStatus] = useState<LoopbackStatus | null>(null);
  const [devices, setDevices] = useState<LoopbackDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<number | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);
  const [speakers, setSpeakers] = useState<Speaker[]>([]);

  // Settings
  const [enableDiarization, setEnableDiarization] = useState(true);
  const [enableTranslation, setEnableTranslation] = useState(false);
  const [sourceLanguage, setSourceLanguage] = useState('auto');
  const [targetLanguage, setTargetLanguage] = useState('en');
  const [showOverlay, setShowOverlay] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const transcriptsEndRef = useRef<HTMLDivElement>(null);
  const nextIdRef = useRef(1);
  const didLoadSettingsRef = useRef(false);

  // Load initial status, devices, and saved settings
  useEffect(() => {
    async function loadData() {
      try {
        const [statusRes, devicesRes, selection] = await Promise.all([
          getLoopbackStatus(),
          getLoopbackDevices(),
          getProviderSelection('loopback').catch(() => null),
        ]);
        setStatus(statusRes);
        setDevices(devicesRes.devices);

        // Load saved settings if available
        if (selection?.config) {
          if (selection.config.source_language) {
            setSourceLanguage(selection.config.source_language);
          }
          if (selection.config.target_language) {
            setTargetLanguage(selection.config.target_language);
          }
          if (selection.config.enable_diarization !== undefined) {
            setEnableDiarization(selection.config.enable_diarization);
          }
          if (selection.config.enable_translation !== undefined) {
            setEnableTranslation(selection.config.enable_translation);
          }
        }

        // Select default device
        const defaultDevice = devicesRes.devices.find(d => d.is_default && d.is_loopback)
          || devicesRes.devices.find(d => d.is_loopback)
          || devicesRes.devices.find(d => d.is_default)
          || devicesRes.devices[0];
        if (defaultDevice) {
          setSelectedDevice(defaultDevice.index);
        }

        // Don't show error initially - auto-install will happen when user clicks Start
        if (!statusRes.available && statusRes.message.includes('failed')) {
          setError(statusRes.message);
        }
      } catch (err) {
        // Don't show error on initial load - might just need to install
        console.error('Failed to load loopback status:', err);
      } finally {
        didLoadSettingsRef.current = true;
      }
    }
    loadData();
  }, []);

  // Persist settings
  useEffect(() => {
    if (!didLoadSettingsRef.current) return;
    setProvider('loopback', 'default', {
      source_language: sourceLanguage,
      target_language: targetLanguage,
      enable_diarization: enableDiarization,
      enable_translation: enableTranslation,
    }).catch((err) => {
      console.error('Failed to save loopback settings:', err);
    });
  }, [sourceLanguage, targetLanguage, enableDiarization, enableTranslation]);

  // Auto-scroll transcripts
  useEffect(() => {
    transcriptsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcripts]);

  // WebSocket connection
  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setIsConnecting(true);
    setError(null);

    const ws = new WebSocket(getLoopbackWebSocketUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnecting(false);
      console.log('[Loopback] WebSocket connected');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('[Loopback] Message:', data);

        switch (data.type) {
          case 'state':
            setIsCapturing(data.state === 'capturing');
            setIsPaused(data.state === 'paused');
            if (data.error) {
              setError(data.error);
            }
            break;

          case 'transcript':
            const entry: TranscriptEntry = {
              id: `t-${nextIdRef.current++}`,
              text: data.text,
              speaker_id: data.speaker_id || 0,
              speaker_name: data.speaker_name || 'Speaker',
              timestamp: data.timestamp || Date.now() / 1000,
              language: data.language || 'en',
            };
            setTranscripts(prev => [...prev, entry]);

            // Send to overlay if enabled
            if (showOverlay && window.electronAPI?.sendSubtitleMessage) {
              window.electronAPI.sendSubtitleMessage({
                type: 'transcript',
                text: data.text,
                speaker_id: data.speaker_id,
                speaker_name: data.speaker_name,
              });
            }
            break;

          case 'translation':
            // Update the last transcript with translation
            setTranscripts(prev => {
              const updated = [...prev];
              if (updated.length > 0) {
                updated[updated.length - 1] = {
                  ...updated[updated.length - 1],
                  translation: data.translated,
                };
              }
              return updated;
            });

            // Send translation to overlay
            if (showOverlay && window.electronAPI?.sendSubtitleMessage) {
              window.electronAPI.sendSubtitleMessage({
                type: 'translation',
                translated: data.translated,
              });
            }
            break;

          case 'speakers':
            setSpeakers(data.speakers || []);
            break;

          case 'error':
            setError(data.message);
            break;
        }
      } catch (err) {
        console.error('[Loopback] Parse error:', err);
      }
    };

    ws.onerror = (err) => {
      console.error('[Loopback] WebSocket error:', err);
      setError('WebSocket connection error');
      setIsConnecting(false);
    };

    ws.onclose = () => {
      console.log('[Loopback] WebSocket closed');
      setIsConnecting(false);
      setIsCapturing(false);
      setIsPaused(false);
    };
  }, [showOverlay]);

  // Disconnect WebSocket
  const disconnectWebSocket = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  // Send WebSocket message
  const sendMessage = useCallback((action: string, params: Record<string, any> = {}) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action, ...params }));
    }
  }, []);

  // Start capturing
  const handleStart = useCallback(() => {
    connectWebSocket();
    // Wait for connection then start
    const checkAndStart = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        clearInterval(checkAndStart);
        sendMessage('start', {
          device_index: selectedDevice,
          enable_diarization: enableDiarization,
          enable_translation: enableTranslation,
          source_language: sourceLanguage,
          target_language: targetLanguage,
        });

        // Show overlay if enabled
        if (showOverlay && window.electronAPI?.showSubtitleOverlay) {
          window.electronAPI.showSubtitleOverlay();
          window.electronAPI.sendSubtitleMessage?.({ type: 'state', state: 'capturing' });
        }
      }
    }, 100);

    // Cleanup after 5 seconds if not connected
    setTimeout(() => clearInterval(checkAndStart), 5000);
  }, [selectedDevice, enableDiarization, enableTranslation, sourceLanguage, targetLanguage, showOverlay, connectWebSocket, sendMessage]);

  // Stop capturing
  const handleStop = useCallback(() => {
    sendMessage('stop');
    if (window.electronAPI?.sendSubtitleMessage) {
      window.electronAPI.sendSubtitleMessage({ type: 'state', state: 'stopped' });
    }
    disconnectWebSocket();
  }, [sendMessage, disconnectWebSocket]);

  // Pause/Resume
  const handlePauseResume = useCallback(() => {
    if (isPaused) {
      sendMessage('resume');
      if (window.electronAPI?.sendSubtitleMessage) {
        window.electronAPI.sendSubtitleMessage({ type: 'state', state: 'capturing' });
      }
    } else {
      sendMessage('pause');
      if (window.electronAPI?.sendSubtitleMessage) {
        window.electronAPI.sendSubtitleMessage({ type: 'state', state: 'paused' });
      }
    }
  }, [isPaused, sendMessage]);

  // Toggle overlay
  const handleToggleOverlay = useCallback(() => {
    const newState = !showOverlay;
    setShowOverlay(newState);
    if (newState) {
      window.electronAPI?.showSubtitleOverlay?.();
      if (isCapturing) {
        window.electronAPI?.sendSubtitleMessage?.({ type: 'state', state: 'capturing' });
      }
    } else {
      window.electronAPI?.hideSubtitleOverlay?.();
    }
  }, [showOverlay, isCapturing]);

  // Clear transcripts
  const handleClear = useCallback(() => {
    setTranscripts([]);
    window.electronAPI?.clearSubtitles?.();
  }, []);

  // Update translation settings
  useEffect(() => {
    if (isCapturing && wsRef.current?.readyState === WebSocket.OPEN) {
      sendMessage('set_translation', {
        enabled: enableTranslation,
        target_language: targetLanguage,
      });
    }
  }, [enableTranslation, targetLanguage, isCapturing, sendMessage]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnectWebSocket();
      window.electronAPI?.hideSubtitleOverlay?.();
    };
  }, [disconnectWebSocket]);

  const getSpeakerColor = (speakerId: number) => {
    return speakerColors[(speakerId - 1) % speakerColors.length] || speakerColors[0];
  };

  const deviceOptions = devices.map(d => ({
    value: d.index.toString(),
    label: `${d.name}${d.is_loopback ? ' (Loopback)' : ''}${d.is_default ? ' - Default' : ''}`,
  }));

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 p-6 border-b border-border">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-semibold text-foreground flex items-center gap-3">
              <Radio className="w-7 h-7 text-accent-primary" />
              Live Transcription
            </h1>
            <p className="text-foreground-secondary mt-1">
              Capture and transcribe system audio in real-time
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleToggleOverlay}
              className={cn(
                'btn-secondary gap-2',
                showOverlay && 'bg-accent-primary/20 border-accent-primary/30'
              )}
            >
              <ExternalLink className="w-4 h-4" />
              {showOverlay ? 'Hide Overlay' : 'Show Overlay'}
            </button>

            <button
              onClick={() => setShowSettings(!showSettings)}
              className={cn(
                'btn-secondary gap-2',
                showSettings && 'bg-surface-3'
              )}
            >
              <Settings2 className="w-4 h-4" />
              Settings
            </button>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-error/10 text-error mb-4">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Settings panel */}
        {showSettings && (
          <div className="p-4 rounded-lg bg-surface-1 border border-border mb-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {/* Device selection */}
              <div>
                <label className="block text-sm text-foreground-secondary mb-2">
                  Audio Device
                </label>
                <SelectMenu
                  value={selectedDevice?.toString() || ''}
                  onChange={(v) => setSelectedDevice(v ? parseInt(v) : null)}
                  options={deviceOptions}
                  placeholder="Select device..."
                  disabled={isCapturing}
                />
              </div>

              {/* Source language */}
              <div>
                <label className="block text-sm text-foreground-secondary mb-2">
                  Source Language
                </label>
                <SelectMenu
                  value={sourceLanguage}
                  onChange={setSourceLanguage}
                  options={languageOptions}
                  disabled={isCapturing}
                />
              </div>
            </div>

            <div className="flex items-center gap-6">
              <Toggle
                enabled={enableDiarization}
                onChange={setEnableDiarization}
                label="Speaker Detection"
                disabled={isCapturing}
              />

              <Toggle
                enabled={enableTranslation}
                onChange={setEnableTranslation}
                label="Translation"
              />

              {enableTranslation && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-foreground-secondary">to</span>
                  <SelectMenu
                    value={targetLanguage}
                    onChange={setTargetLanguage}
                    options={languageOptions.filter(l => l.value !== 'auto')}
                    className="w-32"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Control buttons */}
        <div className="flex items-center gap-3">
          {!isCapturing ? (
            <button
              onClick={handleStart}
              disabled={isConnecting}
              className="btn-primary gap-2"
            >
              {isConnecting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Radio className="w-4 h-4" />
              )}
              {isConnecting ? 'Starting...' : 'Start Capture'}
            </button>
          ) : (
            <>
              <button
                onClick={handleStop}
                className="btn-error gap-2"
              >
                <Square className="w-4 h-4" />
                Stop
              </button>

              <button
                onClick={handlePauseResume}
                className="btn-secondary gap-2"
              >
                {isPaused ? (
                  <>
                    <Play className="w-4 h-4" />
                    Resume
                  </>
                ) : (
                  <>
                    <Pause className="w-4 h-4" />
                    Pause
                  </>
                )}
              </button>
            </>
          )}

          {transcripts.length > 0 && (
            <button
              onClick={handleClear}
              className="btn-secondary gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Clear
            </button>
          )}

          {/* Status indicator */}
          <div className="ml-auto flex items-center gap-2">
            {isCapturing && (
              <div className="flex items-center gap-2">
                <div className={cn(
                  'w-2 h-2 rounded-full',
                  isPaused ? 'bg-amber-500' : 'bg-emerald-500 animate-pulse'
                )} />
                <span className="text-sm text-foreground-secondary">
                  {isPaused ? 'Paused' : 'Capturing'}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Transcripts area */}
      <div className="flex-1 overflow-hidden flex">
        {/* Main transcript panel */}
        <div className="flex-1 overflow-y-auto p-6">
          {transcripts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-foreground-muted">
              <MonitorSpeaker className="w-16 h-16 mb-4 opacity-50" />
              <p className="text-lg mb-2">No transcripts yet</p>
              <p className="text-sm">
                {isCapturing
                  ? 'Listening for audio...'
                  : 'Click "Start Capture" to begin transcribing system audio'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {transcripts.map((entry) => (
                <div
                  key={entry.id}
                  className="p-4 rounded-lg bg-surface-1 border border-border"
                >
                  <div className="flex items-start gap-3">
                    <span className={cn(
                      'px-2 py-1 rounded text-xs font-medium bg-surface-2',
                      getSpeakerColor(entry.speaker_id)
                    )}>
                      {entry.speaker_name}
                    </span>
                    <div className="flex-1">
                      <p className="text-foreground">{entry.text}</p>
                      {entry.translation && (
                        <p className="text-foreground-secondary text-sm mt-2 pt-2 border-t border-border italic">
                          {entry.translation}
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-foreground-muted">
                      {entry.language.toUpperCase()}
                    </span>
                  </div>
                </div>
              ))}
              <div ref={transcriptsEndRef} />
            </div>
          )}
        </div>

        {/* Speakers sidebar */}
        {enableDiarization && speakers.length > 0 && (
          <div className="w-64 border-l border-border p-4 overflow-y-auto">
            <h3 className="text-sm font-medium text-foreground-secondary mb-3 flex items-center gap-2">
              <Users className="w-4 h-4" />
              Speakers ({speakers.length})
            </h3>
            <div className="space-y-2">
              {speakers.map((speaker) => (
                <div
                  key={speaker.id}
                  className="p-3 rounded-lg bg-surface-1 border border-border"
                >
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      'w-3 h-3 rounded-full',
                      getSpeakerColor(speaker.id).replace('text-', 'bg-')
                    )} />
                    <span className="text-sm font-medium">{speaker.name}</span>
                  </div>
                  <span className="text-xs text-foreground-muted">
                    {speaker.segment_count} segments
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
