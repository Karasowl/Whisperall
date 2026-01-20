"use client";

import { useState, useCallback, useRef, useEffect, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useDropzone } from "react-dropzone";
import {
  Upload,
  FileAudio,
  Loader2,
  AlertCircle,
  Users,
  Sparkles,
  Thermometer,
  Shield,
  CheckCircle2,
  Wand2,
  XCircle,
  Eye,
  Pause,
  Play,
  Link2,
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
import { cn } from "@/lib/utils";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const LANGUAGE_OPTIONS = [
  { value: "auto", label: "Auto-detect" },
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "it", label: "Italian" },
  { value: "pt", label: "Portuguese" },
  { value: "ru", label: "Russian" },
  { value: "zh", label: "Chinese" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "ar", label: "Arabic" },
  { value: "hi", label: "Hindi" },
];

const WHISPER_MODEL_OPTIONS = [
  { value: "tiny", label: "Tiny", description: "Fastest, less accurate" },
  { value: "base", label: "Base", description: "Good balance" },
  { value: "small", label: "Small", description: "Better accuracy" },
  { value: "medium", label: "Medium", description: "High accuracy" },
  { value: "large-v3", label: "Large V3", description: "Best accuracy" },
  { value: "distil-large-v3", label: "Distil Large V3", description: "Near-large accuracy, faster" },
];

const DIARIZATION_MODE_OPTIONS: { value: DiarizationMode; label: string; description: string }[] = [
  {
    value: "auto",
    label: "Auto",
    description: "Prefer AI if available, otherwise use basic clustering",
  },
  {
    value: "pyannote",
    label: "AI (pyannote)",
    description: "Best accuracy, requires HuggingFace access",
  },
  {
    value: "basic",
    label: "Basic",
    description: "No HuggingFace token required",
  },
];

type DiarizationSafetyMode = "safe" | "balanced" | "performance";
type DiarizationDevice = "cpu" | "gpu" | "auto";

type DiarizationSafetySettings = {
  mode: DiarizationSafetyMode;
  device: DiarizationDevice;
};

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

const SAFETY_MODE_OPTIONS: { value: DiarizationSafetyMode; label: string; description: string }[] = [
  { value: "safe", label: "Laptop-safe", description: "Cooler, slower, lower spikes" },
  { value: "balanced", label: "Balanced", description: "Moderate load and speed" },
  { value: "performance", label: "Performance", description: "Fastest, hottest" },
];

const SAFETY_DEVICE_OPTIONS: { value: DiarizationDevice; label: string; description: string }[] = [
  { value: "cpu", label: "CPU only", description: "Lowest GPU heat" },
  { value: "gpu", label: "GPU", description: "Faster, hotter" },
  { value: "auto", label: "Auto", description: "Let backend decide" },
];

const PREVIEW_SEGMENT_LIMIT = 200;

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

function formatEta(seconds: number): string {
  if (seconds < 60) {
    return `~${seconds}s`;
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `~${hours}h ${minutes}min`;
  }
  return `~${minutes} min`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatLinkLabel(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    const pathParts = parsed.pathname.split("/").filter(Boolean);
    const last = pathParts[pathParts.length - 1];
    if (last) {
      return `${host}/${last}`;
    }
    return host || "Imported link";
  } catch {
    return "Imported link";
  }
}

function isAbsolutePath(filePath: string): boolean {
  if (filePath.startsWith("/") || filePath.startsWith("\\")) {
    return true;
  }
  return /^[a-zA-Z]:[\\/]/.test(filePath);
}

