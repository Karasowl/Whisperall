"use client";

import { useState, useCallback, useRef, useEffect, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  FileAudio,
  Loader2,
  AlertCircle,
  Thermometer,
  Shield,
  XCircle,
  Eye,
  Pause,
  Play,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Zap,
} from "lucide-react";
import {
  uploadForTranscription,
  getTranscriptionStatus,
  getTranscriptionHistory,
  updateTranscriptSegments,
  exportTranscript,
  importTranscriptionFromLink,
  getDiarizationStatus,
  getEngineStatus,
  cancelTranscriptionJob,
  pauseTranscriptionJob,
  resumeTranscriptionJob,
  rediarizeTranscription,
  TranscriptionJob,
  TranscriptSegment,
  DiarizationStatus,
  EngineStatus,
  TranscriptionEngine,
  TranscriptionEngineId,
  DiarizationMode,
  ServiceProviderInfo,
  getProviderSelection,
  getAllModels,
  setProvider,
} from "@/lib/api";
import TranscriptEditor from "@/components/TranscriptEditor";
import ExportModal from "@/components/ExportModal";
import ImportLinkModal from "@/components/ImportLinkModal";
import PyannoteSetupWizard from "@/components/PyannoteSetupWizard";
import { SelectMenu } from "@/components/SelectMenu";
import { UnifiedProviderSelector } from "@/components/UnifiedProviderSelector";
import { ActionBar, Dropzone, ModuleShell } from "@/components/module";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/Toast";
import { useDevMode } from "@/components/DevModeProvider";
import { Toggle } from "@/components/Toggle";
import {
  DIARIZATION_MODE_OPTIONS,
  LANGUAGE_OPTIONS,
  PREVIEW_SEGMENT_LIMIT,
  SAFETY_DEVICE_OPTIONS,
  SAFETY_MODE_OPTIONS,
  WHISPER_MODEL_OPTIONS,
} from "@/features/transcribe/options";
import type {
  DiarizationDevice,
  DiarizationSafetyMode,
  DiarizationSafetySettings,
} from "@/features/transcribe/types";
import {
  formatDuration,
  formatEta,
  formatFileSize,
  formatLinkLabel,
} from "@/features/transcribe/format";

const API_BASE =
  (typeof window !== "undefined" ? window.electronAPI?.backendUrl : undefined) ||
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== "undefined" ? window.location.origin : "http://localhost:8080");

const SUPPORTED_MEDIA_EXTENSIONS = [
  ".mp3",
  ".wav",
  ".m4a",
  ".ogg",
  ".flac",
  ".aac",
  ".mp4",
  ".mkv",
  ".webm",
  ".avi",
  ".mov",
];

type GpuTelemetry = {
  available: boolean;
  source?: string;
  reason?: string;
  sensors?: Array<{
    index: number | null;
    name: string;
    temperature?: {
      core_c?: number | null;
      memory_c?: number | null;
      hotspot_c?: number | null;
      hotspot_source?: string | null;
      hotspot_kind?: string | null;
    };
    power_w?: number | null;
    power_limit_w?: number | null;
    utilization?: number | null;
    throttle?: Record<string, boolean | null> | null;
  }>;
};

type SystemTelemetry = {
  timestamp: string;
  gpu: GpuTelemetry;
};

type AudioCacheStatus = {
  count: number;
  total_bytes: number;
  total_gb: number;
  max_age_days: number;
  max_size_gb: number;
  path?: string;
};

