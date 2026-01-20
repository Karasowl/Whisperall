'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Mic, Square, Loader2, Copy, RefreshCw } from 'lucide-react';
import {
  startStt,
  stopStt,
  cancelStt,
  partialStt,
  installSttEngine,
  ServiceProviderInfo,
  getProviderSelection,
  getAllModels,
  setProvider,
} from '@/lib/api';
import { formatDuration } from '@/lib/utils';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { SelectMenu } from '@/components/SelectMenu';
import { UnifiedProviderSelector } from '@/components/UnifiedProviderSelector';
import { insertTextAtCursor, setLastSttTranscript } from '@/lib/sttHelper';
import { playActionSound } from '@/lib/actionSounds';

const languageOptions = [
  { value: 'auto', label: 'Auto' },
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'it', label: 'Italian' },
  { value: 'pt', label: 'Portuguese' },
];

export default function DictatePage() {
  const [isPreparing, setIsPreparing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [language, setLanguage] = useState('auto');
  const [prompt, setPrompt] = useState('');
  const [provider, setProviderState] = useState('faster-whisper');
  const [providerModel, setProviderModel] = useState('');
  const [providerConfig, setProviderConfig] = useState<Record<string, any>>({});
  const [providerInfo, setProviderInfo] = useState<ServiceProviderInfo | null>(null);
  const [sttModelInstalled, setSttModelInstalled] = useState<Record<string, boolean>>({});
  const [duration, setDuration] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [rawTranscript, setRawTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installOutput, setInstallOutput] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const streamActiveRef = useRef(false);
  const streamSendingRef = useRef(false);
  const mimeTypeRef = useRef('audio/webm');
  const lastPartialAtRef = useRef(0);
  const disablePartialRef = useRef(false);
  const didLoadRef = useRef(false);

  useEffect(() => {
    return () => {
      streamActiveRef.current = false;
      disablePartialRef.current = true;
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  useEffect(() => {
    async function loadProviderSelection() {
      try {
        const selection = await getProviderSelection('stt');
        setProviderState(selection.selected || 'faster-whisper');
        setProviderConfig(selection.config || {});
        setProviderModel(selection.config?.model || '');
      } catch {
        // Keep defaults if settings are missing.
      } finally {
        didLoadRef.current = true;
      }
    }
    loadProviderSelection();
  }, []);

  useEffect(() => {
    let active = true;
    getAllModels('stt')
      .then(({ models }) => {
        if (!active) return;
        const installedMap: Record<string, boolean> = {};
        models.forEach((model) => {
          installedMap[model.id] = model.installed;
        });
        setSttModelInstalled(installedMap);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!providerInfo) return;
    const models = providerInfo.models || [];
    if (!models.length) return;
    const modelIds = models.map((model) => model.id);
    const hasInstalled = Object.keys(sttModelInstalled).length > 0;
    const isLocal = providerInfo.type === 'local';

    const isCurrentValid =
      providerModel &&
      modelIds.includes(providerModel) &&
      (!isLocal || !hasInstalled || sttModelInstalled[providerModel]);

    if (isCurrentValid) return;

    const normalizeModelId = (value: string) => {
      if (providerInfo.id === 'faster-whisper') {
        if (value === 'distil-large-v3') return 'faster-distil-whisper-large-v3';
        if (value.startsWith('faster-whisper-') || value.startsWith('faster-distil-whisper')) {
          return value;
        }
        return `faster-whisper-${value}`;
      }
      return value;
    };

    const candidate = providerConfig.model || providerInfo.default_model || modelIds[0];
    let nextModel = normalizeModelId(candidate);
    if (!modelIds.includes(nextModel)) {
      nextModel = modelIds[0];
    }

    if (isLocal && hasInstalled && !sttModelInstalled[nextModel]) {
      const installedModel = models.find((model) => sttModelInstalled[model.id]);
      if (installedModel) {
        nextModel = installedModel.id;
      }
    }

    if (nextModel && nextModel !== providerModel) {
      setProviderModel(nextModel);
    }
  }, [providerInfo, providerModel, providerConfig.model, sttModelInstalled]);

  const modelOptions = useMemo(() => {
    if (!providerInfo?.models?.length) return [];
    const shouldCheckInstall = providerInfo.type === 'local';

    return providerInfo.models.map((model) => {
      if (!shouldCheckInstall) {
        return {
          value: model.id,
          label: model.name,
          description: model.description,
        };
      }

      const installed = sttModelInstalled[model.id];
      return {
        value: model.id,
        label: model.name,
        description: installed
          ? model.description
          : `${model.description || 'Requires download'} - Install in Models`,
        disabled: !installed,
      };
    });
  }, [providerInfo, sttModelInstalled]);

  const resolvedModelValue =
    providerModel || providerInfo?.default_model || providerInfo?.models?.[0]?.id || '';

  useEffect(() => {
    if (!didLoadRef.current) return;
    if (!provider) return;
    const config = {
      ...providerConfig,
      model: providerModel || providerInfo?.default_model,
    };
    setProviderConfig(config);
    setProvider('stt', provider, config).catch(() => {});
  }, [provider, providerModel]);

  const updateProvider = (nextProvider: string) => {
    setProviderState(nextProvider);
  };

  const handleSttError = useCallback((err: any, fallback: string) => {
    const message = err.response?.data?.detail || err.message || fallback;
    const normalized = typeof message === 'string' ? message.toLowerCase() : '';
    if (normalized.includes('invalid data')) {
      disablePartialRef.current = true;
      setError('Realtime preview unavailable. Final transcript will appear after you stop.');
      return;
    }
    if (normalized.includes('faster-whisper')) {
      disablePartialRef.current = true;
      setShowInstallPrompt(true);
    }
    setError(message);
  }, []);

  const sendPartial = useCallback(async (activeSessionId: string, activeLanguage: string, activePrompt: string) => {
    if (streamSendingRef.current || !streamActiveRef.current || disablePartialRef.current) return;
    const now = Date.now();
    if (now - lastPartialAtRef.current < 2000) return;
    lastPartialAtRef.current = now;
    streamSendingRef.current = true;

    try {
      if (chunksRef.current.length < 2) {
        return;
      }
      const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
      const result = await partialStt(activeSessionId, blob, activeLanguage, activePrompt || undefined);
      if (result.partial_text) {
        setTranscript(result.partial_text);
      }
    } catch (err: any) {
      handleSttError(err, 'Realtime transcription failed');
    } finally {
      streamSendingRef.current = false;
    }
  }, [handleSttError]);

  const startRecording = useCallback(async () => {
    setError(null);
    setIsPreparing(true);
    setTranscript('');
    setRawTranscript('');

    if (providerInfo?.type === 'local' && !providerInfo.is_available) {
      setShowInstallPrompt(true);
      setIsPreparing(false);
      return;
    }
    if (providerInfo?.type === 'api' && !providerInfo.is_available) {
      setError('Configure the API key in Settings before using this provider.');
      setIsPreparing(false);
      return;
    }

    try {
      const session = await startStt(language, prompt || undefined);
      setSessionId(session.session_id);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      streamActiveRef.current = true;
      disablePartialRef.current = false;
      mimeTypeRef.current = mimeType;
      lastPartialAtRef.current = 0;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
          if (streamActiveRef.current) {
            sendPartial(session.session_id, language, prompt);
          }
        }
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunksRef.current, { type: mimeType });

        if (!session.session_id) {
          setError('STT session was not created');
          return;
        }

        setIsTranscribing(true);
        streamActiveRef.current = false;
        try {
          const result = await stopStt(session.session_id, blob, language, prompt || undefined);
          setTranscript(result.text);
          setRawTranscript(result.raw_text);
          setLastSttTranscript(result.text);
          insertTextAtCursor(result.text);
        } catch (err: any) {
          handleSttError(err, 'Transcription failed');
        } finally {
          setIsTranscribing(false);
          setSessionId(null);
          playActionSound('complete');
        }
      };

      recorder.start(1000);
      playActionSound('start');
      setIsRecording(true);
      setIsPreparing(false);
      setDuration(0);

      timerRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      setIsPreparing(false);
      handleSttError(err, 'Could not access microphone');
    }
  }, [language, prompt, sendPartial, handleSttError]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      streamActiveRef.current = false;
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [isRecording]);

  const cancelRecording = async () => {
    if (sessionId) {
      await cancelStt(sessionId);
    }
    setSessionId(null);
    setIsRecording(false);
    setIsTranscribing(false);
    streamActiveRef.current = false;
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };

  const copyToClipboard = async () => {
    if (!transcript) return;
    await navigator.clipboard.writeText(transcript);
  };

  useEffect(() => {
    const handler = (event: Event) => {
      const action = (event as CustomEvent).detail;
      if (action !== 'dictate-toggle') return;
      if (isRecording) {
        stopRecording();
      } else if (!isPreparing && !isTranscribing) {
        startRecording();
      }
    };
    window.addEventListener('hotkey-action', handler as EventListener);
    return () => window.removeEventListener('hotkey-action', handler as EventListener);
  }, [isRecording, isPreparing, isTranscribing, startRecording, stopRecording]);

  return (
    <div className="space-y-8 animate-slide-up">
      <ConfirmDialog
        open={showInstallPrompt}
        title="Install STT engine?"
        description={
          installOutput ? (
            <div className="space-y-2">
              <div className="text-xs text-slate-400">Install output (latest)</div>
              <pre className="text-xs bg-white/5 border border-glass-border rounded-lg p-2 whitespace-pre-wrap max-h-40 overflow-auto">
                {installOutput.split(/\r?\n/).filter(Boolean).slice(-10).join('\n')}
              </pre>
              <details className="text-xs text-slate-400">
                <summary className="cursor-pointer">Show full output</summary>
                <pre className="mt-2 bg-white/5 border border-glass-border rounded-lg p-2 whitespace-pre-wrap max-h-56 overflow-auto">
                  {installOutput}
                </pre>
              </details>
            </div>
          ) : (
            'faster-whisper is required for local dictation. Install it now?'
          )
        }
        confirmLabel="Install"
        cancelLabel="Not now"
        onCancel={() => {
          if (!installing) {
            setShowInstallPrompt(false);
            setInstallOutput(null);
          }
        }}
        onConfirm={async () => {
          setInstalling(true);
          setInstallOutput(null);
          try {
            const res = await installSttEngine();
            const output = res.output || res.message || '';
            const normalized = output.toLowerCase();
            const success = normalized.includes('successfully installed') || normalized.includes('requirement already satisfied');
            setInstallOutput(output || 'Install complete.');
            setError(null);
            disablePartialRef.current = false;
            if (success) {
              setTimeout(() => {
                setShowInstallPrompt(false);
              }, 800);
            }
          } catch (err: any) {
            setInstallOutput(err.response?.data?.detail || err.message || 'Install failed');
          } finally {
            setInstalling(false);
          }
        }}
        busy={installing}
      />
      <div className="space-y-2">
        <h1 className="text-4xl font-bold text-gradient">Speech to Text</h1>
        <p className="text-slate-400">
          Dictate inside Whisperall with smart formatting and backtrack rules.
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
            <h2 className="text-lg font-semibold text-slate-100">Dictation Controls</h2>

            <SelectMenu
              label="Language"
              value={language}
              options={languageOptions}
              onChange={setLanguage}
            />

            <UnifiedProviderSelector
              service="stt"
              selected={provider}
              onSelect={updateProvider}
              selectedModel={providerModel}
              onModelChange={setProviderModel}
              onProviderInfoChange={(info) => setProviderInfo(info as ServiceProviderInfo | null)}
              variant="dropdown"
              showModelSelector
              label="Transcription Engine"
            />

            <label className="label mt-4">Prompt (optional)</label>
            <input
              className="input"
              placeholder="Project names, acronyms, or style notes"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />

            <div className="flex items-center gap-3 mt-4">
              {!isRecording ? (
                <button
                  onClick={startRecording}
                  disabled={isPreparing || isTranscribing}
                  className="btn btn-primary w-full"
                >
                  {isPreparing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Preparing...
                    </>
                  ) : (
                    <>
                      <Mic className="w-4 h-4" />
                      Start Dictation
                    </>
                  )}
                </button>
              ) : (
                <button
                  onClick={stopRecording}
                  className="btn btn-secondary w-full"
                >
                  <Square className="w-4 h-4" />
                  Stop Dictation
                </button>
              )}
            </div>

            {isRecording && (
              <div className="flex items-center justify-between text-sm text-slate-400">
                <span>Recording...</span>
                <span className="font-mono">{formatDuration(duration)}</span>
              </div>
            )}

            {sessionId && (
              <button onClick={cancelRecording} className="btn btn-ghost w-full">
                Cancel Session
              </button>
            )}
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div className="glass-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-100">Transcription</h2>
              <div className="flex gap-2">
                <button
                  onClick={copyToClipboard}
                  disabled={!transcript}
                  className="btn btn-secondary btn-icon"
                  title="Copy to clipboard"
                >
                  <Copy className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    setTranscript('');
                    setRawTranscript('');
                  }}
                  className="btn btn-ghost btn-icon"
                  title="Clear"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </div>

            {isTranscribing && (
              <div className="flex items-center gap-3 text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                Transcribing audio...
              </div>
            )}

            <textarea
              className="input textarea min-h-[220px]"
              placeholder="Your transcription will appear here..."
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
            />

            {rawTranscript && (
              <div className="text-xs text-slate-400">
                Raw transcript: {rawTranscript}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