function TranscribePageContent() {
  const searchParams = useSearchParams();

  // File state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Settings
  const [language, setLanguage] = useState("auto");
  const [whisperModel, setWhisperModel] = useState("base");
  const [engine, setEngine] = useState<TranscriptionEngine>("fast");
  const [engineStatus, setEngineStatus] = useState<EngineStatus | null>(null);
  const [enableDiarization, setEnableDiarization] = useState(true);
  const [diarizationMode, setDiarizationMode] = useState<DiarizationMode>("auto");
  const [minSpeakers, setMinSpeakers] = useState(1);
  const [maxSpeakers, setMaxSpeakers] = useState(10);
  const [enableAICleanup, setEnableAICleanup] = useState(false);
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
  const didLoadProviderRef = useRef(false);
  const [sttModelInstalled, setSttModelInstalled] = useState<Record<string, boolean>>({});

  // Job state
  const [currentJob, setCurrentJob] = useState<TranscriptionJob | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedBytes, setUploadedBytes] = useState(0);
  const [isRediarizing, setIsRediarizing] = useState(false);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const [showFullPreview, setShowFullPreview] = useState(false);

  // ETA tracking based on real performance
  const [etaSeconds, setEtaSeconds] = useState<number | null>(null);
  const progressHistoryRef = useRef<{ time: number; progress: number }[]>([]);

  // Audio player
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

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
        description: `${option.description} - Install in Models`,
      };
    });
  }, [engine, sttModelInstalled, sttProvider, sttProviderInfo]);

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
  const diarizationMethodLabel =
    currentJob?.diarization_method === "pyannote"
      ? "AI (pyannote)"
      : currentJob?.diarization_method === "clustering"
      ? "Basic (clustering)"
      : currentJob?.diarization_method === "none"
      ? "None"
      : null;

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
        : (pyannoteError || "Pyannote AI not configured. Go to Models page to set up.")
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
      ? "bg-emerald-500/10 text-emerald-400"
      : "bg-amber-500/10 text-amber-400";
  const diarizationStatusDot =
    diarizationMode === "basic" || !canUsePyannote ? "bg-amber-400" : "bg-emerald-400";
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
        : "text-emerald-400"
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
    if (typeof window !== "undefined" && window.electronAPI?.netFetch) {
      const response = await window.electronAPI.netFetch(url, {
        method: options.method || "GET",
        headers: options.headers as Record<string, string> | undefined,
        body: options.body as string | undefined,
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response.body ? JSON.parse(response.body) : {};
    }
    const response = await fetch(url, options);
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
      } catch {
        // Keep defaults if settings are missing.
      } finally {
        didLoadProviderRef.current = true;
      }
    }
    loadProviderSelection();
  }, []);

  // Persist STT provider selection
  useEffect(() => {
    if (!didLoadProviderRef.current) return;
    if (!sttProvider) return;
    setProvider("stt", sttProvider).catch(() => {});
  }, [sttProvider]);

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

  // Dropzone
  const onDrop = useCallback((acceptedFiles: File[], rejectedFiles: any[], event: any) => {
    setUploadError(null);

    // Debug logging
    console.log("[Dropzone] Accepted files:", acceptedFiles.length);
    console.log("[Dropzone] Rejected files:", rejectedFiles.length);

    if (rejectedFiles.length > 0) {
      console.log("[Dropzone] Rejection reasons:", rejectedFiles.map(r => r.errors));
      setUploadError(`File rejected: ${rejectedFiles[0]?.errors?.[0]?.message || "Unknown error"}`);
      return;
    }

    if (acceptedFiles.length > 0) {
      let file = acceptedFiles[0];
      const isElectron = typeof window !== "undefined" && !!window.electronAPI?.isElectron;
      const rawFile = event?.dataTransfer?.files?.[0] || event?.target?.files?.[0];
      if (isElectron && rawFile?.path && isAbsolutePath(rawFile.path) && rawFile.name === file.name) {
        file = rawFile;
      }
      console.log("[Dropzone] File selected:", file.name, "Size:", file.size, "Type:", file.type);

      // Check if file size is readable
      if (file.size === 0) {
        setUploadError("Cannot read file size. Try dragging the file instead of clicking, or use a different browser.");
        return;
      }

      // Max 4GB
      if (file.size > 4 * 1024 * 1024 * 1024) {
        setUploadError("File too large. Maximum size is 4GB.");
        return;
      }
      setSelectedFile(file);
      // Create audio URL for player
      const url = URL.createObjectURL(file);
      setAudioUrl(url);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "audio/*": [".mp3", ".wav", ".m4a", ".ogg", ".flac", ".aac"],
      "video/*": [".mp4", ".mkv", ".webm", ".avi", ".mov"],
    },
    maxFiles: 1,
    disabled: isUploading || isImporting || (currentJob?.status === "transcribing" || currentJob?.status === "diarizing"),
    useFsAccessApi: false,  // Required for Electron - fixes 0 bytes issue with large files
  });

  // Poll for job status using IPC in Electron (all network calls broken in renderer after large uploads)
  useEffect(() => {
    console.log("[Effect] Polling effect triggered, currentJob:", currentJob?.job_id, "status:", currentJob?.status);
    if (currentJob && (currentJob.status === "downloading" || currentJob.status === "pending" || currentJob.status === "transcribing" || currentJob.status === "diarizing")) {
      console.log("[Effect] Starting polling interval for job:", currentJob.job_id);
      pollingRef.current = setInterval(async () => {
        try {
          let status;
          const url = `http://localhost:8000/api/transcribe/status/${currentJob.job_id}`;

          // Use IPC in Electron - renderer networking is broken after large uploads
          if (window.electronAPI?.netFetch) {
            const response = await window.electronAPI.netFetch(url, { method: 'GET' });
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

          // Use native fetch instead of axios - axios is broken in Electron after large uploads
          const response = await fetch("http://localhost:8000/api/transcribe/history");
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          const data = await response.json();
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
        (progress, loaded) => {
          setUploadProgress(progress);
          setUploadedBytes(loaded);
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
        engine
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

  return (
    <div className="space-y-8 animate-slide-up">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gradient">Transcription</h1>
        <p className="mt-2 text-slate-400">
          Upload audio or video files, or import a public link for transcription with speaker identification
        </p>
      </div>

      {/* Main content */}
      {!currentJob || currentJob.status === "error" ? (
        // Upload & Settings View
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Dropzone */}
          <div className="lg:col-span-2">
            <div
              {...getRootProps()}
              className={cn(
                "border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors",
                isDragActive
                  ? "border-emerald-400 bg-emerald-500/10"
                  : selectedFile
                    ? "border-emerald-400/40 bg-emerald-500/5"
                    : "border-white/10 hover:border-white/20",
                isUploading && "pointer-events-none opacity-50"
              )}
            >
              <input {...getInputProps()} />
              {selectedFile ? (
                <div className="space-y-4">
                  <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/20 flex items-center justify-center">
                    <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-lg font-medium text-slate-100">{selectedFile.name}</p>
                    <p className="text-sm text-slate-400">{formatFileSize(selectedFile.size)}</p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleReset();
                    }}
                    className="text-sm text-slate-400 hover:text-slate-100 transition-colors"
                  >
                    Choose different file
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <Upload className="w-12 h-12 mx-auto text-slate-400" />
                  <div>
                    <p className="text-lg text-slate-400">
                      {isDragActive ? "Drop file here" : "Drop audio/video file or click to browse"}
                    </p>
                    <p className="text-sm text-slate-400 mt-2">
                      MP3, WAV, M4A, MP4, MKV up to 4GB (5 hours max)
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  setImportError(null);
                  setShowImportModal(true);
                }}
                disabled={isUploading || isImporting}
                className="btn btn-secondary text-sm"
              >
                <Link2 className="w-4 h-4" />
                Import from link
              </button>
              <span className="text-xs text-slate-400">
                YouTube, Dropbox, Google Drive, Vimeo, X, and direct URLs
              </span>
            </div>

            {uploadError && (
              <div className="glass-card mt-4 p-4 border-red-500/30 bg-red-500/10 text-red-300 flex items-center gap-3">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <p>{uploadError}</p>
              </div>
            )}

            {currentJob?.status === "error" && (
              <div className="glass-card mt-4 p-4 border-red-500/30 bg-red-500/10 text-red-300">
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

          {/* Settings Panel */}
          <div className="glass-card p-4 space-y-4">
            <h3 className="font-medium text-slate-100 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-emerald-400" />
              Settings
            </h3>

            {/* STT Provider */}
            <UnifiedProviderSelector
              service="stt"
              selected={sttProvider}
              onSelect={setSttProvider}
              onProviderInfoChange={(info) => setSttProviderInfo(info as ServiceProviderInfo | null)}
              variant="dropdown"
              allowedTypes={['local']}
              label="STT Engine"
            />

            {/* Language */}
            <SelectMenu
              label="Language"
              value={language}
              onChange={setLanguage}
              options={LANGUAGE_OPTIONS}
            />

            {/* Model */}
            <SelectMenu
              label="Model"
              value={whisperModel}
              onChange={setWhisperModel}
              options={whisperModelOptions}
            />

            {/* Engine Selector */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-400">
                Engine
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setEngine("fast")}
                  className={cn(
                    "flex-1 px-3 py-2 rounded-lg text-sm transition-colors text-left",
                    engine === "fast"
                      ? "bg-emerald-500/20 border border-emerald-500/50 text-emerald-400"
                      : "bg-white/5 border border-white/10 text-slate-400 hover:border-white/20"
                  )}
                >
                  <div className="font-medium">Fast</div>
                  <div className="text-xs opacity-70">Segment-level speakers</div>
                </button>
                <button
                  onClick={() => setEngine("accurate")}
                  disabled={!engineStatus?.engines.accurate.available}
                  className={cn(
                    "flex-1 px-3 py-2 rounded-lg text-sm transition-colors text-left",
                    engine === "accurate"
                      ? "bg-purple-500/20 border border-purple-500/50 text-purple-400"
                      : "bg-white/5 border border-white/10 text-slate-400 hover:border-white/20",
                    !engineStatus?.engines.accurate.available && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <div className="font-medium">Accurate</div>
                  <div className="text-xs opacity-70">Word-level speakers</div>
                </button>
              </div>
              {engine === "accurate" && (
                <p className="text-xs text-purple-400/80">
                  Uses WhisperX for precise word alignment and per-word speaker detection
                </p>
              )}
              {!engineStatus?.engines.accurate.available && (
                <p className="text-xs text-slate-400/60">
                  WhisperX not available. Visit the Models page for installation options.
                </p>
              )}
            </div>

            {/* Diarization */}
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enableDiarization}
                  onChange={(e) => setEnableDiarization(e.target.checked)}
                  className="w-5 h-5 rounded border-white/20 bg-white/5 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0"
                />
                <span className="text-slate-400 flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Speaker identification
                </span>
              </label>

              {enableDiarization && (
                <div className="pl-8 space-y-3">
                  {/* Diarization status indicator */}
                  {diarizationStatus && (
                    <div className={cn(
                      "text-xs px-2 py-1.5 rounded",
                      diarizationStatusTone
                    )}>
                      <div className="flex items-center gap-1.5">
                        <div className={cn(
                          "w-1.5 h-1.5 rounded-full flex-shrink-0",
                          diarizationStatusDot
                        )} />
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

                  <SelectMenu
                    label="Diarization mode"
                    value={diarizationMode}
                    options={diarizationModeOptions}
                    onChange={(value) => setDiarizationMode(value as DiarizationMode)}
                    buttonClassName="py-2 text-sm"
                  />

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
                  <p className="text-xs text-slate-400">
                    {safetySettings.device === "gpu"
                      ? "GPU diarization is enabled. Use at your own risk."
                      : "GPU diarization is off by default for stability. Enable at your own risk."}
                  </p>

                  <div className="flex items-center gap-4">
                    <div className="flex-1">
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
                    <div className="flex-1">
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
                </div>
              )}
            </div>

            {/* AI Cleanup */}
            <div className="space-y-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enableAICleanup}
                  onChange={(e) => setEnableAICleanup(e.target.checked)}
                  className="w-5 h-5 rounded border-white/20 bg-white/5 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0"
                />
                <span className="text-slate-400 flex items-center gap-2">
                  <Wand2 className="w-4 h-4" />
                  Clean up with AI
                </span>
              </label>
              {enableAICleanup && (
                <p className="text-xs text-slate-400 pl-8">
                  Improves punctuation, grammar, and paragraph structure while preserving meaning
                </p>
              )}
            </div>

            {/* Start Button */}
            <button
              onClick={handleStartTranscription}
              disabled={!selectedFile || isUploading}
              className="btn btn-primary w-full"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Uploading... {uploadProgress}%
                </>
              ) : (
                <>
                  <FileAudio className="w-5 h-5" />
                  Start Transcription
                </>
              )}
            </button>

            {/* Upload progress bar */}
            {isUploading && (
              <div className="mt-3 space-y-2">
                <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-slate-400">
                  <span>
                    {formatFileSize(uploadedBytes)} / {selectedFile ? formatFileSize(selectedFile.size) : '?'}
                  </span>
                  <span>{uploadProgress}%</span>
                </div>
                {uploadProgress >= 100 && (
                  <div className="flex items-center justify-center gap-2 text-xs text-amber-400 pt-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Server processing file... (large files may take several minutes)</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : isProcessing || currentJob?.status === "cancelled" || currentJob?.status === "paused" ? (
        // Processing View with Live Preview
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Progress Panel */}
          <div className="glass-card p-6">
            <div className="text-center space-y-5">
              <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/20 flex items-center justify-center">
                {currentJob?.status === "cancelled" ? (
                  <XCircle className="w-8 h-8 text-amber-400" />
                ) : currentJob?.status === "paused" ? (
                  <Pause className="w-8 h-8 text-blue-400" />
                ) : (
                  <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
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

              {/* Progress bar */}
              <div className="w-full bg-white/10 rounded-full h-2.5 overflow-hidden">
                <div
                  className={cn(
                    "h-full transition-all duration-500",
                    currentJob?.status === "cancelled"
                      ? "bg-amber-500"
                      : currentJob?.status === "paused"
                      ? "bg-blue-500"
                      : "bg-gradient-to-r from-emerald-500 to-teal-500"
                  )}
                  style={{ width: `${currentJob?.progress || 0}%` }}
                />
              </div>

              <div className="flex justify-between text-xs text-slate-400">
                <span>{typeof currentJob?.progress === 'number' ? currentJob.progress.toFixed(1) : currentJob?.progress}%</span>
                <span className="flex items-center gap-2">
                  {typeof currentJob?.elapsed_seconds === "number" && currentJob.elapsed_seconds > 0 && (
                    <span>Elapsed {formatDuration(currentJob.elapsed_seconds)}</span>
                  )}
                  {etaSeconds !== null && etaSeconds > 0 && currentJob?.status !== "cancelled" && (
                    <span className="text-emerald-400">{formatEta(etaSeconds)}</span>
                  )}
                  {currentJob?.total_duration > 0 && (
                    <span>{formatDuration(currentJob.total_duration)}</span>
                  )}
                </span>
              </div>

              <div className="flex flex-wrap justify-center gap-2 text-[10px] text-slate-400">
                <span className="px-2 py-0.5 rounded-full bg-white/10">
                  Engine: {engineLabel}
                </span>
                {currentJob?.enable_diarization === false ? (
                  <span className="px-2 py-0.5 rounded-full bg-white/10">Diarization: Off</span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full bg-white/10">
                    Diarization: {diarizationModeLabel}
                  </span>
                )}
                {diarizationMethodLabel && (
                  <span className="px-2 py-0.5 rounded-full bg-white/10">
                    Method: {diarizationMethodLabel}
                  </span>
                )}
                {effectiveSpeakersDetected > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-white/10">
                    Speakers: {effectiveSpeakersDetected}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap justify-center gap-2 text-[10px] text-slate-400">
                <span className="px-2 py-0.5 rounded-full bg-white/10 flex items-center gap-1">
                  <Thermometer className="w-3 h-3 text-emerald-400" />
                  <span>{hotspotLabel}:</span>
                  <span className={hotspotTone}>
                    {typeof hotspot === "number" ? `${hotspot.toFixed(0)}°C` : "N/A"}
                  </span>
                </span>
                {primaryGpu?.temperature?.core_c != null && (
                  <span className="px-2 py-0.5 rounded-full bg-white/10">
                    GPU {primaryGpu.temperature.core_c.toFixed(0)}°C
                  </span>
                )}
                {primaryGpu?.temperature?.memory_c != null && (
                  <span className="px-2 py-0.5 rounded-full bg-white/10">
                    VRAM {primaryGpu.temperature.memory_c.toFixed(0)}°C
                  </span>
                )}
              </div>

              {/* Processing steps indicator */}
              <div className="flex justify-center gap-1.5 pt-1">
                <div className={`px-2 py-0.5 rounded-full text-[10px] flex items-center gap-1 ${
                  currentJob?.progress >= 2 && currentJob?.progress < 10 ? "bg-emerald-500/30 text-emerald-300" :
                  currentJob?.progress >= 10 ? "bg-emerald-500/20 text-emerald-400" : "bg-white/5 text-slate-400"
                }`}>
                  {currentJob?.progress >= 2 && currentJob?.progress < 10 && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                  Extract
                </div>
                <div className={`px-2 py-0.5 rounded-full text-[10px] flex items-center gap-1 ${
                  currentJob?.progress >= 10 && currentJob?.progress < 80 ? "bg-emerald-500/30 text-emerald-300" :
                  currentJob?.progress >= 80 ? "bg-emerald-500/20 text-emerald-400" : "bg-white/5 text-slate-400"
                }`}>
                  {currentJob?.progress >= 10 && currentJob?.progress < 80 && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                  Transcribe
                </div>
                <div className={`px-2 py-0.5 rounded-full text-[10px] flex items-center gap-1 ${
                  currentJob?.progress >= 80 && currentJob?.progress < 95 ? "bg-emerald-500/30 text-emerald-300" :
                  currentJob?.progress >= 95 ? "bg-emerald-500/20 text-emerald-400" : "bg-white/5 text-slate-400"
                }`}>
                  {currentJob?.progress >= 80 && currentJob?.progress < 95 && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                  Speakers
                </div>
              </div>

              {/* File info */}
              <div className="pt-3 border-t border-white/10 text-xs text-slate-400">
                <span className="text-slate-100">{currentJob?.filename}</span>
                {currentJob?.file_size_bytes && <span> ({formatFileSize(currentJob.file_size_bytes)})</span>}
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
          <div className="glass-card p-4 flex flex-col max-h-[600px]">
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-white/10">
              <Eye className="w-4 h-4 text-emerald-400" />
              <span className="text-sm font-medium text-slate-100">Live Preview</span>
              <div className="ml-auto flex items-center gap-2">
                {previewTotal > 0 && (
                  <span className="text-xs text-slate-400">
                    {previewIsTruncated
                      ? `Showing last ${previewSegments.length} of ${previewTotal}`
                      : `${previewTotal} segments`}
                  </span>
                )}
                {previewTotal > PREVIEW_SEGMENT_LIMIT && (
                  <button
                    onClick={() => setShowFullPreview(!showFullPreview)}
                    className="text-xs text-slate-400 hover:text-slate-100 transition-colors"
                  >
                    {showFullPreview ? "Show less" : "Show all"}
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
              {(!currentJob?.segments || currentJob.segments.length === 0) ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-400">
                  <div className="flex gap-1 mb-2">
                    <div className="w-2 h-2 bg-emerald-500/50 rounded-full animate-pulse" />
                    <div className="w-2 h-2 bg-emerald-500/50 rounded-full animate-pulse delay-75" />
                    <div className="w-2 h-2 bg-emerald-500/50 rounded-full animate-pulse delay-150" />
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
                  {currentJob?.status === "transcribing" && currentJob?.progress < 80 && (
                    <div className="select-none pointer-events-none">
                      <div className="inline-flex items-center gap-1 text-emerald-400/60 animate-pulse">
                        <Loader2 className="w-3 h-3 animate-spin" />
                      </div>
                      <span className="ml-2 font-mono text-sm tracking-wider select-none" style={{
                        background: "linear-gradient(90deg, rgba(52,211,153,0.3) 0%, rgba(52,211,153,0.1) 50%, transparent 100%)",
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
                    {currentJob.segments?.length > 0
                      ? ` ${currentJob.segments.length} segments were saved and can be viewed below.`
                      : " No segments were saved."}
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

          <div className="glass-card p-4 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Thermometer className="w-4 h-4 text-emerald-400" />
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

            <div className="flex items-center gap-3 ml-auto">
              <div className="min-w-[200px]">
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
              </div>
              <div className="min-w-[180px]">
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
                <Shield className="w-4 h-4 text-emerald-400" />
                <span>Thermal guard</span>
              </div>
            </div>
            <div className="text-xs text-slate-400 ml-auto">
              {safetySettings.device === "gpu"
                ? "GPU diarization is enabled. Use at your own risk."
                : "GPU diarization is off by default for stability. Enable at your own risk."}
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 w-full">
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
              <div className="text-xs text-amber-300 w-full">
                GPU telemetry unavailable. Thermal guard forces CPU-only safe mode.
              </div>
            )}
          </div>

          {/* Transcript Editor */}
          <TranscriptEditor
            segments={currentJob.segments}
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
    </div>
  );
}

// Wrap in Suspense for useSearchParams (required by Next.js 16+)
export default function TranscribePage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
      </div>
    }>
      <TranscribePageContent />
    </Suspense>
  );
}