function TranscribePageContent() {
  const searchParams = useSearchParams();
  const toast = useToast();
  const { devMode: devModeEnabled } = useDevMode();
  const showEngineSelector = devModeEnabled;

  // File state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Settings
  const [language, setLanguage] = useState("auto");
  const [whisperModel, setWhisperModel] = useState("base");
  const [engine, setEngine] = useState<TranscriptionEngineId>("fast");
  const [engineStatus, setEngineStatus] = useState<EngineStatus | null>(null);
  const [enableDiarization, setEnableDiarization] = useState(true);
  const [diarizationMode, setDiarizationMode] = useState<DiarizationMode>("auto");
  const [minSpeakers, setMinSpeakers] = useState(1);
  const [maxSpeakers, setMaxSpeakers] = useState(10);
  const [enableAICleanup, setEnableAICleanup] = useState(false);
  const [includeTimestamps, setIncludeTimestamps] = useState(true);
  const [contextPrompt, setContextPrompt] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showSystemDetails, setShowSystemDetails] = useState(false);
  const [safetySettings, setSafetySettings] = useState<DiarizationSafetySettings>({
    mode: "safe",
    device: "cpu",
  });
  const [telemetry, setTelemetry] = useState<SystemTelemetry | null>(null);
  const [telemetryError, setTelemetryError] = useState<string | null>(null);
  const [audioCacheStatus, setAudioCacheStatus] = useState<AudioCacheStatus | null>(null);
  const [isClearingCache, setIsClearingCache] = useState(false);

  // Provider settings
  const [sttProvider, setSttProvider] = useState("faster-whisper");
  const [sttProviderInfo, setSttProviderInfo] = useState<ServiceProviderInfo | null>(null);
  const [sttProviderConfig, setSttProviderConfig] = useState<Record<string, any>>({});
  const [sttProviderModel, setSttProviderModel] = useState("");
  const didLoadProviderRef = useRef(false);
  const prevProviderRef = useRef<string | null>(null);
  const [sttModelInstalled, setSttModelInstalled] = useState<Record<string, boolean>>({});
  const isApiProvider = sttProviderInfo?.type === "api";

  // Job state
  const [currentJob, setCurrentJob] = useState<TranscriptionJob | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedBytes, setUploadedBytes] = useState(0);
  const [uploadSpeedBps, setUploadSpeedBps] = useState<number | null>(null);
  const [uploadEtaSeconds, setUploadEtaSeconds] = useState<number | null>(null);
  const uploadStartRef = useRef<number | null>(null);
  const uploadLastRef = useRef<{ time: number; bytes: number } | null>(null);
  const [isRediarizing, setIsRediarizing] = useState(false);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const [showFullPreview, setShowFullPreview] = useState(false);
  const [showPreview, setShowPreview] = useState(true);

  // ETA tracking based on real performance
  const [etaSeconds, setEtaSeconds] = useState<number | null>(null);
  const progressHistoryRef = useRef<{ time: number; progress: number }[]>([]);

  // Audio player
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const formatSpeed = (bps: number | null) => {
    if (!bps || bps <= 0) return null;
    if (bps >= 1024 * 1024) return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
    if (bps >= 1024) return `${(bps / 1024).toFixed(1)} KB/s`;
    return `${bps.toFixed(0)} B/s`;
  };

  // Export modal
  const [showExportModal, setShowExportModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  // Diarization status
  const [diarizationStatus, setDiarizationStatus] = useState<DiarizationStatus | null>(null);
  const [showPyannoteWizard, setShowPyannoteWizard] = useState(false);

  const canUsePyannote = diarizationStatus?.pyannote_available ?? false;
  const pyannoteError = diarizationStatus?.pyannote_error;
  const diarizationModeOptions = useMemo(() => {
    const disableBasicForUpload = !currentJob && engine === "accurate";
    return DIARIZATION_MODE_OPTIONS.map((option) => {
      if (option.value === "pyannote" && !canUsePyannote) {
        return {
          ...option,
          disabled: true,
          description: "Requires HuggingFace access (not ready)",
        };
      }
      if (option.value === "basic" && disableBasicForUpload) {
        return {
          ...option,
          disabled: true,
          description: "Available with Fast engine only",
        };
      }
      return option;
    });
  }, [canUsePyannote, currentJob, engine]);

  const getWhisperModelId = (modelValue: string) => {
    if (modelValue === "distil-large-v3") {
      return "faster-distil-whisper-large-v3";
    }
    return `faster-whisper-${modelValue}`;
  };

  const whisperModelOptions = useMemo(() => {
    const hasStatus = Object.keys(sttModelInstalled).length > 0;
    const shouldCheckInstall =
      engine === "fast" &&
      sttProvider === "faster-whisper" &&
      sttProviderInfo?.type === "local";

    return WHISPER_MODEL_OPTIONS.map((option) => {
      if (engine === "accurate" && option.value === "distil-large-v3") {
        return {
          ...option,
          disabled: true,
          description: "Fast engine only",
        };
      }

      if (!shouldCheckInstall || !hasStatus) {
        return option;
      }

      const modelId = getWhisperModelId(option.value);
      const installed = sttModelInstalled[modelId];
      if (installed) {
        return option;
      }

      return {
        ...option,
        disabled: true,
        description: `${option.description} · Install required components`,
      };
    });
  }, [engine, sttModelInstalled, sttProvider, sttProviderInfo]);

  const modelPrecisionOptions = useMemo(() => {
    const preferred = new Set(["tiny", "base", "large-v3"]);
    const labelMap: Record<string, string> = {
      tiny: "Nano",
      base: "Base",
      "large-v3": "Large",
    };
    return whisperModelOptions
      .filter((option) => preferred.has(option.value))
      .map((option) => ({
        ...option,
        label: labelMap[option.value] || option.label,
      }));
  }, [whisperModelOptions]);

  const jobEngine = currentJob?.engine || engine;
  const engineLabel =
    (jobEngine && engineStatus?.engines?.[jobEngine]?.name) ||
    (jobEngine === "accurate" ? "Accurate" : "Fast");

  const jobDiarizationMode = currentJob?.diarization_mode || diarizationMode;
  const diarizationModeLabel =
    jobDiarizationMode === "pyannote"
      ? "AI (pyannote)"
      : jobDiarizationMode === "basic"
      ? "Basic (clustering)"
      : "Auto";
  const progressValue = typeof currentJob?.progress === "number" ? currentJob.progress : null;
  const phaseInfo = useMemo(() => {
    if (!currentJob) return null;
    const status = currentJob.status;
    const step = (currentJob.current_step || "").toLowerCase();
    const progress = typeof currentJob.progress === "number" ? currentJob.progress : 0;
    const isDownloading = status === "downloading" || step.includes("download");
    const isExtracting = step.includes("extract") || (progress >= 2 && progress < 10);
    const isTranscribing = status === "transcribing" || step.includes("transcrib");
    const isDiarizing = status === "diarizing" || step.includes("speaker") || step.includes("diariz");
    const isCleaning = status === "cleaning" || step.includes("clean");
    const isPending = status === "pending";

    const clamp = (value: number) => Math.max(0, Math.min(100, value));
    let phaseProgress: number | null = null;
    if (isDownloading) {
      phaseProgress = clamp((progress / 2) * 100);
    } else if (isExtracting) {
      phaseProgress = clamp(((progress - 2) / 8) * 100);
    } else if (isTranscribing) {
      phaseProgress = clamp(((progress - 10) / 70) * 100);
    } else if (isDiarizing) {
      phaseProgress = clamp(((progress - 80) / 15) * 100);
    } else if (isCleaning) {
      phaseProgress = clamp(((progress - 95) / 5) * 100);
    }

    let phaseLabel = "Preparing";
    if (isDownloading) phaseLabel = "Downloading";
    else if (isExtracting) phaseLabel = "Extracting audio";
    else if (isTranscribing) phaseLabel = "Transcribing";
    else if (isDiarizing) phaseLabel = "Identifying speakers";
    else if (isCleaning) phaseLabel = "Cleaning up";
    else if (isPending) phaseLabel = "Preparing";

    return {
      phaseLabel,
      phaseProgress,
      isDownloading,
      isExtracting,
      isTranscribing,
      isDiarizing,
      isCleaning,
      isPending,
    };
  }, [currentJob]);

  const canRediarize = diarizationMode !== "pyannote" || canUsePyannote;
  const rediarizeLabel =
    diarizationMode === "pyannote"
      ? "Re-diarize (AI)"
      : diarizationMode === "basic"
      ? "Re-diarize (Basic)"
      : "Re-diarize (Auto)";
  const rediarizeTitle =
    diarizationMode === "pyannote"
        ? canUsePyannote
        ? "Re-run AI speaker detection (pyannote)"
        : (pyannoteError || "Pyannote AI not configured. Add a HuggingFace token in Settings.")
      : diarizationMode === "basic"
      ? "Re-run speaker clustering (no AI required)"
      : "Auto: use AI if available, otherwise basic clustering";

  const diarizationStatusText =
    diarizationMode === "basic"
      ? "Basic clustering (no AI)"
      : diarizationMode === "pyannote"
      ? canUsePyannote
        ? "AI detection (pyannote)"
        : "AI detection unavailable"
      : canUsePyannote
      ? "Auto: AI detection available"
      : "Auto: using basic clustering";
  const diarizationStatusTone =
    diarizationMode === "basic"
      ? "bg-amber-500/10 text-amber-400"
      : canUsePyannote
      ? "bg-success/10 text-success"
      : "bg-amber-500/10 text-amber-400";
  const diarizationStatusDot =
    diarizationMode === "basic" || !canUsePyannote ? "bg-amber-400" : "bg-success";
  const showPyannoteSetup = diarizationMode !== "basic" && !canUsePyannote;

  const derivedSpeakersDetected = useMemo(() => {
    const segments = currentJob?.segments || [];
    if (segments.length === 0) {
      return 0;
    }
    const speakerIds = new Set<number>();
    const speakerLabels = new Set<string>();
    for (const segment of segments) {
      if (typeof segment.speaker_id === "number") {
        speakerIds.add(segment.speaker_id);
      }
      if (segment.speaker) {
        speakerLabels.add(segment.speaker);
      }
    }
    return Math.max(speakerIds.size, speakerLabels.size);
  }, [currentJob?.segments]);

  const isVideoFile = useMemo(() => {
    const name = (currentJob?.filename || selectedFile?.name || "").toLowerCase();
    if (!name) return false;
    return [".mp4", ".mkv", ".avi", ".mov", ".webm", ".flv", ".wmv"].some((ext) =>
      name.endsWith(ext)
    );
  }, [currentJob?.filename, selectedFile?.name]);

  const effectiveSpeakersDetected = useMemo(() => {
    if (!currentJob || currentJob.enable_diarization === false) {
      return 0;
    }
    if (typeof currentJob.speakers_detected === "number" && currentJob.speakers_detected > 0) {
      return currentJob.speakers_detected;
    }
    return derivedSpeakersDetected;
  }, [currentJob, derivedSpeakersDetected]);

  const previewSegments = useMemo(() => {
    const segments = currentJob?.segments || [];
    if (showFullPreview || segments.length <= PREVIEW_SEGMENT_LIMIT) {
      return segments;
    }
    return segments.slice(-PREVIEW_SEGMENT_LIMIT);
  }, [currentJob?.segments, showFullPreview]);

  const previewShowSpeakers = derivedSpeakersDetected > 1;
  const previewText = useMemo(() => {
    if (!previewShowSpeakers) {
      return previewSegments.map((segment) => segment.text).join(" ");
    }
    let lastSpeaker: string | null = null;
    return previewSegments
      .map((segment) => {
        const label =
          segment.speaker ||
          (typeof segment.speaker_id === "number" ? `Speaker ${segment.speaker_id + 1}` : null);
        const prefix = label && label !== lastSpeaker ? `${label}: ` : "";
        if (label) {
          lastSpeaker = label;
        }
        return `${prefix}${segment.text}`;
      })
      .join(" ");
  }, [previewSegments, previewShowSpeakers]);
  const previewTotal = currentJob?.segments?.length ?? 0;
  const previewIsTruncated = !showFullPreview && previewTotal > PREVIEW_SEGMENT_LIMIT;

  const primaryGpu = telemetry?.gpu?.sensors?.[0];
  const hotspot = primaryGpu?.temperature?.hotspot_c;
  const hotspotLabel =
    primaryGpu?.temperature?.hotspot_kind === "proxy" ? "Hot Spot (proxy)" : "Hot Spot";
  const hotspotTone =
    typeof hotspot === "number"
      ? hotspot >= 95
        ? "text-red-400"
        : hotspot >= 85
        ? "text-amber-400"
        : "text-success"
      : "text-slate-400";

  // Load job from URL parameter (e.g., from history page)
  useEffect(() => {
    const jobId = searchParams.get("job");
    if (jobId && !currentJob) {
      console.log("[TranscribePage] Loading job from URL:", jobId);
      getTranscriptionStatus(jobId)
        .then((job) => {
          console.log("[TranscribePage] Loaded job:", job.status, job.segments?.length, "segments");
          setCurrentJob(job);
          if (job.diarization_mode) {
            setDiarizationMode(job.diarization_mode);
          }
        })
        .catch((err) => {
          console.error("[TranscribePage] Failed to load job:", err);
          setUploadError("Failed to load transcription job");
        });
    }
  }, [searchParams, currentJob]);

  useEffect(() => {
    if (currentJob?.job_id) {
      setShowFullPreview(false);
      if (currentJob.diarization_mode) {
        setDiarizationMode(currentJob.diarization_mode);
      }
    }
  }, [currentJob?.job_id]);

  useEffect(() => {
    if (!currentJob && engine === "accurate" && diarizationMode === "basic") {
      setDiarizationMode("auto");
    }
  }, [currentJob, engine, diarizationMode]);

  // Fetch diarization status on mount
  const refreshDiarizationStatus = useCallback(() => {
    getDiarizationStatus()
      .then(setDiarizationStatus)
      .catch(console.error);
  }, []);
  useEffect(() => {
    refreshDiarizationStatus();
  }, [refreshDiarizationStatus]);
  useEffect(() => {
    const handleFocus = () => refreshDiarizationStatus();
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [refreshDiarizationStatus]);

  // Fetch engine status on mount
  useEffect(() => {
    getEngineStatus()
      .then(setEngineStatus)
      .catch(console.error);
  }, []);

  const fetchJson = useCallback(async (url: string, options: RequestInit = {}) => {
    const token = typeof window !== "undefined" ? window.electronAPI?.authToken : undefined;
    const headers = new Headers(options.headers || {});
    if (token && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    if (typeof window !== "undefined" && window.electronAPI?.netFetch) {
      const headersObj: Record<string, string> = {};
      headers.forEach((value, key) => {
        headersObj[key] = value;
      });
      const response = await window.electronAPI.netFetch(url, {
        method: options.method || "GET",
        headers: headersObj,
        body: typeof options.body === "string" ? options.body : undefined,
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response.body ? JSON.parse(response.body) : {};
    }
    const response = await fetch(url, { ...options, headers });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.json();
  }, []);

  const loadSafetySettings = useCallback(async () => {
    try {
      const data = await fetchJson(`${API_BASE}/api/settings/diarization.safety`);
      const value = (data?.value || {}) as Partial<DiarizationSafetySettings>;
      const mode = (value.mode || "safe") as DiarizationSafetyMode;
      const device = (value.device || (mode === "safe" ? "cpu" : "auto")) as DiarizationDevice;
      setSafetySettings({ mode, device });
    } catch (error) {
      console.warn("Failed to load diarization safety settings:", error);
    }
  }, [fetchJson]);

  const saveSafetySettings = useCallback(async (next: DiarizationSafetySettings) => {
    setSafetySettings(next);
    try {
      await fetchJson(`${API_BASE}/api/settings/diarization.safety`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: next }),
      });
    } catch (error) {
      console.error("Failed to save diarization safety settings:", error);
    }
  }, [fetchJson]);

  const loadAudioCacheStatus = useCallback(async () => {
    try {
      const data = await fetchJson(`${API_BASE}/api/cache/audio/status`);
      setAudioCacheStatus(data as AudioCacheStatus);
    } catch (error) {
      console.warn("Failed to load audio cache status:", error);
    }
  }, [fetchJson]);

  const handleClearAudioCache = useCallback(async () => {
    setIsClearingCache(true);
    try {
      await fetchJson(`${API_BASE}/api/cache/audio/clear`, { method: "POST" });
      await loadAudioCacheStatus();
    } catch (error) {
      console.error("Failed to clear audio cache:", error);
    } finally {
      setIsClearingCache(false);
    }
  }, [fetchJson, loadAudioCacheStatus]);

  useEffect(() => {
    loadSafetySettings();
  }, [loadSafetySettings]);

  useEffect(() => {
    loadAudioCacheStatus();
  }, [loadAudioCacheStatus]);

  useEffect(() => {
    let active = true;
    getAllModels("stt")
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

  // Load STT provider selection from settings
  useEffect(() => {
    async function loadProviderSelection() {
      try {
        const selection = await getProviderSelection("stt");
        setSttProvider(selection.selected || "faster-whisper");
        setSttProviderConfig(selection.config || {});
        setSttProviderModel(selection.config?.model || "");
      } catch {
        // Keep defaults if settings are missing.
      } finally {
        didLoadProviderRef.current = true;
      }
    }
    loadProviderSelection();
  }, []);

  useEffect(() => {
    if (!didLoadProviderRef.current) return;
    const previous = prevProviderRef.current;
    if (previous && previous !== sttProvider) {
      setSttProviderConfig({});
      setSttProviderModel("");
    }
    prevProviderRef.current = sttProvider;
  }, [sttProvider]);

  // Ensure API provider model is valid
  useEffect(() => {
    if (!sttProviderInfo || sttProviderInfo.type !== "api") return;
    const models = sttProviderInfo.models || [];
    if (!models.length) return;
    const modelIds = models.map((model) => model.id);
    const candidate =
      sttProviderConfig?.model || sttProviderInfo.default_model || modelIds[0];
    const nextModel = modelIds.includes(sttProviderModel) ? sttProviderModel : candidate;
    if (nextModel && nextModel !== sttProviderModel) {
      setSttProviderModel(nextModel);
    }
  }, [sttProviderInfo, sttProviderConfig, sttProviderModel]);

  // Persist STT provider selection
  useEffect(() => {
    if (!didLoadProviderRef.current) return;
    if (!sttProvider) return;
    const config = sttProviderInfo?.type === "api"
      ? { ...sttProviderConfig, model: sttProviderModel || sttProviderConfig?.model }
      : sttProviderConfig;
    setProvider("stt", sttProvider, config).catch(() => {});
  }, [sttProvider, sttProviderInfo, sttProviderConfig, sttProviderModel]);

  useEffect(() => {
    if (sttProvider !== "faster-whisper") return;
    if (!Object.keys(sttModelInstalled).length) return;

    const currentId = getWhisperModelId(whisperModel);
    if (sttModelInstalled[currentId]) {
      return;
    }

    const fallback = WHISPER_MODEL_OPTIONS.find((option) => sttModelInstalled[getWhisperModelId(option.value)]);
    if (fallback && fallback.value !== whisperModel) {
      setWhisperModel(fallback.value);
    }
  }, [sttModelInstalled, sttProvider, whisperModel]);

  useEffect(() => {
    if (!isApiProvider) return;
    if (engine !== "fast") {
      setEngine("fast");
    }
  }, [isApiProvider, engine]);

  useEffect(() => {
    if (!currentJob || !["downloading", "pending", "transcribing", "diarizing", "cleaning"].includes(currentJob.status)) {
      return;
    }

    let timer: NodeJS.Timeout | null = null;
    const pollTelemetry = async () => {
      try {
        const data = await fetchJson(`${API_BASE}/api/system/telemetry`);
        setTelemetry(data);
        setTelemetryError(null);
      } catch (error) {
        setTelemetryError("Telemetry unavailable");
      }
    };

    pollTelemetry();
    timer = setInterval(pollTelemetry, 3000);

    return () => {
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [currentJob?.status, currentJob?.job_id, fetchJson]);

  const isSupportedMediaFile = useCallback((file: File) => {
    if (file.type) {
      return file.type.startsWith("audio/") || file.type.startsWith("video/");
    }
    const lower = file.name.toLowerCase();
    return SUPPORTED_MEDIA_EXTENSIONS.some((ext) => lower.endsWith(ext));
  }, []);

  const handleFileSelect = useCallback((file: File) => {
    setUploadError(null);

    if (!isSupportedMediaFile(file)) {
      const msg = "Unsupported file type. Use audio or video files (MP3, WAV, M4A, MP4, MKV).";
      setUploadError(msg);
      toast.error("Unsupported file", msg);
      return;
    }

    if (file.size === 0) {
      const msg = "Cannot read file size. Try dragging the file instead of clicking.";
      setUploadError(msg);
      toast.warning("File issue", msg);
      return;
    }

    if (file.size > 4 * 1024 * 1024 * 1024) {
      setUploadError("File too large. Maximum size is 4GB.");
      toast.error("File too large", "Maximum file size is 4GB");
      return;
    }

    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }

    setSelectedFile(file);
    setUploadProgress(0);
    setUploadedBytes(0);
    setUploadSpeedBps(null);
    setUploadEtaSeconds(null);
    uploadStartRef.current = null;
    uploadLastRef.current = null;
    const url = URL.createObjectURL(file);
    setAudioUrl(url);
  }, [audioUrl, isSupportedMediaFile, toast]);

  const dropzoneDisabled =
    isUploading ||
    isImporting ||
    currentJob?.status === "transcribing" ||
    currentJob?.status === "diarizing";

  // Poll for job status using IPC in Electron (all network calls broken in renderer after large uploads)
  useEffect(() => {
    console.log("[Effect] Polling effect triggered, currentJob:", currentJob?.job_id, "status:", currentJob?.status);
    if (currentJob && (currentJob.status === "downloading" || currentJob.status === "pending" || currentJob.status === "transcribing" || currentJob.status === "diarizing")) {
      console.log("[Effect] Starting polling interval for job:", currentJob.job_id);
      pollingRef.current = setInterval(async () => {
        try {
          let status;
          const url = `${API_BASE}/api/transcribe/status/${currentJob.job_id}`;

          // Use IPC in Electron - renderer networking is broken after large uploads
          if (window.electronAPI?.netFetch) {
            const token = window.electronAPI?.authToken;
            const headers: Record<string, string> | undefined = token ? { Authorization: `Bearer ${token}` } : undefined;
            const response = await window.electronAPI.netFetch(url, { method: 'GET', headers });
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}`);
            }
            status = JSON.parse(response.body);
          } else {
            const response = await fetch(url);
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}`);
            }
            status = await response.json();
          }

          console.log(`[Poll] Job ${currentJob.job_id}: status=${status.status}, progress=${status.progress?.toFixed?.(1) || status.progress}%`);
          setCurrentJob(status);

          // Calculate ETA based on real performance
          const now = Date.now();
          const progress = status.progress || 0;
          progressHistoryRef.current.push({ time: now, progress });

          // Keep only last 60 seconds of history for rate calculation
          const cutoff = now - 60000;
          progressHistoryRef.current = progressHistoryRef.current.filter(p => p.time > cutoff);

          // Calculate ETA if we have enough data points
          if (progressHistoryRef.current.length >= 2 && progress > 0 && progress < 100) {
            const oldest = progressHistoryRef.current[0];
            const elapsedMs = now - oldest.time;
            const progressMade = progress - oldest.progress;

            if (progressMade > 0 && elapsedMs > 5000) {
              const ratePerMs = progressMade / elapsedMs;
              const remainingProgress = 100 - progress;
              const etaMs = remainingProgress / ratePerMs;
              setEtaSeconds(Math.round(etaMs / 1000));
            }
          }

          if (status.status === "completed" || status.status === "error") {
            setEtaSeconds(null);
            progressHistoryRef.current = [];
            if (pollingRef.current) {
              clearInterval(pollingRef.current);
              pollingRef.current = null;
            }
            // Show toast notification
            if (status.status === "completed") {
              toast.success('Transcription complete', `${status.segments?.length || 0} segments processed`);
            } else if (status.status === "error") {
              toast.error('Transcription failed', status.error_message || 'An error occurred');
            }
          }
        } catch (error) {
          console.error("Failed to get job status:", error);
        }
      }, 2000);

      return () => {
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      };
    }
  }, [currentJob?.job_id, currentJob?.status]);

  // Cleanup audio URL on unmount
  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  const handleStartTranscription = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setUploadProgress(0);
    setUploadedBytes(0);
    setUploadError(null);

    // Track when upload reaches 100% for fallback polling
    let uploadReached100At: number | null = null;
    let fallbackPollingStarted = false;

    // Fallback: poll for new job if XHR response doesn't come
    // Uses native fetch instead of axios since axios is broken in Electron after large uploads
    const startFallbackPolling = async () => {
      if (fallbackPollingStarted) return;
      fallbackPollingStarted = true;
      console.log("[Upload] Starting fallback polling for job...");
      console.log("[Upload] Looking for file:", selectedFile.name);

      // Poll for up to 2 minutes
      for (let i = 0; i < 60; i++) {
        try {
          console.log(`[Upload] Fallback poll attempt ${i + 1}...`);

          // Use fetchJson (routes via IPC netFetch in Electron when available)
          const data = await fetchJson(`${API_BASE}/api/transcribe/history`);
          const jobs = data.jobs || [];
          console.log(`[Upload] Found ${jobs.length} jobs in history`);

          // Find a job that matches our file (created recently)
          const recentJob = jobs.find((job: TranscriptionJob) => {
            const isRecent = new Date(job.created_at).getTime() > Date.now() - 5 * 60 * 1000;
            const nameMatches = job.filename === selectedFile.name;
            if (job.filename && isRecent) {
              console.log(`[Upload] Checking job ${job.job_id}: filename="${job.filename}", matches=${nameMatches}`);
            }
            return nameMatches && isRecent;
          });

          if (recentJob) {
            console.log("[Upload] Found job via fallback polling:", recentJob.job_id);
            setCurrentJob(recentJob);
            setIsUploading(false);
            return true;
          }
        } catch (e) {
          console.error("[Upload] Fallback poll error:", e);
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      console.error("[Upload] Fallback polling timed out");
      setUploadError("Upload completed but couldn't find job. Please try again.");
      setIsUploading(false);
      return false;
    };

    try {
      console.log("[Upload] Starting upload...");

      // Create upload promise with fallback timeout
      const uploadPromise = uploadForTranscription(
        selectedFile,
        language,
        enableDiarization,
        minSpeakers,
        maxSpeakers,
        whisperModel,
        enableAICleanup,
        diarizationMode,
        engine,
        sttProvider,
        isApiProvider ? sttProviderModel : undefined,
        (progress, loaded) => {
          setUploadProgress(progress);
          setUploadedBytes(loaded);
          const now = Date.now();
          if (!uploadStartRef.current) {
            uploadStartRef.current = now;
          }
          const last = uploadLastRef.current;
          if (last && now > last.time) {
            const deltaBytes = loaded - last.bytes;
            const deltaTime = (now - last.time) / 1000;
            if (deltaBytes > 0 && deltaTime > 0) {
              const speed = deltaBytes / deltaTime;
              setUploadSpeedBps(speed);
              if (selectedFile && selectedFile.size > 0) {
                const remaining = Math.max(0, selectedFile.size - loaded);
                const eta = speed > 0 ? remaining / speed : null;
                setUploadEtaSeconds(eta ? Math.round(eta) : null);
              }
            }
          }
          uploadLastRef.current = { time: now, bytes: loaded };
          if (progress >= 100 && !uploadReached100At) {
            uploadReached100At = Date.now();
            console.log("[Upload] Progress reached 100%, waiting for server response...");

            // Start fallback polling after 15 seconds if no response
            setTimeout(() => {
              if (!fallbackPollingStarted && uploadReached100At) {
                console.log("[Upload] No response after 15s, starting fallback...");
                startFallbackPolling();
              }
            }, 15000);
          }
        }
      );

      const { job_id } = await uploadPromise;

      // If we got here, XHR worked normally
      if (!fallbackPollingStarted) {
        console.log("[Upload] Server responded with job_id:", job_id);
        console.log("[Upload] Calling setCurrentJob with status: pending");
        // Reset ETA tracking for new job
        progressHistoryRef.current = [];
        setEtaSeconds(null);
        setUploadSpeedBps(null);
        setUploadEtaSeconds(null);
        setCurrentJob({
          job_id,
          status: "pending",
          progress: 0,
          current_step: "Starting...",
          total_duration: 0,
          processed_duration: 0,
          segments: [],
          speakers_detected: 0,
          created_at: new Date().toISOString(),
          filename: selectedFile.name,
          file_size_bytes: selectedFile.size,
          enable_diarization: enableDiarization,
          diarization_mode: diarizationMode,
          engine,
        });
        setIsUploading(false);
      }
    } catch (error) {
      // If fallback polling already found the job, ignore this error
      if (fallbackPollingStarted) {
        console.log("[Upload] XHR error ignored, fallback polling active");
        return;
      }
      console.error("[Upload] Failed:", error);
      setUploadError(error instanceof Error ? error.message : "Upload failed");
      setIsUploading(false);
      setUploadSpeedBps(null);
      setUploadEtaSeconds(null);
    }
  };

  const handleImportLink = async (url: string) => {
    if (!url || isImporting) return;

    setIsImporting(true);
    setImportError(null);
    setUploadError(null);
    setSelectedFile(null);
    setUploadProgress(0);
    setUploadedBytes(0);
    setUploadSpeedBps(null);
    setUploadEtaSeconds(null);
    uploadStartRef.current = null;
    uploadLastRef.current = null;

    try {
      const { job_id } = await importTranscriptionFromLink(
        url,
        language,
        enableDiarization,
        minSpeakers,
        maxSpeakers,
        whisperModel,
        enableAICleanup,
        diarizationMode,
        engine,
        sttProvider,
        isApiProvider ? sttProviderModel : undefined
      );

      progressHistoryRef.current = [];
      setEtaSeconds(null);
      setCurrentJob({
        job_id,
        status: "downloading",
        progress: 0,
        current_step: "Downloading media...",
        total_duration: 0,
        processed_duration: 0,
        segments: [],
        speakers_detected: 0,
        created_at: new Date().toISOString(),
        filename: formatLinkLabel(url),
        file_size_bytes: 0,
        enable_diarization: enableDiarization,
        diarization_mode: diarizationMode,
        engine,
        source_url: url,
      });
      setShowImportModal(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to import link";
      setImportError(message);
      setUploadError(message);
    } finally {
      setIsImporting(false);
    }
  };

  const handleSegmentsUpdate = async (segments: TranscriptSegment[]) => {
    if (!currentJob) return;
    try {
      await updateTranscriptSegments(currentJob.job_id, segments);
      setCurrentJob({ ...currentJob, segments });
    } catch (error) {
      console.error("Failed to save segments:", error);
    }
  };

  const handleExport = async (format: "txt" | "srt" | "vtt", includeSpeakers: boolean, includeTimestamps: boolean) => {
    if (!currentJob) return;
    try {
      const blob = await exportTranscript(currentJob.job_id, format, includeSpeakers, includeTimestamps);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${currentJob.filename?.replace(/\.[^/.]+$/, "") || "transcript"}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setShowExportModal(false);
    } catch (error) {
      console.error("Export failed:", error);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setCurrentJob(null);
    setUploadError(null);
    setImportError(null);
    setIsImporting(false);
    setShowImportModal(false);
    setEtaSeconds(null);
    setUploadSpeedBps(null);
    setUploadEtaSeconds(null);
    uploadStartRef.current = null;
    uploadLastRef.current = null;
    progressHistoryRef.current = [];
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  const handleRediarize = async () => {
    if (!currentJob || isRediarizing || !canRediarize) return;
    setIsRediarizing(true);
    try {
      await rediarizeTranscription(currentJob.job_id, {
        min_speakers: minSpeakers,
        max_speakers: maxSpeakers,
        diarization_mode: diarizationMode,
      });
      // Update job status immediately to show progress UI
      setCurrentJob({
        ...currentJob,
        status: "diarizing",
        progress: 0,
        diarization_mode: diarizationMode,
        diarization_method: undefined,
        speakers_detected: 0,
        current_step:
          diarizationMode === "pyannote"
            ? "Starting speaker diarization (AI)..."
            : diarizationMode === "basic"
            ? "Starting speaker diarization (basic)..."
            : "Starting speaker diarization (auto)...",
      });
      // Polling will be handled by the main useEffect since status is now "diarizing"
      // Just need to reset isRediarizing when done
      const checkCompletion = setInterval(async () => {
        try {
          const status = await getTranscriptionStatus(currentJob.job_id);
          if (status.status === "completed" || status.status === "error") {
            clearInterval(checkCompletion);
            setIsRediarizing(false);
          }
        } catch (error) {
          console.error("Polling error:", error);
          clearInterval(checkCompletion);
          setIsRediarizing(false);
        }
      }, 2000);
    } catch (error) {
      console.error("Rediarize failed:", error);
      setIsRediarizing(false);
    }
  };

  const [isCancelling, setIsCancelling] = useState(false);

  const handleCancel = async () => {
    if (!currentJob || isCancelling) return;
    setIsCancelling(true);
    try {
      const result = await cancelTranscriptionJob(currentJob.job_id);
      if (result.cancelled) {
        setCurrentJob({ ...currentJob, status: "cancelled", current_step: "Cancelled by user" });
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      }
    } catch (error) {
      console.error("Failed to cancel:", error);
    } finally {
      setIsCancelling(false);
    }
  };

  const [isPausing, setIsPausing] = useState(false);

  const handlePause = async () => {
    if (!currentJob || isPausing) return;
    setIsPausing(true);
    try {
      const result = await pauseTranscriptionJob(currentJob.job_id);
      if (result.paused) {
        setCurrentJob({
          ...currentJob,
          status: "paused",
          current_step: `Paused - ${result.segments_saved} segments saved`
        });
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      }
    } catch (error) {
      console.error("Failed to pause:", error);
    } finally {
      setIsPausing(false);
    }
  };

  const [isResuming, setIsResuming] = useState(false);

  const handleResume = async () => {
    if (!currentJob || isResuming) return;
    setIsResuming(true);
    setUploadError(null);
    try {
      const result = await resumeTranscriptionJob(currentJob.job_id);
      if (result.resumed) {
        setCurrentJob({
          ...currentJob,
          status: "transcribing",
          current_step: `Resuming from ${result.resume_from_time?.toFixed(0)}s...`
        });
        // Polling will restart automatically due to status change
      } else if (result.reason?.includes("transcribing")) {
        // Job is already running - just refresh status
        const status = await getTranscriptionStatus(currentJob.job_id);
        setCurrentJob(status);
      } else {
        setUploadError(result.reason || "Failed to resume");
      }
    } catch (error) {
      console.error("Failed to resume:", error);
      setUploadError("Failed to resume transcription. Check console for details.");
    } finally {
      setIsResuming(false);
    }
  };

  const isProcessing = currentJob?.status === "downloading" || currentJob?.status === "pending" || currentJob?.status === "transcribing" || currentJob?.status === "diarizing" || currentJob?.status === "cleaning";
  const showUploadView = !currentJob || currentJob.status === "error";

  const uploadActions = showUploadView ? (
    <ActionBar
      primary={{
        label: "Transcribe Audio",
        icon: Zap,
        onClick: handleStartTranscription,
        disabled: !selectedFile || isUploading,
      }}
      loading={isUploading}
      loadingText={`Uploading... ${uploadProgress}%`}
      pulse={!!selectedFile && !isUploading}
    />
  ) : undefined;

  const engineSelector = showUploadView && showEngineSelector ? (
    <UnifiedProviderSelector
      service="stt"
      selected={sttProvider}
      onSelect={setSttProvider}
      selectedModel={sttProviderModel}
      onModelChange={setSttProviderModel}
      onProviderInfoChange={(info) => setSttProviderInfo(info as ServiceProviderInfo | null)}
      variant="dropdown"
      allowedTypes={["local", "api"]}
      showModelSelector={isApiProvider}
      label="STT Engine"
    />
  ) : undefined;

  const settingsContent = showUploadView ? (
    <div className="space-y-8">
      <div className="space-y-6">
        <h3 className="text-[11px] uppercase tracking-[0.2em] text-foreground-muted/70 font-semibold pl-1">
          Configuration
        </h3>

        <SelectMenu
          label="Source Language"
          value={language}
          onChange={setLanguage}
          options={LANGUAGE_OPTIONS}
          className="space-y-2"
          buttonClassName="h-12 rounded-lg bg-surface-2/60 border border-surface-3 text-sm tracking-wide"
        />

        {!isApiProvider && showEngineSelector && modelPrecisionOptions.length > 0 && (
          <div className="space-y-3">
            <label className="block text-foreground-muted text-sm pl-1">Model Precision</label>
            <div className="grid grid-cols-3 gap-3">
              {modelPrecisionOptions.map((option) => {
                const isSelected = whisperModel === option.value;
                const isDisabled = "disabled" in option ? option.disabled : false;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setWhisperModel(option.value)}
                    disabled={isDisabled}
                    className={cn(
                      "rounded-lg border border-surface-3 bg-surface-2/60 py-3 text-center text-xs font-medium tracking-wide transition-all",
                      isSelected
                        ? "border-accent-primary/50 bg-accent-primary/5 text-accent-primary shadow-glow"
                        : "text-foreground-muted hover:border-surface-2",
                      isDisabled && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="space-y-3">
          <label className="block text-foreground-muted text-sm pl-1">Engine</label>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setEngine("fast")}
              disabled={isApiProvider}
              className={cn(
                "rounded-lg border border-surface-3 bg-surface-2/60 px-3 py-3 text-left text-xs tracking-wide transition-all",
                engine === "fast"
                  ? "border-accent-primary/50 bg-accent-primary/5 text-accent-primary shadow-glow"
                  : "text-foreground-muted hover:border-surface-2",
                isApiProvider && "opacity-50 cursor-not-allowed"
              )}
            >
              <div className="font-medium text-sm">Fast</div>
              <div className="text-[11px] opacity-70">Segment-level speakers</div>
            </button>
            <button
              onClick={() => setEngine("accurate")}
              disabled={isApiProvider || !engineStatus?.engines?.accurate?.available}
              className={cn(
                "rounded-lg border border-surface-3 bg-surface-2/60 px-3 py-3 text-left text-xs tracking-wide transition-all",
                engine === "accurate"
                  ? "border-accent-secondary/50 bg-accent-secondary/5 text-accent-secondary shadow-glow"
                  : "text-foreground-muted hover:border-surface-2",
                (isApiProvider || !engineStatus?.engines?.accurate?.available) &&
                  "opacity-50 cursor-not-allowed"
              )}
            >
              <div className="font-medium text-sm">Accurate</div>
              <div className="text-[11px] opacity-70">Word-level speakers</div>
            </button>
          </div>
          {isApiProvider && (
            <p className="text-xs text-foreground-muted/80">
              API provider selected. Engine selection is disabled for cloud transcription.
            </p>
          )}
          {engine === "accurate" && (
            <p className="text-xs text-accent-secondary/80">
              Uses WhisperX for precise word alignment and per-word speaker detection
            </p>
          )}
          {!isApiProvider && !engineStatus?.engines?.accurate?.available && (
            <p className="text-xs text-foreground-muted/70">
              WhisperX not available. Enable advanced packages in Settings.
            </p>
          )}
        </div>
      </div>

      <div className="h-px bg-surface-3/60 w-full" />

      <div className="space-y-5">
        <h3 className="text-[11px] uppercase tracking-[0.2em] text-foreground-muted/70 font-semibold pl-1">
          Processing Options
        </h3>

        <div className="flex items-center justify-between py-1">
          <div className="flex flex-col gap-1">
            <span className="text-sm text-foreground">Speaker Diarization</span>
            <span className="text-xs text-foreground-muted">Identify individual speakers</span>
          </div>
          <Toggle enabled={enableDiarization} onChange={setEnableDiarization} size="sm" />
        </div>

        {enableDiarization && diarizationStatus && (
          <div className={cn("text-xs px-2 py-1.5 rounded", diarizationStatusTone)}>
            <div className="flex items-center gap-1.5">
              <div className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", diarizationStatusDot)} />
              {diarizationStatusText}
            </div>
            {showPyannoteSetup && (
              <button
                onClick={() => setShowPyannoteWizard(true)}
                className="mt-1.5 text-[11px] text-amber-300 hover:text-amber-200 underline underline-offset-2 transition-colors"
              >
                Setup AI detection for better accuracy
              </button>
            )}
          </div>
        )}

        {enableDiarization && (
          <SelectMenu
            label="Diarization mode"
            value={diarizationMode}
            options={diarizationModeOptions}
            onChange={(value) => setDiarizationMode(value as DiarizationMode)}
            buttonClassName="py-2 text-sm"
          />
        )}

        <div className="flex items-center justify-between py-1">
          <div className="flex flex-col gap-1">
            <span className="text-sm text-foreground">Smart Formatting</span>
            <span className="text-xs text-foreground-muted">Auto-punctuation & casing</span>
          </div>
          <Toggle enabled={enableAICleanup} onChange={setEnableAICleanup} size="sm" />
        </div>

        <div className="flex items-center justify-between py-1">
          <div className="flex flex-col gap-1">
            <span className="text-sm text-foreground">Time Stamps</span>
            <span className="text-xs text-foreground-muted">Include timecodes</span>
          </div>
          <Toggle enabled={includeTimestamps} onChange={setIncludeTimestamps} size="sm" />
        </div>
      </div>

      <div className="h-px bg-surface-3/60 w-full" />

      <div className="space-y-3">
        <label className="text-foreground-muted text-sm pl-1 flex items-center justify-between">
          <span>Context Prompt</span>
          <span className="text-[11px] text-foreground-muted/60">Optional</span>
        </label>
        <textarea
          className="w-full rounded-lg border border-surface-3 bg-surface-2/60 px-4 py-3 text-foreground placeholder:text-foreground-muted/50 focus:border-accent-primary focus:ring-0 focus:bg-surface-2/80 text-sm tracking-wide min-h-[100px] resize-none transition-colors"
          placeholder="Add specific technical terms, names, or formatting instructions..."
          value={contextPrompt}
          onChange={(e) => setContextPrompt(e.target.value)}
        />
      </div>

      <div className="pt-2">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center justify-between w-full text-left"
        >
          <span className="text-sm font-medium text-foreground">Advanced settings</span>
          {showAdvanced ? (
            <ChevronUp className="w-4 h-4 text-foreground-muted" />
          ) : (
            <ChevronDown className="w-4 h-4 text-foreground-muted" />
          )}
        </button>

        {showAdvanced && (
          <div className="mt-4 space-y-4">
            {enableDiarization && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-foreground-muted mb-1">Min speakers</label>
                  <input
                    type="number"
                    min={1}
                    max={maxSpeakers}
                    value={minSpeakers}
                    onChange={(e) => setMinSpeakers(parseInt(e.target.value) || 1)}
                    className="input w-full text-sm py-1"
                  />
                </div>
                <div>
                  <label className="block text-xs text-foreground-muted mb-1">Max speakers</label>
                  <input
                    type="number"
                    min={minSpeakers}
                    max={20}
                    value={maxSpeakers}
                    onChange={(e) => setMaxSpeakers(parseInt(e.target.value) || 10)}
                    className="input w-full text-sm py-1"
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3">
              <SelectMenu
                label="Thermal mode"
                value={safetySettings.mode}
                options={SAFETY_MODE_OPTIONS}
                onChange={(value) =>
                  saveSafetySettings({
                    ...safetySettings,
                    mode: value as DiarizationSafetyMode,
                  })
                }
                buttonClassName="py-2 text-sm"
              />
              <SelectMenu
                label="Device"
                value={safetySettings.device}
                options={SAFETY_DEVICE_OPTIONS}
                onChange={(value) =>
                  saveSafetySettings({
                    ...safetySettings,
                    device: value as DiarizationDevice,
                  })
                }
                buttonClassName="py-2 text-sm"
              />
            </div>

            <p className="text-xs text-foreground-muted">
              {safetySettings.device === "gpu"
                ? "GPU diarization is enabled. Use at your own risk."
                : "GPU diarization is off by default for stability. Enable at your own risk."}
            </p>
          </div>
        )}
      </div>
    </div>
  ) : undefined;

  return (
    <>
      <div className="px-8 lg:px-16 py-12 page-premium">
      <ModuleShell
        title="New Transcription"
        description="Audio processing suite v2.4"
        layout={showUploadView ? "default" : "wide"}
        settingsPosition="right"
        settingsTitle=""
        engineSelector={engineSelector}
        settings={settingsContent}
        actions={uploadActions}
        main={
          <div className="space-y-8">
            {showUploadView ? (
              <div className="space-y-6">
                <Dropzone
                  onFile={handleFileSelect}
                  accept="audio/*,video/*"
                  fileType="any"
                  maxSize={2 * 1024 * 1024 * 1024}
                  uploading={isUploading}
                  uploadProgress={uploadProgress}
                  error={uploadError}
                  disabled={dropzoneDisabled}
                  title="Drop audio files to upload"
                  subtitle="MP3, WAV, M4A, FLAC (Max 2GB)"
                  variant="bare"
                  className="p-0"
                />

                {selectedFile && (
                  <div className="group relative pl-4 border-l border-surface-3/60 hover:border-accent-primary/60 transition-colors py-2">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-4">
                        <div className="bg-surface-2/80 w-10 h-10 flex items-center justify-center rounded-lg text-accent-primary border border-surface-3">
                          <FileAudio className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-foreground text-sm font-medium tracking-wide">{selectedFile.name}</p>
                          <p className="text-foreground-muted text-xs tracking-wide opacity-60 mt-0.5">
                            {formatFileSize(selectedFile.size)}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={handleReset}
                        className="text-foreground-muted hover:text-red-400 transition-colors text-sm opacity-70 hover:opacity-100"
                        aria-label="Remove file"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex-1 h-[2px] bg-surface-3/60 overflow-hidden rounded-full">
                        <div
                          className="h-full bg-accent-primary shadow-glow transition-all duration-300"
                          style={{ width: `${uploadProgress || 0}%` }}
                        />
                      </div>
                      <span className="text-foreground-muted text-xs font-mono opacity-70">
                        {uploadProgress || 0}%
                      </span>
                    </div>
                    {(uploadSpeedBps || uploadEtaSeconds) && (
                      <div className="flex justify-between text-[11px] text-foreground-muted/70 mt-2">
                        <span>{formatSpeed(uploadSpeedBps) || "Calculating speed..."}</span>
                        {uploadEtaSeconds ? <span>ETA {formatEta(uploadEtaSeconds)}</span> : <span />}
                      </div>
                    )}
                    {uploadProgress >= 100 && (
                      <div className="flex items-center gap-2 text-[11px] text-amber-300 pt-2">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>Server processing file... (large files may take several minutes)</span>
                      </div>
                    )}
                    <div className="absolute -left-[5px] top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-background border border-accent-primary rounded-full hidden group-hover:block" />
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-4">
                  <button
                    type="button"
                    onClick={() => {
                      setImportError(null);
                      setShowImportModal(true);
                    }}
                    disabled={isUploading || isImporting}
                    className="text-xs tracking-[0.2em] uppercase font-medium text-accent-primary hover:text-white transition-colors"
                  >
                    Import from link
                  </button>
                  <span className="text-xs text-foreground-muted">
                    YouTube, Dropbox, Google Drive, Vimeo, X, and direct URLs
                  </span>
                </div>

                <details className="group open:bg-transparent" open>
                  <summary className="flex cursor-pointer items-center gap-3 text-sm text-foreground-muted hover:text-foreground transition-colors select-none mb-4 list-none outline-none">
                    <ChevronRight className="w-4 h-4 transition-transform group-open:rotate-90" />
                    <span className="font-medium tracking-wide">Live Audio Analysis</span>
                  </summary>
                  <div className="h-32 w-full rounded-xl bg-surface-2/40 border border-surface-3/60 flex items-center justify-center relative overflow-hidden backdrop-blur-sm">
                    <div className="flex items-center justify-center gap-1 h-16 w-full px-8 opacity-60">
                      {[4, 8, 6, 10, 5, 3, 8, 12, 6, 4, 8, 6, 10, 5, 3, 8, 16, 6, 4, 8, 6, 10, 5, 3, 8, 12, 6, 4, 8, 6, 10, 5, 3, 8, 12, 6].map((height, idx) => (
                        <div
                          key={`bar-${idx}`}
                          className="w-0.5 bg-accent-primary rounded-full opacity-70"
                          style={{ height: `${height}px` }}
                        />
                      ))}
                    </div>
                    <div className="absolute bottom-3 right-4 text-[10px] text-foreground-muted/50 font-mono">
                      44.1kHz • Stereo
                    </div>
                  </div>
                </details>

                {currentJob?.status === "error" && (
                  <div className="glass-card p-4 border-red-500/30 bg-red-500/10 text-red-300">
                    <div className="flex items-center gap-3">
                      <AlertCircle className="w-5 h-5 flex-shrink-0" />
                      <div>
                        <p className="font-medium">Transcription failed</p>
                        <p className="text-red-300/70 text-sm">{currentJob.error || "Unknown error"}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : isProcessing || currentJob?.status === "cancelled" || currentJob?.status === "paused" ? (
        // Processing View with Live Preview
        <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-6">
          {/* Progress Panel */}
          <div className="glass-card p-6">
            <div className="space-y-5">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-full bg-accent-primary/15 flex items-center justify-center flex-shrink-0">
                  {currentJob?.status === "cancelled" ? (
                    <XCircle className="w-7 h-7 text-amber-400" />
                  ) : currentJob?.status === "paused" ? (
                    <Pause className="w-7 h-7 text-blue-400" />
                  ) : (
                    <Loader2 className="w-7 h-7 text-accent-primary animate-spin" />
                  )}
                </div>

                <div>
                  <h2 className="text-lg font-semibold text-slate-100 mb-1">
                    {currentJob?.status === "downloading" && "Downloading..."}
                    {currentJob?.status === "pending" && "Preparing..."}
                    {currentJob?.status === "transcribing" && "Transcribing..."}
                    {currentJob?.status === "diarizing" && "Identifying speakers..."}
                    {currentJob?.status === "cleaning" && "Cleaning up with AI..."}
                    {currentJob?.status === "cancelled" && "Cancelled"}
                    {currentJob?.status === "paused" && "Paused"}
                  </h2>
                  <p className="text-sm text-slate-400">{currentJob?.current_step || "Processing audio..."}</p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-white/10 rounded-full h-2.5 overflow-hidden">
                <div
                  className={cn(
                    "h-full transition-all duration-500",
                    currentJob?.status === "cancelled"
                      ? "bg-amber-500"
                      : currentJob?.status === "paused"
                      ? "bg-blue-500"
                      : "bg-gradient-to-r from-accent-primary to-accent-secondary"
                  )}
                  style={{ width: `${currentJob?.progress || 0}%` }}
                />
              </div>

              {phaseInfo && phaseInfo.phaseProgress !== null && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>{phaseInfo?.phaseLabel} progress</span>
                    <span>{phaseInfo?.phaseProgress?.toFixed(0)}%</span>
                  </div>
                  <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="h-full bg-accent-primary/80 transition-all duration-500"
                      style={{ width: `${phaseInfo?.phaseProgress || 0}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-between text-xs text-slate-400">
                <span>{typeof currentJob?.progress === 'number' ? currentJob.progress.toFixed(1) : currentJob?.progress}%</span>
                <span className="flex items-center gap-2">
                  {typeof currentJob?.elapsed_seconds === "number" && currentJob.elapsed_seconds > 0 && (
                    <span>Elapsed {formatDuration(currentJob.elapsed_seconds)}</span>
                  )}
                  {etaSeconds !== null && etaSeconds > 0 && currentJob?.status !== "cancelled" && (
                    <span className="text-accent-primary">{formatEta(etaSeconds)}</span>
                  )}
                  {(() => {
                    const totalDuration = currentJob?.total_duration;
                    if (typeof totalDuration === "number" && totalDuration > 0) {
                      return <span>{formatDuration(totalDuration)}</span>;
                    }
                    return null;
                  })()}
                </span>
              </div>

              <div className="text-xs text-slate-400">
                <span className="text-slate-200">Engine:</span> {engineLabel}
                <span className="mx-2 text-slate-500">•</span>
                <span className="text-slate-200">Speakers:</span>{" "}
                {currentJob?.enable_diarization === false ? "Off" : diarizationModeLabel}
                {effectiveSpeakersDetected > 0 && (
                  <>
                    <span className="mx-2 text-slate-500">•</span>
                    <span className="text-slate-200">Detected:</span> {effectiveSpeakersDetected}
                  </>
                )}
              </div>

              {/* File info */}
              <div className="pt-3 border-t border-white/10 text-xs text-slate-400">
                <span className="text-slate-100">
                  {currentJob?.filename}
                  {currentJob?.file_size_bytes && (
                    <span className="text-slate-400"> ({formatFileSize(currentJob.file_size_bytes)})</span>
                  )}
                </span>
              </div>

              {/* Pause / Resume / Cancel buttons */}
              <div className="flex gap-2 pt-2">
                {isProcessing ? (
                  <>
                    {/* Pause button during processing */}
                    <button
                      onClick={handlePause}
                      disabled={isPausing}
                      className="btn btn-primary flex-1 text-sm py-2"
                    >
                      {isPausing ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Pausing...</>
                      ) : (
                        <><Pause className="w-4 h-4" /> Pause</>
                      )}
                    </button>
                    {/* Cancel button (secondary) */}
                    <button
                      onClick={handleCancel}
                      disabled={isCancelling}
                      className="btn btn-ghost text-sm py-2"
                      title="Cancel and discard"
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  </>
                ) : currentJob?.status === "paused" || currentJob?.status === "interrupted" ? (
                  <>
                    {/* Resume button for paused/interrupted */}
                    <button
                      onClick={handleResume}
                      disabled={isResuming}
                      className="btn btn-primary flex-1 text-sm py-2"
                    >
                      {isResuming ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Resuming...</>
                      ) : (
                        <><Play className="w-4 h-4" /> Resume</>
                      )}
                    </button>
                    <button onClick={handleReset} className="btn btn-secondary text-sm py-2">
                      New
                    </button>
                  </>
                ) : (
                  <button onClick={handleReset} className="btn btn-primary flex-1 text-sm py-2">
                    Start New Transcription
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Live Preview Panel */}
          <div className="glass-card p-4">
            <div className="flex items-center gap-2 pb-2 border-b border-white/10">
              <Eye className="w-4 h-4 text-accent-primary" />
              <span className="text-sm font-medium text-slate-100">Live Preview</span>
              <div className="ml-auto flex items-center gap-2">
                {previewTotal > 0 && (
                  <span className="text-xs text-slate-400">
                    {previewIsTruncated
                      ? `Showing last ${previewSegments.length} of ${previewTotal}`
                      : `${previewTotal} segments`}
                  </span>
                )}
                {previewTotal > PREVIEW_SEGMENT_LIMIT && showPreview && (
                  <button
                    onClick={() => setShowFullPreview(!showFullPreview)}
                    className="text-xs text-slate-400 hover:text-slate-100 transition-colors"
                  >
                    {showFullPreview ? "Show less" : "Show all"}
                  </button>
                )}
                <button
                  onClick={() => setShowPreview(!showPreview)}
                  className="text-xs text-slate-400 hover:text-slate-100 transition-colors flex items-center gap-1"
                >
                  {showPreview ? "Hide" : "Show"}
                  {showPreview ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              </div>
            </div>

            {showPreview && (
              <div className="mt-3 flex flex-col max-h-[420px]">
                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                  {(!currentJob?.segments || currentJob.segments.length === 0) ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400">
                      <div className="flex gap-1 mb-2">
                        <div className="w-2 h-2 bg-accent-primary/40 rounded-full animate-pulse" />
                        <div className="w-2 h-2 bg-accent-primary/40 rounded-full animate-pulse delay-75" />
                        <div className="w-2 h-2 bg-accent-primary/40 rounded-full animate-pulse delay-150" />
                      </div>
                      <p className="text-sm">Waiting for transcription...</p>
                      <p className="text-xs mt-1 opacity-60">Text will appear here as it's transcribed</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {/* Transcribed text as flowing paragraphs - easy to select and copy */}
                      <div className="text-sm text-slate-100 leading-relaxed select-text">
                        {previewText}
                      </div>

                      {currentJob?.status === "diarizing" && (
                        <p className="text-xs text-slate-400">
                          Speaker labels appear as diarization assigns them. The preview refreshes during this step.
                        </p>
                      )}

                      {/* Encrypted/pending indicator - separate element, not selectable */}
                      {currentJob?.status === "transcribing" && progressValue !== null && progressValue < 80 && (
                        <div className="select-none pointer-events-none">
                          <div className="inline-flex items-center gap-1 text-accent-primary/70 animate-pulse">
                            <Loader2 className="w-3 h-3 animate-spin" />
                          </div>
                          <span className="ml-2 font-mono text-sm tracking-wider select-none" style={{
                            background: "linear-gradient(90deg, rgba(108,168,255,0.35) 0%, rgba(108,168,255,0.15) 50%, transparent 100%)",
                            WebkitBackgroundClip: "text",
                            WebkitTextFillColor: "transparent",
                            filter: "blur(1px)"
                          }}>
                            ████████ ██████ ████ ██████████ ███████ ████ ██████ █████████...
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : currentJob.status === "completed" || currentJob.status === "interrupted" ? (
        // Editor View (also for interrupted jobs with partial segments)
        <div className="space-y-6">
          {/* Interrupted job warning banner */}
          {currentJob.status === "interrupted" && (
            <div className="glass-card p-4 border-amber-500/30 bg-amber-500/10">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-amber-300 font-medium">Transcription Interrupted</p>
                  <p className="text-sm text-amber-300/70 mt-1">
                    This transcription was interrupted at {currentJob.progress?.toFixed(0) || 0}%.
                    {(() => {
                      const savedSegments = currentJob?.segments?.length ?? 0;
                      return savedSegments > 0
                        ? ` ${savedSegments} segments were saved and can be viewed below.`
                        : " No segments were saved.";
                    })()}
                  </p>
                  <button
                    onClick={handleReset}
                    className="btn btn-secondary mt-3 text-sm py-1.5"
                  >
                    Start New Transcription
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Audio player */}
          {audioUrl && (
            <div className="glass-card p-4">
              <audio
                ref={audioRef}
                src={audioUrl}
                controls
                className="w-full"
              />
            </div>
          )}

          {currentJob.diarization_error && (
            <div className="glass-card p-4 border-amber-500/30 bg-amber-500/10 flex items-start gap-3 select-text cursor-text">
              <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-300">
                <div className="font-medium">Diarization failed</div>
                <div className="opacity-80 whitespace-pre-wrap">{currentJob.diarization_error}</div>
              </div>
            </div>
          )}

          {currentJob.thermal_guard?.paused && (
            <div className="glass-card p-4 border-amber-500/30 bg-amber-500/10 flex items-start gap-3 select-text cursor-text">
              <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-300">
                <div className="font-medium">Thermal guard paused diarization</div>
                {currentJob.thermal_guard.reason && (
                  <div className="opacity-80 whitespace-pre-wrap">{currentJob.thermal_guard.reason}</div>
                )}
              </div>
            </div>
          )}

          <div className="glass-card p-4 flex flex-wrap items-center gap-3">
            <SelectMenu
              label="Re-diarize mode"
              value={diarizationMode}
              options={diarizationModeOptions}
              onChange={(value) => setDiarizationMode(value as DiarizationMode)}
              buttonClassName="py-2 text-sm"
              className="min-w-[220px]"
            />
            <div className="flex items-center gap-3">
              <div className="min-w-[120px]">
                <label className="block text-xs text-slate-400 mb-1">Min speakers</label>
                <input
                  type="number"
                  min={1}
                  max={maxSpeakers}
                  value={minSpeakers}
                  onChange={(e) => setMinSpeakers(parseInt(e.target.value) || 1)}
                  className="input w-full text-sm py-1"
                />
              </div>
              <div className="min-w-[120px]">
                <label className="block text-xs text-slate-400 mb-1">Max speakers</label>
                <input
                  type="number"
                  min={minSpeakers}
                  max={20}
                  value={maxSpeakers}
                  onChange={(e) => setMaxSpeakers(parseInt(e.target.value) || 10)}
                  className="input w-full text-sm py-1"
                />
              </div>
            </div>
            {showPyannoteSetup && (
              <button
                onClick={() => setShowPyannoteWizard(true)}
                className="btn btn-secondary text-sm"
              >
                Setup AI detection
              </button>
            )}
            <span className="text-xs text-slate-400">
              Applies to the re-diarize action.
            </span>
          </div>

          <div className="glass-card p-4">
            <button
              type="button"
              onClick={() => setShowSystemDetails(!showSystemDetails)}
              className="flex items-center justify-between w-full text-left"
            >
              <span className="text-sm font-medium text-slate-200">System & cache</span>
              {showSystemDetails ? (
                <ChevronUp className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              )}
            </button>

            {showSystemDetails && (
              <div className="mt-4 space-y-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                  <Thermometer className="w-4 h-4 text-accent-primary" />
                  <span className="text-sm text-slate-400">{hotspotLabel}</span>
                  <span className={cn("text-sm font-semibold", hotspotTone)}>
                    {typeof hotspot === "number" ? `${hotspot.toFixed(1)}°C` : "N/A"}
                  </span>
                  {primaryGpu?.temperature?.core_c != null && (
                    <span className="text-xs text-slate-400">
                      Core {primaryGpu.temperature.core_c.toFixed(0)}°C
                    </span>
                  )}
                  {primaryGpu?.temperature?.memory_c != null && (
                    <span className="text-xs text-slate-400">
                      Mem {primaryGpu.temperature.memory_c.toFixed(0)}°C
                    </span>
                  )}
                  {telemetry?.gpu?.available === false && (
                    <span className="text-xs text-slate-400">
                      {telemetry.gpu.reason || "Telemetry unavailable"}
                    </span>
                  )}
                  {telemetryError && telemetry?.gpu?.available !== false && (
                    <span className="text-xs text-slate-400">{telemetryError}</span>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <SelectMenu
                    label="Thermal mode"
                    value={safetySettings.mode}
                    options={SAFETY_MODE_OPTIONS}
                    onChange={(value) =>
                      saveSafetySettings({
                        ...safetySettings,
                        mode: value as DiarizationSafetyMode,
                      })
                    }
                    buttonClassName="py-2 text-sm"
                  />
                  <SelectMenu
                    label="Device"
                    value={safetySettings.device}
                    options={SAFETY_DEVICE_OPTIONS}
                    onChange={(value) =>
                      saveSafetySettings({
                        ...safetySettings,
                        device: value as DiarizationDevice,
                      })
                    }
                    buttonClassName="py-2 text-sm"
                  />
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Shield className="w-4 h-4 text-accent-primary" />
                  <span>Thermal guard</span>
                </div>
                <div className="text-xs text-slate-400">
                  {safetySettings.device === "gpu"
                    ? "GPU diarization is enabled. Use at your own risk."
                    : "GPU diarization is off by default for stability. Enable at your own risk."}
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                  <span>
                    Audio cache:{" "}
                    {audioCacheStatus
                      ? `${audioCacheStatus.total_gb} GB (${audioCacheStatus.count} files)`
                      : "Loading..."}
                  </span>
                  {audioCacheStatus && (
                    <span>
                      Auto-prune: {audioCacheStatus.max_age_days} days / {audioCacheStatus.max_size_gb} GB
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={handleClearAudioCache}
                    disabled={isClearingCache}
                    className="btn btn-secondary text-xs py-1 px-2"
                  >
                    {isClearingCache ? "Clearing..." : "Clear cache"}
                  </button>
                </div>

                {telemetry?.gpu?.available === false && (
                  <div className="text-xs text-amber-300">
                    GPU telemetry unavailable. Thermal guard forces CPU-only safe mode.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Transcript Editor */}
          <TranscriptEditor
            segments={currentJob.segments ?? []}
            speakersDetected={effectiveSpeakersDetected}
            diarizationMethod={currentJob.diarization_method}
            canRediarize={canRediarize}
            rediarizeLabel={rediarizeLabel}
            rediarizeTitle={rediarizeTitle}
            audioRef={audioRef}
            onSegmentsChange={handleSegmentsUpdate}
            onExport={() => setShowExportModal(true)}
            onReset={handleReset}
            onRediarize={handleRediarize}
            isRediarizing={isRediarizing}
            title={currentJob.filename?.replace(/\.[^/.]+$/, "")}
            createdAt={currentJob.created_at}
            elapsedSeconds={currentJob.elapsed_seconds}
          />

          {/* Export Modal */}
          {showExportModal && (
            <ExportModal
              onExport={handleExport}
              onClose={() => setShowExportModal(false)}
            />
          )}

        </div>
      ) : null}
          </div>
        }
      />
      </div>

      {/* Import Link Modal */}
      {showImportModal && (
        <ImportLinkModal
          onImport={handleImportLink}
          onClose={() => {
            setShowImportModal(false);
            setImportError(null);
          }}
          isImporting={isImporting}
          error={importError}
        />
      )}

      {/* Pyannote Setup Wizard */}
      {diarizationStatus && (
        <PyannoteSetupWizard
          isOpen={showPyannoteWizard}
          onClose={() => setShowPyannoteWizard(false)}
          onComplete={refreshDiarizationStatus}
          initialStatus={diarizationStatus}
        />
      )}
    </>
  );
}

// Wrap in Suspense for useSearchParams (required by Next.js 16+)
export default function TranscribePage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-accent-primary" />
      </div>
    }>
      <TranscribePageContent />
    </Suspense>
  );
}
