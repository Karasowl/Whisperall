'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Mic, Square, Loader2, Copy, Check, RefreshCw, MessageSquare, Trash2 } from 'lucide-react';
import {
  startStt,
  stopStt,
  cancelStt,
  partialStt,
  finalizeStt,
  installSttEngine,
  ServiceProviderInfo,
  getProviderSelection,
  getAllModels,
  setProvider,
  getSTTSettings,
  STTSettings,
  getHotkeys,
  getOnboardingStatus,
  completeOnboarding,
} from '@/lib/api';
import { formatDuration, cn } from '@/lib/utils';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { SelectMenu } from '@/components/SelectMenu';
import { UnifiedProviderSelector } from '@/components/UnifiedProviderSelector';
import { insertTextAtCursor, setLastSttTranscript } from '@/lib/sttHelper';
import { playActionSound } from '@/lib/actionSounds';
import { usePlan } from '@/components/PlanProvider';
import { useDevMode } from '@/components/DevModeProvider';
import {
  ModuleShell,
  ActionBar,
} from '@/components/module';

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
  const { hasPro } = usePlan();
  const { devMode: devModeEnabled } = useDevMode();
  const showEngineSelector = devModeEnabled;

  const [showOnboarding, setShowOnboarding] = useState(false);
  const [hotkeys, setHotkeys] = useState<Record<string, string> | null>(null);

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
  const [lastMeta, setLastMeta] = useState<Record<string, any> | null>(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installOutput, setInstallOutput] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [sttSettings, setSttSettings] = useState<STTSettings>({
    auto_punctuation: true,
    filler_removal: true,
    backtrack: true,
    smart_formatting: true,
    language: 'auto',
    transcription_mode: 'final',
    hotkey_mode: 'toggle',
    auto_paste: false,
    overlay_enabled: true,
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const BAR_COUNT = 32;
  const idleBars = useMemo(() => Array.from({ length: BAR_COUNT }, (_, i) => 6 + ((i % 6) * 2)), []);
  const [audioBars, setAudioBars] = useState<number[]>(idleBars);
  const [audioLevel, setAudioLevel] = useState(0);
  const hotkeyHeldRef = useRef(false);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const streamActiveRef = useRef(false);
  const streamSendingRef = useRef(false);
  const mimeTypeRef = useRef('audio/webm');
  const lastPartialAtRef = useRef(0);
  const disablePartialRef = useRef(false);
  const didLoadRef = useRef(false);

  const stopActiveStream = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;
    try {
      stream.getTracks().forEach((track) => {
        try { track.stop(); } catch { }
      });
    } finally {
      streamRef.current = null;
    }
  }, []);

  // === ONBOARDING (First run) ===
  useEffect(() => {
    let active = true;
    getOnboardingStatus()
      .then((status) => {
        if (!active) return;
        if (!status?.completed) setShowOnboarding(true);
      })
      .catch(() => {});

    getHotkeys()
      .then((hk) => {
        if (!active) return;
        setHotkeys(hk);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  // === CLEANUP ===
  useEffect(() => {
    return () => {
      streamActiveRef.current = false;
      disablePartialRef.current = true;
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      stopActiveStream();
      window.electronAPI?.hideSttOverlay?.();
    };
  }, [stopActiveStream]);

  // === SETTINGS LOADERS ===
  useEffect(() => {
    getSTTSettings()
      .then((settings) => {
        setSttSettings(settings);
      })
      .catch(() => {});
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
            : `${model.description || 'Requires download'} · Install required components`,
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

  // === AUDIO MONITORING ===
  const startAudioLevelMonitoring = useCallback((stream: MediaStream) => {
    try {
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const analyser = audioContext.createAnalyser();
      analyserRef.current = analyser;
      analyser.fftSize = 256;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const updateLevel = () => {
        if (!streamActiveRef.current) {
          setAudioLevel(0);
          setAudioBars(idleBars);
          if (sttSettings.overlay_enabled) {
            window.electronAPI?.updateSttOverlayLevel?.(0);
          }
          return;
        }
        analyser.getByteFrequencyData(dataArray);
        const sum = dataArray.reduce((a, b) => a + b, 0);
        const avg = sum / dataArray.length;
        const level = Math.min(1, avg / 128);
        setAudioLevel(level);

        const step = Math.max(1, Math.floor(dataArray.length / BAR_COUNT));
        const nextBars = new Array(BAR_COUNT).fill(0).map((_, idx) => {
          const start = idx * step;
          const end = Math.min(start + step, dataArray.length);
          let localSum = 0;
          for (let i = start; i < end; i += 1) {
            localSum += dataArray[i];
          }
          const localAvg = localSum / Math.max(1, end - start);
          const height = Math.max(4, Math.round((localAvg / 255) * 40));
          return height;
        });
        setAudioBars(nextBars);

        if (sttSettings.overlay_enabled) {
          window.electronAPI?.updateSttOverlayLevel?.(level);
        }
        animationFrameRef.current = requestAnimationFrame(updateLevel);
      };

      updateLevel();
    } catch (err) {
      console.warn('[AudioLevel] Failed to start monitoring:', err);
    }
  }, [BAR_COUNT, idleBars, sttSettings.overlay_enabled]);

  const stopAudioLevelMonitoring = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setAudioLevel(0);
    setAudioBars(idleBars);
    window.electronAPI?.updateSttOverlayLevel?.(0);
  }, [idleBars]);

  // === ERROR HANDLING ===
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

  // === PARTIAL TRANSCRIPTION ===
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

  // === RECORDING CONTROLS ===
  const startRecording = useCallback(async () => {
    setError(null);
    setIsPreparing(true);
    setTranscript('');
    setRawTranscript('');

    if (providerInfo?.type === 'local' && !providerInfo.is_available) {
      setShowInstallPrompt(true);
      setIsPreparing(false);
      window.electronAPI?.hideSttOverlay?.();
      return;
    }
    if (providerInfo?.type === 'api' && !providerInfo.is_available) {
      setError('Configure the API key in Settings before using this provider.');
      setIsPreparing(false);
      window.electronAPI?.hideSttOverlay?.();
      return;
    }

    try {
      const session = await startStt(language, prompt || undefined);
      setSessionId(session.session_id);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      streamActiveRef.current = true;
      mimeTypeRef.current = mimeType;
      lastPartialAtRef.current = 0;

      // Disable partials if transcription_mode is 'final'
      disablePartialRef.current = sttSettings.transcription_mode === 'final';

      // Start audio monitoring (UI waveform always, overlay only if enabled)
      startAudioLevelMonitoring(stream);
      if (sttSettings.overlay_enabled) {
        window.electronAPI?.showSttOverlay?.();
        window.electronAPI?.updateSttOverlayState?.('listening');
      }

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
          // Only send partials if in 'live' mode
          if (streamActiveRef.current && sttSettings.transcription_mode === 'live') {
            sendPartial(session.session_id, language, prompt);
          }
        }
      };

      recorder.onstop = async () => {
        stopActiveStream();
        stopAudioLevelMonitoring();

        if (!session.session_id) {
          setError('STT session was not created');
          window.electronAPI?.hideSttOverlay?.();
          return;
        }

        setIsTranscribing(true);
        streamActiveRef.current = false;

        // Update overlay to show "Transcribing"
        if (sttSettings.overlay_enabled) {
          window.electronAPI?.updateSttOverlayState?.('transcribing');
        }

        try {
          let result;

          if (sttSettings.transcription_mode === 'live') {
            // Live mode: use finalizeStt which formats accumulated partial text
            result = await finalizeStt(session.session_id);
          } else {
            // Final mode: send full audio for transcription
            const blob = new Blob(chunksRef.current, { type: mimeType });
            result = await stopStt(session.session_id, blob, language, prompt || undefined);
          }

          setTranscript(result.text);
          setRawTranscript(result.raw_text);
          setLastMeta(result.meta || null);
          setLastSttTranscript(result.text);

          // Notify main process about the transcript
          window.electronAPI?.setLastSttTranscript?.(result.text);

          // Auto-paste if enabled
          if (sttSettings.auto_paste && result.text) {
            window.electronAPI?.pasteLastTranscript?.(result.text);
          } else {
            insertTextAtCursor(result.text);
          }
    } catch (err: any) {
      handleSttError(err, 'Transcription failed');
    } finally {
          setIsTranscribing(false);
          setSessionId(null);
          playActionSound('complete');
          window.electronAPI?.hideSttOverlay?.();
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
      stopActiveStream();
      window.electronAPI?.hideSttOverlay?.();
    }
  }, [language, prompt, sendPartial, handleSttError, sttSettings, providerInfo, startAudioLevelMonitoring, stopAudioLevelMonitoring, stopActiveStream]);

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
    stopAudioLevelMonitoring();
    stopActiveStream();
    window.electronAPI?.hideSttOverlay?.();
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };

  // === CLIPBOARD ACTIONS ===
  const copyToClipboard = async () => {
    if (!transcript) return;
    try {
      await navigator.clipboard.writeText(transcript);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Failed to copy to clipboard');
    }
  };

  const clearTranscript = () => {
    setTranscript('');
    setRawTranscript('');
  };

  // === HOTKEY HANDLER ===
  useEffect(() => {
    const handleHotkey = (event: Event) => {
      const action = (event as CustomEvent).detail;

      if (action === 'dictate-toggle') {
        // Toggle mode: press to start/stop
        if (isRecording) {
          stopRecording();
        } else if (!isPreparing && !isTranscribing) {
          startRecording();
        }
      } else if (action === 'dictate-start') {
        // Hold mode: start on keydown
        if (!isRecording && !isPreparing && !isTranscribing) {
          hotkeyHeldRef.current = true;
          startRecording();
        }
      } else if (action === 'dictate-stop') {
        // Hold mode: stop on keyup
        if (isRecording && hotkeyHeldRef.current) {
          hotkeyHeldRef.current = false;
          stopRecording();
        }
      }
    };

    window.addEventListener('hotkey-action', handleHotkey as EventListener);
    return () => window.removeEventListener('hotkey-action', handleHotkey as EventListener);
  }, [isRecording, isPreparing, isTranscribing, startRecording, stopRecording]);

  // === COMPUTED ===
  const isProcessing = isPreparing || isTranscribing;
  const hasTranscript = transcript.trim().length > 0;
  const providerLabel = providerInfo?.name || provider;
  const providerModelLabel =
    (lastMeta?.model as string | undefined) ||
    providerConfig?.model ||
    providerModel ||
    providerInfo?.default_model ||
    '';
  const billingBucket = (lastMeta?.billing_bucket as string | undefined) || '';
  const billingLabel =
    billingBucket === 'elevenlabs_stt_api_hours'
      ? 'STT API hours'
      : billingBucket === 'local_free'
      ? 'Local (free)'
      : billingBucket
      ? billingBucket.replace(/_/g, ' ')
      : '';

  // === RENDER ===
  return (
    <>
      {/* Install Dialog */}
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
            const output = res.message || '';
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

      <ConfirmDialog
        open={showOnboarding}
        title="Welcome to Whisperall"
        confirmLabel="Start dictating"
        cancelLabel="Don't show again"
        onCancel={() => {
          setShowOnboarding(false);
          completeOnboarding().catch(() => {});
        }}
        onConfirm={() => {
          setShowOnboarding(false);
          completeOnboarding().catch(() => {});
        }}
        description={
          <div className="space-y-3">
            <p>
              Whisperall is <span className="text-slate-100 font-medium">dictation-first</span>. You should be able to
              get your first transcript in under 60 seconds.
            </p>
            <div className="space-y-1 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-300">Dictate anywhere</span>
                <span className="font-mono text-xs text-slate-100 bg-white/5 border border-glass-border rounded px-2 py-1">
                  {hotkeys?.dictate || 'Alt+X'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-300">Paste last transcript</span>
                <span className="font-mono text-xs text-slate-100 bg-white/5 border border-glass-border rounded px-2 py-1">
                  {hotkeys?.stt_paste || 'Alt+Shift+S'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-300">Read clipboard</span>
                <span className="font-mono text-xs text-slate-100 bg-white/5 border border-glass-border rounded px-2 py-1">
                  {hotkeys?.read_clipboard || 'Ctrl+Shift+R'}
                </span>
              </div>
            </div>
            <div className="text-xs text-slate-400">
              Need to change shortcuts?{' '}
              <Link href="/settings?tab=hotkeys" className="text-amber-300 underline">
                Open Hotkeys settings
              </Link>
            </div>
          </div>
        }
      />

      <div className="min-h-screen bg-background text-foreground overflow-x-hidden page-premium">
        <header className="w-full max-w-[1400px] mx-auto flex items-center justify-between px-8 py-8 md:px-12">
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center size-10 rounded-xl bg-surface-2 border border-surface-3 text-accent-primary">
              <Mic className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-semibold tracking-wide text-foreground">
              Whisperall <span className="text-foreground-muted font-normal">Dictate</span>
            </h2>
          </div>
          <nav className="hidden md:flex flex-1 justify-center gap-12">
            <Link className="text-foreground-muted hover:text-foreground text-sm font-medium transition-colors" href="/transcribe">Studio</Link>
            <Link className="text-foreground text-sm font-medium transition-colors" href="/dictate">Dictate</Link>
            <Link className="text-foreground-muted hover:text-foreground text-sm font-medium transition-colors" href="/history">Library</Link>
          </nav>
          <div className="flex items-center gap-6">
            <div className="size-10 rounded-full bg-surface-2 border border-surface-3" />
          </div>
        </header>

        <main className="flex-1 w-full max-w-[1200px] mx-auto px-6 md:px-12 py-8 flex flex-col gap-12">
          <ModuleShell
        title="Speech to Text"
        description="Dictate inside Whisperall with smart formatting and backtrack rules."
        icon={Mic}
        layout="split"
        settingsPosition="left"
        settingsTitle="Dictation Controls"
        // Engine selector
        engineSelector={
          showEngineSelector ? (
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
          ) : undefined
        }
        // Settings panel content
        settings={
          <>
            <SelectMenu
              label="Language"
              value={language}
              options={languageOptions}
              onChange={setLanguage}
            />

            <div className="space-y-1.5">
              <label className="label">Prompt (optional)</label>
              <input
                className="input"
                placeholder="Project names, acronyms, or style notes"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
            </div>
            {showEngineSelector && (
              <div className="text-xs text-foreground-muted">
                Provider: <span className="text-foreground">{providerLabel}</span>
                {providerModelLabel ? ` • Quality: ${providerModelLabel}` : ''}
                {billingLabel ? ` • Billing: ${billingLabel}` : ''}
              </div>
            )}

            {/* Recording status */}
            {isRecording && (
              <div className="flex items-center justify-between py-3 px-4 rounded-lg bg-red-500/10 border border-red-500/20">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-sm text-red-400">Recording...</span>
                </div>
                <span className="font-mono text-sm text-red-400">{formatDuration(duration)}</span>
              </div>
            )}

            {/* Cancel session button */}
            {sessionId && !isRecording && (
              <button onClick={cancelRecording} className="btn btn-ghost w-full">
                Cancel Session
              </button>
            )}
          </>
        }
        // Action buttons
        actions={
          <ActionBar
            primary={
              isRecording
                ? {
                    label: 'Stop Dictation',
                    icon: Square,
                    onClick: stopRecording,
                  }
                : {
                    label: 'Start Dictation',
                    icon: Mic,
                    onClick: startRecording,
                    disabled: isProcessing,
                  }
            }
            loading={isPreparing}
            loadingText="Preparing..."
            pulse={!isRecording && !isProcessing}
          />
        }
        // Main content: Transcription panel
        main={
          <div className="space-y-6">
            <div className="glass-card p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-foreground-muted">
                  <span className={cn('w-2 h-2 rounded-full', isRecording ? 'bg-emerald-400 animate-pulse' : 'bg-surface-3')} />
                  {isRecording ? 'Listening' : isTranscribing ? 'Transcribing' : 'Ready'}
                </div>
                <div className="text-[10px] text-foreground-muted font-mono">
                  {isRecording ? formatDuration(duration) : '00:00:00'}
                </div>
              </div>
              <div className="h-24 rounded-2xl border border-surface-3/60 bg-surface-2/40 flex items-center justify-center overflow-hidden">
                <div className="flex items-center justify-center gap-1 h-16 w-full px-8 opacity-80">
                  {audioBars.map((height, idx) => (
                    <div
                      key={`bar-${idx}`}
                      className="w-0.5 rounded-full bg-accent-primary/80 transition-[height] duration-150 ease-out"
                      style={{ height: `${height}px`, opacity: 0.5 + audioLevel * 0.5 }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="glass-card p-6 space-y-4 h-full flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-foreground-muted" />
                  <h2 className="text-lg font-semibold text-foreground">Transcription</h2>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={copyToClipboard}
                    disabled={!hasTranscript}
                    className={cn(
                      'p-2 rounded-lg transition-colors',
                      copied
                        ? 'text-emerald-400 bg-emerald-500/10'
                        : 'text-foreground-muted hover:text-foreground hover:bg-surface-2 disabled:opacity-50 disabled:cursor-not-allowed'
                    )}
                    title={copied ? 'Copied!' : 'Copy to clipboard'}
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={clearTranscript}
                    disabled={!hasTranscript}
                    className="p-2 rounded-lg text-foreground-muted hover:text-foreground hover:bg-surface-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    title="Clear transcript"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Transcribing indicator */}
              {isTranscribing && (
                <div className="flex items-center gap-3 py-2 px-3 rounded-lg bg-accent-primary/10 border border-accent-primary/20">
                  <Loader2 className="w-4 h-4 animate-spin text-accent-primary" />
                  <span className="text-sm text-accent-primary">Transcribing audio...</span>
                </div>
              )}

              {/* Editable transcript textarea */}
              <textarea
                className="input textarea flex-1 min-h-[300px] resize-none font-sans text-base leading-relaxed focus:ring-0 border-transparent bg-surface-1"
                placeholder={isRecording ? 'Listening...' : 'Your transcription will appear here...'}
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
              />

              {/* Raw transcript (if different) */}
              {rawTranscript && rawTranscript !== transcript && (
                <details className="text-xs text-foreground-muted">
                  <summary className="cursor-pointer hover:text-foreground transition-colors">
                    Show raw transcript
                  </summary>
                  <div className="mt-2 p-3 rounded-lg bg-surface-1 font-mono">
                    {rawTranscript}
                  </div>
                </details>
              )}

              {/* Character count */}
              {hasTranscript && (
                <div className="text-xs text-foreground-muted text-right">
                  {transcript.length.toLocaleString()} characters
                </div>
              )}
            </div>
          </div>
        }
        // Status
        error={error}
        onErrorDismiss={() => setError(null)}
      />
        </main>
      </div>
    </>
  );
}
