/**
 * Whisperall API Client
 * Auto-generated based on backend API routes
 */

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8080');

// ============================================
// Types
// ============================================

export type ServiceType =
  | 'tts'
  | 'stt'
  | 'music'
  | 'ai'
  | 'ai_edit'
  | 'translation'
  | 'dubbing'
  | 'voice_changer'
  | 'voice_isolator'
  | 'sfx'
  | 'loopback'
  | 'transcription'
  | 'local'
  | 'cloud'
  | 'audiobook'
  | 'api';

export interface ServiceProviderModel {
  id: string;
  name?: string;
  description?: string;
  vram_gb?: number;
}

export type ProviderKind = 'local' | 'api';

export interface ServiceProviderInfo {
  id: string;
  name: string;
  type: ProviderKind;
  enabled: boolean;
  configured: boolean;
  is_available?: boolean;
  is_ready?: boolean;
  ready?: boolean;
  description?: string;
  apiKeyRequired?: boolean;
  requires_model_download?: boolean;
  models?: ServiceProviderModel[];
  default_model?: string;
  supports_auto_detect?: boolean;
}

export interface TTSProviderInfo extends ServiceProviderInfo {
  voices?: Voice[];
  supportsCloning?: boolean;
  supportsStreaming?: boolean;
  // Extended properties for detailed TTS providers
  default_model?: string;
  voice_cloning?: 'none' | 'optional' | 'required';
  preset_voices?: TTSPresetVoice[];
  supported_languages?: string[];
  vram_gb?: number;
  extra_params?: Record<string, {
    type: string;
    label?: string;
    description?: string;
    default?: number | string | boolean;
    min?: number;
    max?: number;
  }>;
}

export interface TTSProviderUsage {
  provider: string;
  usage: {
    tier?: string;
    status?: string;
    character_count?: number;
    character_limit?: number;
    characters_remaining?: number;
    next_character_count_reset_unix?: number;
    voice_slots_used?: number;
    voice_limit?: number;
    billing_period?: string;
    character_refresh_period?: string;
    currency?: string;
  };
}

export interface MusicProviderInfo extends ServiceProviderInfo {
  genres?: string[];
  supports_fast_mode?: boolean;
  max_duration_seconds?: number;
  vram_gb?: number;
}

export interface TTSModelVariant {
  id: string;
  name: string;
  description?: string;
  size_gb?: number;
  vram_gb?: number;
}

export interface TTSPresetVoice {
  id: string;
  name: string;
  provider: string;
  previewUrl?: string;
  sample_url?: string;
  language?: string;
  gender?: string;
  description?: string;
}

export interface Voice {
  id: string;
  name: string;
  provider?: string;
  language?: string;
  gender?: string;
  description?: string;
  previewUrl?: string;
  isCustom?: boolean;
  samplePath?: string;
  // Extended properties for voice library
  tags: string[];
  filename?: string;
  size_mb?: number;
  sample_url?: string;
  analysis?: {
    description?: string;
    pitch_category?: string;
    energy_category?: string;
    tempo_category?: string;
  };
}

export interface Model {
  id: string;
  name: string;
  provider: string;
  type: ServiceType;
  description?: string;
  installed: boolean;
  downloaded?: boolean;
  download_progress?: number;
  size_mb?: number;
  // Extended TTS model properties
  supports_exaggeration?: boolean;
  supports_cfg?: boolean;
  languages?: string[];
}

export interface Language {
  code: string;
  name: string;
  nativeName?: string;
}

export interface Preset {
  id: string;
  name: string;
  description?: string;
  model?: string;
  language?: string;
  temperature?: number;
  exaggeration?: number;
  cfg_weight?: number;
  speed?: number;
  voice_id?: string;
  is_default?: boolean;
  settings?: Record<string, unknown>;
  isDefault?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface HistoryFilter {
  module?: string;
  provider?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  favorite?: boolean;
  limit?: number;
  offset?: number;
}

export interface HistoryModuleInfo {
  module: string;
  count: number;
}

export interface SystemCapabilities {
  cuda_available: boolean;
  mps_available: boolean;
  gpu?: {
    name: string;
    memory_total_gb: number;
    cuda_version?: string | null;
  } | null;
  current_tts_device?: string;
  torch_version?: string;
  performance_settings?: {
    fast_mode?: boolean;
    device?: string;
    preload_models?: boolean;
  };
  // Legacy fields (may be present in older builds)
  ffmpegInstalled?: boolean;
  sttInstalled?: boolean;
  gpuAvailable?: boolean;
  cudaVersion?: string;
  platform?: string;
  pythonVersion?: string;
}

export interface MediaUploadResponse {
  temp_id: string;
  duration: number;
  sample_rate: number;
  waveform: number[];
  audio_url: string;
}

export interface FFmpegStatus {
  available: boolean;
  version?: string | null;
  path?: string | null;
  bundled?: boolean;
  error?: string | null;
}

// ============================================
// API Functions
// ============================================

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

// Service Providers
export async function getServiceProviders(type?: ServiceType): Promise<ServiceProviderInfo[]> {
  if (!type) {
    const data = await fetchApi<{ providers?: ServiceProviderInfo[] }>('/api/providers/all');
    return data.providers || [];
  }

  const data = await fetchApi<{ providers?: ServiceProviderInfo[] }>(`/api/providers/${type}`);
  return data.providers || [];
}

export interface ProviderSelectionConfig {
  model?: string;
  preset_voice_id?: string;
  voice_id?: string;
  language?: string;
  source_language?: string;
  target_language?: string;
  enable_diarization?: boolean;
  enable_translation?: boolean;
  translation_language?: string;
  output_device?: string;
  volume?: number;
  [key: string]: unknown;
}

export interface ProviderSelection {
  selected: string | null;
  config: ProviderSelectionConfig;
}

export async function getProviderSelection(type: ServiceType): Promise<ProviderSelection> {
  try {
    return await fetchApi<ProviderSelection>(`/api/settings/providers/${type}`);
  } catch {
    // Fallback to legacy behavior
    const providers = await getServiceProviders(type);
    const active = providers.find(p => p.enabled);
    return { selected: active?.id || null, config: {} };
  }
}

export async function setProvider(
  type: ServiceType,
  providerId: string,
  config?: Record<string, unknown>
): Promise<void> {
  await fetchApi(`/api/settings/providers/${type}`, {
    method: 'PUT',
    body: JSON.stringify({ provider: providerId, config: config || {} }),
  });
}

// TTS Providers
export async function getTTSProviders(): Promise<TTSProviderInfo[]> {
  const data = await fetchApi<{ providers?: TTSProviderInfo[] }>('/api/tts/providers');
  return data.providers || [];
}

export async function getTTSProvider(providerId: string): Promise<TTSProviderInfo> {
  return fetchApi<TTSProviderInfo>(`/api/tts/providers/${providerId}`);
}

export async function getTTSProviderVoices(providerId: string, language?: string): Promise<TTSPresetVoice[]> {
  try {
    // Try dedicated voices endpoint first
    const endpoint = language
      ? `/api/tts/providers/${providerId}/voices?language=${language}`
      : `/api/tts/providers/${providerId}/voices`;
    const data = await fetchApi<{ voices?: TTSPresetVoice[] }>(endpoint);
    return data.voices || [];
  } catch {
    // Fallback to provider info
    const provider = await getTTSProvider(providerId);
    const voices = (provider.voices || provider.preset_voices || []).map(v => ({
      id: v.id,
      name: v.name,
      provider: providerId,
      previewUrl: v.previewUrl,
      sample_url: v.previewUrl || v.sample_url,
      language: v.language,
      gender: v.gender,
      description: v.description,
    }));

    if (language) {
      return voices.filter(v => !v.language || v.language.startsWith(language.split('-')[0]));
    }
    return voices;
  }
}

// Voices
export interface VoicesResponse {
  voices: Voice[];
  total_size_mb: number;
}

export async function getVoices(): Promise<VoicesResponse> {
  try {
    return await fetchApi<VoicesResponse>('/api/voices');
  } catch {
    // Fallback for backends that return array directly
    const voices = await fetchApi<Voice[]>('/api/voices');
    return { voices, total_size_mb: 0 };
  }
}

export async function createVoice(name: string, tags: string, audioFile: File): Promise<Voice> {
  const formData = new FormData();
  formData.append('name', name);
  formData.append('tags', tags);
  formData.append('audio', audioFile);

  const response = await fetch(`${API_BASE}/api/voices`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || `Failed to create voice: ${response.status}`);
  }

  return response.json();
}

export async function deleteVoice(voiceId: string): Promise<void> {
  await fetchApi(`/api/voices/${voiceId}`, { method: 'DELETE' });
}

export async function analyzeVoice(voiceId: string): Promise<{ analysis: Voice['analysis'] }> {
  return fetchApi<{ analysis: Voice['analysis'] }>(`/api/voices/${voiceId}/analyze`);
}

export function getAudioUrl(path: string): string {
  if (path.startsWith('http')) return path;
  // Handle both /api/audio/path and direct paths
  if (path.startsWith('/')) {
    return `${API_BASE}${path}`;
  }
  return `${API_BASE}/api/audio/${encodeURIComponent(path)}`;
}

// TTS Generation
export interface TTSGenerateRequest {
  text: string;
  provider?: string;
  model?: string;
  language?: string;
  voice_id?: string;
  preset_voice_id?: string;
  temperature?: number;
  exaggeration?: number;
  cfg_weight?: number;
  top_p?: number;
  top_k?: number;
  speed?: number;
  seed?: number;
  output_format?: string;
  device?: string;
  fast_mode?: boolean;
  extra_params?: Record<string, unknown>;
}

export interface TTSGenerateResponse {
  output_url: string;
  filename: string;
  duration?: number;
}

export async function generate(request: TTSGenerateRequest): Promise<TTSGenerateResponse> {
  return fetchApi<TTSGenerateResponse>('/api/tts/generate', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

export async function generatePreview(request: TTSGenerateRequest): Promise<TTSGenerateResponse> {
  return fetchApi<TTSGenerateResponse>('/api/tts/preview', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

export async function getTTSProviderUsage(providerId: string): Promise<TTSProviderUsage> {
  return fetchApi<TTSProviderUsage>(`/api/tts/providers/${providerId}/usage`);
}

// Models
export async function getModels(): Promise<Model[]> {
  try {
    const data = await fetchApi<{ models?: Model[] }>('/api/models');
    return data.models || [];
  } catch {
    // Fallback for legacy array response
    return fetchApi<Model[]>('/api/models');
  }
}

// Languages
export async function getLanguages(): Promise<Language[]> {
  const data = await fetchApi<{ languages?: Language[] }>('/api/languages');
  return data.languages || [];
}

// Presets
export async function getPresets(): Promise<Preset[]> {
  const data = await fetchApi<{ presets?: Preset[] }>('/api/presets');
  return data.presets || [];
}

export async function createPreset(preset: Partial<Preset>): Promise<Preset> {
  return fetchApi<Preset>('/api/presets', {
    method: 'POST',
    body: JSON.stringify(preset),
  });
}

export async function deletePreset(presetId: string): Promise<void> {
  await fetchApi(`/api/presets/${presetId}`, { method: 'DELETE' });
}

// History
export async function getHistoryModules(): Promise<{ modules: HistoryModuleInfo[] }> {
  return fetchApi<{ modules: HistoryModuleInfo[] }>('/api/history/modules/list');
}

// System
export async function getSystemCapabilities(): Promise<SystemCapabilities> {
  return fetchApi<SystemCapabilities>('/api/system/capabilities');
}

export async function getFFmpegStatus(): Promise<FFmpegStatus> {
  return fetchApi<FFmpegStatus>('/api/system/ffmpeg');
}

export async function installFFmpeg(): Promise<{ success: boolean; message: string }> {
  return fetchApi('/api/system/install-ffmpeg', { method: 'POST' });
}

// Media
export async function uploadMedia(file: File): Promise<MediaUploadResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE}/api/media/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Upload failed: ${response.status}`);
  }

  return response.json();
}

export async function trimAndSaveVoice(
  tempId: string,
  start: number,
  end: number,
  voiceName: string,
  tags?: string
): Promise<Voice> {
  const formData = new FormData();
  formData.append('temp_id', tempId);
  formData.append('start_time', String(start));
  formData.append('end_time', String(end));
  formData.append('name', voiceName);
  if (tags) {
    formData.append('tags', tags);
  }

  const response = await fetch(`${API_BASE}/api/media/trim`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || `Failed to trim audio: ${response.status}`);
  }

  return response.json();
}

export async function cleanupTempMedia(tempId: string): Promise<void> {
  await fetchApi(`/api/media/${tempId}`, { method: 'DELETE' });
}

// AI Features
export interface AIEditRequest {
  text: string;
  command: string;
  provider?: string;
}

export interface AIEditResponse {
  text: string;
  result?: string;
}

export async function aiEdit(request: AIEditRequest): Promise<AIEditResponse> {
  const response = await fetchApi<{ result?: string; text?: string }>('/api/ai/edit', {
    method: 'POST',
    body: JSON.stringify({
      text: request.text,
      instruction: request.command,
      provider: request.provider,
    }),
  });
  return { text: response.result || response.text || '', result: response.result };
}

export interface TranslateRequest {
  text: string;
  source_lang?: string;
  target_lang: string;
  provider?: string;
}

export interface TranslateResponse {
  text: string;
  meta?: Record<string, any>;
}

export async function translateText(request: TranslateRequest): Promise<TranslateResponse> {
  return fetchApi('/api/translate', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

// Settings
export interface UISettings {
  theme?: 'light' | 'dark' | 'system';
  language?: 'en' | 'es' | 'fr' | 'de' | 'it' | 'pt' | 'ja' | 'zh' | 'ko';
  minimize_to_tray?: boolean;
  show_notifications?: boolean;
  font_size?: number;
  compact_mode?: boolean;
}

export interface AppSettings {
  ui?: UISettings;
  [key: string]: unknown;
}

export async function getAllSettings(): Promise<AppSettings> {
  return fetchApi<AppSettings>('/api/settings');
}

export async function getHotkeys(): Promise<Record<string, string>> {
  return fetchApi<Record<string, string>>('/api/settings/hotkeys');
}

// ============================================
// STT (Speech-to-Text)
// ============================================

export interface STTSettings {
  auto_punctuation: boolean;
  filler_removal: boolean;
  backtrack: boolean;
  smart_formatting: boolean;
  language: string;
  transcription_mode: 'final' | 'live';
  hotkey_mode: 'toggle' | 'hold';
  auto_paste: boolean;
  overlay_enabled: boolean;
  overlay_always_on?: boolean;
  input_device_id?: string;
}

export interface STTSession {
  session_id: string;
}

export interface STTResult {
  text: string;
  raw_text: string;
  segments?: Array<{
    start: number;
    end: number;
    text: string;
  }>;
  language?: string;
  meta?: Record<string, any>;
}

export async function getSTTSettings(): Promise<STTSettings> {
  const data = await fetchApi<{ value?: STTSettings }>('/api/settings/stt');
  return data.value || {
    auto_punctuation: true,
    filler_removal: true,
    backtrack: true,
    smart_formatting: true,
    language: 'auto',
    transcription_mode: 'final',
    hotkey_mode: 'toggle',
    auto_paste: false,
    overlay_enabled: true,
    overlay_always_on: false,
  };
}

export async function updateSTTSettings(settings: Partial<STTSettings>): Promise<STTSettings> {
  const current = await getSTTSettings();
  const merged = { ...current, ...settings };
  const data = await fetchApi<{ value?: STTSettings }>('/api/settings/stt', {
    method: 'PUT',
    body: JSON.stringify({ value: merged }),
  });
  return data.value || merged;
}

export async function startStt(language?: string, prompt?: string): Promise<STTSession> {
  return fetchApi<STTSession>('/api/stt/start', {
    method: 'POST',
    body: JSON.stringify({
      language: language || 'auto',
      prompt: prompt || undefined,
    }),
  });
}

export async function stopStt(
  sessionId: string,
  audioBlob: Blob,
  language?: string,
  prompt?: string
): Promise<STTResult> {
  const formData = new FormData();
  formData.append('session_id', sessionId);
  formData.append('audio', audioBlob, 'audio.webm');
  if (language) formData.append('language', language);
  if (prompt) formData.append('prompt', prompt);
  const response = await fetch(`${API_BASE}/api/stt/stop`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `STT stop failed: ${response.status}`);
  }

  return response.json();
}

export async function cancelStt(sessionId: string): Promise<void> {
  await fetchApi('/api/stt/cancel', {
    method: 'POST',
    body: JSON.stringify({ session_id: sessionId }),
  });
}

export interface PartialSTTResult extends STTResult {
  partial_text?: string;
}

export async function partialStt(
  sessionId: string,
  audioBlob: Blob,
  language?: string,
  prompt?: string
): Promise<PartialSTTResult> {
  const formData = new FormData();
  formData.append('session_id', sessionId);
  formData.append('audio', audioBlob, 'audio.webm');
  if (language) formData.append('language', language);
  if (prompt) formData.append('prompt', prompt);

  const response = await fetch(`${API_BASE}/api/stt/partial`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`STT partial failed: ${response.status}`);
  }

  return response.json();
}

export async function finalizeStt(sessionId: string): Promise<STTResult> {
  return fetchApi<STTResult>('/api/stt/finalize', {
    method: 'POST',
    body: JSON.stringify({ session_id: sessionId }),
  });
}

export async function installSttEngine(): Promise<{ success: boolean; message: string; output?: string }> {
  return fetchApi('/api/system/install-stt', { method: 'POST' });
}

export interface ModelsResponse {
  models: Model[];
}

export async function getAllModels(type?: ServiceType): Promise<ModelsResponse> {
  const endpoint = type ? `/api/models/all?category=${type}` : '/api/models/all';
  try {
    return await fetchApi<ModelsResponse>(endpoint);
  } catch {
    // Fallback for older API that returns array directly
    const legacyEndpoint = type ? `/api/models?type=${type}` : '/api/models';
    try {
      return await fetchApi<ModelsResponse>(legacyEndpoint);
    } catch {
      const models = await fetchApi<Model[]>(legacyEndpoint);
      return { models };
    }
  }
}

// ============================================
// History
// ============================================

export interface HistoryEntry {
  id: string;
  module: string;
  text?: string;
  audio_path?: string;
  output_url?: string;
  created_at: string;
  metadata?: Record<string, unknown>;
  favorite?: boolean;
  file_exists?: boolean;
  duration?: number;
  filename?: string;
  model?: string;
  language?: string;
  temperature?: number;
  exaggeration?: number;
  billing?: {
    value?: number;
    unit?: string;
    details?: string;
  };
  file_size_mb?: number;
}

export interface NewHistoryEntry {
  id: string;
  module: string;
  title?: string;
  text?: string;
  input_text?: string;
  output_text?: string;
  audio_path?: string;
  input_audio_path?: string;
  output_audio_path?: string;
  output_video_path?: string;
  file_path?: string;
  created_at: string;
  metadata?: Record<string, any>;
  favorite?: boolean;
  duration?: number;
  duration_seconds?: number;
  characters_count?: number;
  provider?: string;
  model?: string;
  tags?: string[];
  notes?: string;
  status?: string;
  error_message?: string;
}

export interface TranscriptionJob {
  id?: string;
  job_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'paused' | 'interrupted' | 'error' | 'cancelled' | 'transcribing' | 'diarizing' | 'downloading' | 'cleaning';
  text?: string;
  audio_path?: string;
  created_at: string;
  completed_at?: string;
  error?: string;
  filename?: string;
  segments?: TranscriptSegment[];
  progress?: number;
  speakers_detected?: number;
  total_duration?: number;
  engine?: string;
  diarization_mode?: DiarizationMode;
  diarization_method?: DiarizationMethod;
  diarization_error?: string | null;
  thermal_guard?: {
    paused?: boolean;
    reason?: string;
    snapshot?: Record<string, any> | null;
  };
  enable_diarization?: boolean;
  current_step?: string;
  processed_duration?: number;
  file_size_bytes?: number;
  source_url?: string;
  elapsed_seconds?: number;
}

export interface HistoryStats {
  total_entries: number;
  by_module: Record<string, number>;
  favorites_count: number;
  total_duration?: number;
  total_duration_seconds?: number;
  total_characters?: number;
  storage_bytes?: number;
}

export interface HistoryResponse {
  history: HistoryEntry[];
  total: number;
}

export async function getHistory(limit?: number, offset?: number, filter?: HistoryFilter): Promise<HistoryResponse> {
  const params = new URLSearchParams();
  if (limit !== undefined) params.set('limit', limit.toString());
  if (offset !== undefined) params.set('offset', offset.toString());
  if (filter?.module) params.set('module', filter.module);
  if (filter?.dateFrom) params.set('date_from', filter.dateFrom);
  if (filter?.dateTo) params.set('date_to', filter.dateTo);
  if (filter?.search) params.set('search', filter.search);
  if (filter?.favorite) params.set('favorite', 'true');
  const queryString = params.toString();
  return fetchApi<HistoryResponse>(`/api/history${queryString ? '?' + queryString : ''}`);
}

export interface NewHistoryResponse {
  entries: NewHistoryEntry[];
  total: number;
}

export async function getNewHistory(filter?: HistoryFilter): Promise<NewHistoryResponse> {
  const params = new URLSearchParams();
  if (filter?.module) params.set('module', filter.module);
  if (filter?.dateFrom) params.set('date_from', filter.dateFrom);
  if (filter?.dateTo) params.set('date_to', filter.dateTo);
  if (filter?.search) params.set('search', filter.search);
  if (filter?.favorite) params.set('favorite', 'true');
  if (filter?.limit) params.set('limit', filter.limit.toString());
  if (filter?.offset) params.set('offset', filter.offset.toString());
  const queryString = params.toString();
  return fetchApi<NewHistoryResponse>(`/api/history/v2${queryString ? '?' + queryString : ''}`);
}

export async function getHistoryStats(): Promise<HistoryStats> {
  return fetchApi<HistoryStats>('/api/history/stats');
}

export async function deleteHistoryEntry(entryId: string, deleteFile?: boolean): Promise<void> {
  const params = deleteFile ? '?delete_file=true' : '';
  await fetchApi(`/api/history/${entryId}${params}`, { method: 'DELETE' });
}

export async function deleteNewHistoryEntry(entryId: string): Promise<void> {
  await fetchApi(`/api/history/v2/${entryId}`, { method: 'DELETE' });
}

export async function bulkDeleteHistoryEntries(entryIds: string[]): Promise<{ deleted_count: number; failed_count: number }> {
  return fetchApi('/api/history/bulk-delete', {
    method: 'POST',
    body: JSON.stringify({ ids: entryIds }),
  });
}

export interface ClearHistoryResult {
  freed_bytes: number;
  deleted_count: number;
}

export async function clearHistory(moduleOrDeleteFiles?: string | boolean): Promise<ClearHistoryResult> {
  let endpoint = '/api/history/clear';
  if (typeof moduleOrDeleteFiles === 'string') {
    endpoint = `/api/history/clear?module=${moduleOrDeleteFiles}`;
  } else if (typeof moduleOrDeleteFiles === 'boolean') {
    endpoint = `/api/history/clear?delete_files=${moduleOrDeleteFiles}`;
  }
  return fetchApi<ClearHistoryResult>(endpoint, { method: 'POST' });
}

export async function toggleHistoryFavorite(entryId: string): Promise<NewHistoryEntry> {
  return fetchApi<NewHistoryEntry>(`/api/history/v2/${entryId}/favorite`, { method: 'POST' });
}

export function getHistoryFileDownloadUrl(
  entryId: string,
  fileType: 'input_audio' | 'output_audio' | 'input_video' | 'output_video' = 'output_audio'
): string {
  return `${API_BASE}/api/history/${entryId}/download/${fileType}`;
}

export interface TranscriptionHistoryResponse {
  jobs: TranscriptionJob[];
  total: number;
}

export async function getTranscriptionHistory(): Promise<TranscriptionHistoryResponse> {
  return fetchApi<TranscriptionHistoryResponse>('/api/transcribe/history');
}

export async function deleteTranscriptionJob(jobId: string): Promise<void> {
  await fetchApi(`/api/transcribe/${jobId}`, { method: 'DELETE' });
}

export async function clearAllTranscriptions(): Promise<ClearHistoryResult> {
  return fetchApi<ClearHistoryResult>('/api/transcribe', { method: 'DELETE' });
}

// ============================================
// Audiobook
// ============================================

export interface Chapter {
  id: string;
  number: number;
  title: string;
  text: string;
  content: string;
  preview?: string;
  audio_path?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  duration?: number;
  word_count?: number;
}

export interface DocumentStats {
  total_chapters: number;
  total_words: number;
  estimated_duration?: number;
}

export interface JobOutput {
  chapter: number;
  title: string;
  filename: string;
  url: string;
}

export interface JobStatus {
  job_id: string;
  status: 'pending' | 'processing' | 'paused' | 'completed' | 'failed' | 'cancelled' | 'error';
  progress: number;
  current_chapter?: number;
  total_chapters?: number;
  chapters?: Chapter[];
  outputs: JobOutput[];
  output_path?: string;
  error?: string;
}

export interface ParseDocumentResponse {
  chapters: Chapter[];
  stats: DocumentStats;
}

export async function parseDocument(file: File): Promise<ParseDocumentResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE}/api/audiobook/parse`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Parse failed: ${response.status}`);
  }

  return response.json();
}

export interface GenerateBookRequest {
  chapters: Chapter[];
  provider?: string;
  voice_id?: string;
  preset_voice_id?: string;
  model?: string;
  language?: string;
  output_format?: string;
  temperature?: number;
  exaggeration?: number;
  speed?: number;
  cfg_weight?: number;
  device?: string;
  fast_mode?: boolean;
  extra_params?: Record<string, unknown>;
}

export async function generateBook(request: GenerateBookRequest): Promise<{ job_id: string }> {
  return fetchApi('/api/audiobook/generate', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

export async function getJobStatus(jobId: string): Promise<JobStatus> {
  return fetchApi<JobStatus>(`/api/audiobook/job/${jobId}`);
}

export async function pauseBookJob(jobId: string): Promise<void> {
  await fetchApi(`/api/audiobook/job/${jobId}/pause`, { method: 'POST' });
}

export async function resumeBookJob(jobId: string): Promise<void> {
  await fetchApi(`/api/audiobook/job/${jobId}/resume`, { method: 'POST' });
}

export async function cancelBookJob(jobId: string): Promise<void> {
  await fetchApi(`/api/audiobook/job/${jobId}/cancel`, { method: 'POST' });
}

// ============================================
// Music
// ============================================

export interface MusicJob {
  id: string;
  job_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  output_path?: string;
  error?: string;
}

export interface StemModel {
  id: string;
  name: string;
  description?: string;
  stems: string[];
}

export interface StemSeparationJob {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  audio_path?: string;
  model?: string;
  stems_requested?: string[];
  output_stems?: Record<string, string>;
  error?: string;
  created_at?: number;
  completed_at?: number | null;
}

export async function getMusicProviders(): Promise<MusicProviderInfo[]> {
  const data = await fetchApi<{ providers?: MusicProviderInfo[] }>('/api/music/providers');
  return data.providers || [];
}

export async function generateMusic(request: {
  prompt?: string;
  lyrics?: string;
  style_prompt?: string;
  duration?: number;
  duration_seconds?: number;
  provider?: string;
  model?: string;
  seed?: number;
  num_inference_steps?: number;
  guidance_scale?: number;
}): Promise<{ job_id: string }> {
  return fetchApi('/api/music/generate', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

export async function getMusicJobStatus(jobId: string): Promise<MusicJob> {
  return fetchApi<MusicJob>(`/api/music/jobs/${jobId}`);
}

export function getMusicDownloadUrl(jobId: string): string {
  return `${API_BASE}/api/music/jobs/${jobId}/download`;
}

export async function getStemModels(): Promise<StemModel[]> {
  const data = await fetchApi<{ models?: StemModel[] }>('/api/stems/models');
  return data.models || [];
}

export async function startStemSeparation(audioPath: string, model?: string): Promise<{ job_id: string }> {
  return fetchApi('/api/stems/separate', {
    method: 'POST',
    body: JSON.stringify({ audio_path: audioPath, model }),
  });
}

export async function getStemSeparationJob(jobId: string): Promise<StemSeparationJob> {
  return fetchApi<StemSeparationJob>(`/api/stems/jobs/${jobId}`);
}

export interface StemSeparationAvailability {
  available: boolean;
  message?: string;
}

export async function getStemSeparationStatus(): Promise<StemSeparationAvailability>;
export async function getStemSeparationStatus(jobId: string): Promise<StemSeparationJob>;
export async function getStemSeparationStatus(jobId?: string): Promise<StemSeparationJob | StemSeparationAvailability> {
  if (jobId) {
    return getStemSeparationJob(jobId);
  }
  return fetchApi<StemSeparationAvailability>('/api/stems/status');
}

export function getStemDownloadUrl(jobId: string, stem: string): string {
  return `${API_BASE}/api/stems/jobs/${jobId}/download/${stem}`;
}

// ============================================
// SFX (Sound Effects)
// ============================================

export interface SFXProviderInfo extends ServiceProviderInfo {
  supports_fast_mode?: boolean;
  vram_gb?: number;
  supports_prompt?: boolean;
  max_video_duration_seconds?: number;
}

export interface SFXJob {
  id: string;
  job_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  audio_path?: string;
  video_path?: string;
  output_video_path?: string;
  error?: string;
}

export async function getSFXProviders(): Promise<SFXProviderInfo[]> {
  const data = await fetchApi<{ providers?: SFXProviderInfo[] }>('/api/sfx/providers');
  return data.providers || [];
}

export async function uploadVideoForSFX(file: File): Promise<{ temp_id: string; duration: number; video_path: string }> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE}/api/sfx/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Upload failed: ${response.status}`);
  }

  return response.json();
}

export async function generateSFX(request: {
  video_temp_id?: string;
  video_path?: string;
  prompt?: string;
  provider?: string;
  model?: string;
  merge_with_video?: boolean;
  mix_original?: boolean;
  original_volume?: number;
  seed?: number;
  [key: string]: unknown;
}): Promise<{ job_id: string }> {
  return fetchApi('/api/sfx/generate', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

export async function getSFXJobStatus(jobId: string): Promise<SFXJob> {
  return fetchApi<SFXJob>(`/api/sfx/job/${jobId}`);
}

export function getSFXAudioDownloadUrl(jobId: string): string {
  return `${API_BASE}/api/sfx/job/${jobId}/download/audio`;
}

export function getSFXVideoDownloadUrl(jobId: string): string {
  return `${API_BASE}/api/sfx/job/${jobId}/download/video`;
}

// ============================================
// Dubbing
// ============================================

export interface DubbingProvider extends ServiceProviderInfo {
  supported_languages?: number | string[];
  quota_minutes?: number;
  features: string[];
  watermark_in_starter?: boolean;
  requires_api_key?: boolean;
}

export interface DubbingLanguages {
  [code: string]: string;
}

export interface DubbingJob {
  id: string;
  job_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  output_path?: string;
  error?: string;
  expected_duration_sec?: number;
  target_languages?: string[];
  source_url?: string;
  target_url?: string;
  source_language: string;
  target_language: string;
}

export async function getDubbingProviders(): Promise<DubbingProvider[]> {
  const data = await fetchApi<{ providers?: DubbingProvider[] }>('/api/dubbing/providers');
  return data.providers || [];
}

export async function getDubbingLanguages(provider?: string): Promise<DubbingLanguages> {
  const endpoint = provider ? `/api/dubbing/languages?provider=${provider}` : '/api/dubbing/languages';
  const data = await fetchApi<{ languages?: DubbingLanguages }>(endpoint);
  return data.languages || {};
}

export async function uploadDubbingFile(file: File): Promise<{ input_path: string; filename?: string }> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE}/api/dubbing/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Upload failed: ${response.status}`);
  }

  return response.json();
}

export interface StartDubbingRequest {
  input_path: string;
  temp_id?: string;
  source_language?: string;
  target_language: string;
  provider?: string;
  name?: string;
  num_speakers?: number;
  watermark?: boolean;
  drop_background_audio?: boolean;
  use_profanity_filter?: boolean;
}

export async function startDubbing(request: StartDubbingRequest): Promise<DubbingJob> {
  return fetchApi('/api/dubbing/start', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

export async function getDubbingJob(jobId: string): Promise<DubbingJob> {
  return fetchApi<DubbingJob>(`/api/dubbing/job/${jobId}`);
}

export function getDubbingDownloadUrl(jobId: string): string {
  return `${API_BASE}/api/dubbing/job/${jobId}/download`;
}

// ============================================
// Voice Isolator
// ============================================

export interface VoiceIsolatorProvider extends ServiceProviderInfo {
  features?: string[];
  quota_minutes?: number;
  vram_gb?: number;
  requires_api_key?: string;
  install_command?: string;
  supports_fast_mode?: boolean;
}

export interface VoiceIsolatorJob {
  job_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  vocals_path?: string;
  instrumental_path?: string;
  error?: string;
}

export async function getVoiceIsolatorProviders(): Promise<VoiceIsolatorProvider[]> {
  const data = await fetchApi<{ providers?: VoiceIsolatorProvider[] }>('/api/voice-isolator/providers');
  return data.providers || [];
}

export async function uploadVoiceIsolatorAudio(
  file: File
): Promise<{ input_path: string; filename?: string }> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE}/api/voice-isolator/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Upload failed: ${response.status}`);
  }

  return response.json();
}

export async function startVoiceIsolation(request: {
  input_path: string;
  provider?: string;
}): Promise<{ job_id: string }> {
  const formData = new FormData();
  formData.append('input_path', request.input_path);
  if (request.provider) {
    formData.append('provider', request.provider);
  }

  const response = await fetch(`${API_BASE}/api/voice-isolator/isolate`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export async function getVoiceIsolatorJob(jobId: string): Promise<VoiceIsolatorJob> {
  return fetchApi<VoiceIsolatorJob>(`/api/voice-isolator/jobs/${jobId}`);
}

export function getVoiceIsolatorDownloadUrl(jobId: string, type: 'vocals' | 'instrumental'): string {
  return `${API_BASE}/api/voice-isolator/jobs/${jobId}/download/${type}`;
}

// ============================================
// Voice Changer
// ============================================

export interface VoiceChangerProvider extends ServiceProviderInfo {
  quota_minutes?: number;
  requires_api_key?: string;
}

export interface VoiceChangerVoice {
  voice_id: string;
  name: string;
  provider?: string;
  preview_url?: string;
  category?: string;
  labels?: Record<string, any>;
}

export interface VoiceChangerJob {
  job_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  output_path?: string;
  error?: string;
}

export async function getVoiceChangerProviders(): Promise<VoiceChangerProvider[]> {
  const data = await fetchApi<{ providers?: VoiceChangerProvider[] }>('/api/voice-changer/providers');
  return data.providers || [];
}

export async function getVoiceChangerVoices(provider?: string): Promise<VoiceChangerVoice[]> {
  const endpoint = provider ? `/api/voice-changer/voices?provider=${provider}` : '/api/voice-changer/voices';
  return fetchApi<VoiceChangerVoice[]>(endpoint);
}

export async function uploadVoiceChangerAudio(
  file: File
): Promise<{ input_path: string; filename?: string }> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE}/api/voice-changer/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Upload failed: ${response.status}`);
  }

  return response.json();
}

export async function startVoiceChanger(request: {
  input_path: string;
  voice_id: string;
  model_id?: string;
  stability?: number;
  similarity_boost?: number;
  style?: number;
  remove_background_noise?: boolean;
  provider?: string;
}): Promise<{ job_id: string }> {
  return fetchApi('/api/voice-changer/convert', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

export async function getVoiceChangerJob(jobId: string): Promise<VoiceChangerJob> {
  return fetchApi<VoiceChangerJob>(`/api/voice-changer/jobs/${jobId}`);
}

export function getVoiceChangerDownloadUrl(jobId: string): string {
  return `${API_BASE}/api/voice-changer/jobs/${jobId}/download`;
}

// ============================================
// Loopback
// ============================================

export interface LoopbackDevice {
  id: string;
  name: string;
  type: 'input' | 'output';
  is_default?: boolean;
  is_loopback?: boolean;
  index?: number;
}

export interface LoopbackStatus {
  active: boolean;
  available?: boolean;
  message?: string;
  input_device?: string;
  output_device?: string;
}

export interface LoopbackDevicesResponse {
  devices: LoopbackDevice[];
}

export async function getLoopbackDevices(): Promise<LoopbackDevicesResponse> {
  return fetchApi<LoopbackDevicesResponse>('/api/loopback/devices');
}

export async function getLoopbackStatus(): Promise<LoopbackStatus> {
  return fetchApi<LoopbackStatus>('/api/loopback/status');
}

export function getLoopbackWebSocketUrl(): string {
  const wsBase = API_BASE.replace('http', 'ws');
  return `${wsBase}/ws/loopback`;
}

// ============================================
// Models Management
// ============================================

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  size_mb?: number;
  downloaded: boolean;
  download_progress?: number;
}

export interface DiarizationModelInfo {
  id: string;
  name: string;
  accessible: boolean;
  required?: boolean;
  error?: string;
  accept_url: string;
}

export interface DiarizationStatus {
  status?: 'ready' | 'terms_required' | 'runtime_error' | 'not_configured' | 'downloading' | 'error';
  message?: string;
  token_configured?: boolean;
  hf_token_configured?: boolean;
  models?: DiarizationModelInfo[];
  pyannote_available?: boolean;
  pyannote_installed?: boolean;
  fallback_available?: boolean;
  model_errors?: string[];
  pyannote_error?: string;
}

export interface ApiProviderInfo {
  name: string;
  configured: boolean;
  features: string[];
  description?: string;
  supported?: Record<string, boolean>;
  pricing_unit?: string;
  pricing_note?: string;
  docs_url?: string;
  pricing_url?: string;
  console_url?: string;
  key_instructions?: string;
  key_label?: string;
  key_preview?: string;
}

export interface LocalModelInfo {
  id: string;
  name: string;
  size_mb: number;
  installed: boolean;
  description?: string;
}

export interface LocalModels {
  tts: LocalModelInfo[];
  stt: LocalModelInfo[];
  translation: LocalModelInfo[];
}

export interface LocalProviderInfo {
  id: string;
  service: string;
  name: string;
  is_available: boolean;
  description?: string;
  base_url?: string;
  docs_url?: string;
}

export interface ComprehensiveModelStatus {
  models: ModelInfo[];
  total_downloaded: number;
  total_available: number;
  diarization?: DiarizationStatus;
  api_providers?: Record<string, ApiProviderInfo>;
  local_models?: LocalModels;
  local_providers?: LocalProviderInfo[];
}

export interface HuggingFaceModelVerification {
  model: string;
  name?: string;
  status: 'ok' | 'forbidden' | 'error' | 'not_found';
  required?: boolean;
  message?: string;
  accept_url?: string;
}

export interface HuggingFaceVerification {
  valid: boolean;
  username?: string;
  error?: string;
  all_accessible?: boolean;
  message?: string;
  models: HuggingFaceModelVerification[];
}

export async function getComprehensiveModelStatus(): Promise<ComprehensiveModelStatus> {
  return fetchApi<ComprehensiveModelStatus>('/api/models/status');
}

export async function verifyHuggingFaceAccess(token?: string): Promise<HuggingFaceVerification> {
  return fetchApi<HuggingFaceVerification>('/api/models/verify-hf', {
    method: 'POST',
    body: JSON.stringify(token ? { token } : {}),
  });
}

export async function setProviderApiKey(provider: string, apiKey: string): Promise<void> {
  await fetchApi(`/api/providers/${provider}/api-key`, {
    method: 'PUT',
    body: JSON.stringify({ api_key: apiKey }),
  });
}

export async function deleteProviderApiKey(provider: string): Promise<void> {
  await fetchApi(`/api/providers/${provider}/api-key`, { method: 'DELETE' });
}

export interface DownloadModelResult {
  job_id: string;
  already_installed?: boolean;
}

export async function downloadModel(modelId: string): Promise<DownloadModelResult> {
  return fetchApi<DownloadModelResult>('/api/models/download', {
    method: 'POST',
    body: JSON.stringify({ model_id: modelId }),
  });
}

export async function deleteModel(modelId: string): Promise<void> {
  await fetchApi(`/api/models/${modelId}`, { method: 'DELETE' });
}

export interface DownloadProgress {
  progress: number;
  status: string;
  error?: string;
}

export async function getDownloadProgress(jobId: string): Promise<DownloadProgress> {
  return fetchApi<DownloadProgress>(`/api/models/download/${jobId}`);
}

// ============================================
// Settings (Extended)
// ============================================

export interface HotkeysSettings {
  [action: string]: string;
}

export interface ProviderCatalogEntry {
  id: string;
  name: string;
  type: ServiceType;
  description?: string;
  website?: string;
  api_key_required: boolean;
  api_key_configured: boolean;
  implemented?: boolean;
  docs_url?: string;
  pricing_url?: string;
  pricing_unit?: string;
  pricing_note?: string;
  console_url?: string;
  key_label?: string;
  key_instructions?: string;
}

export interface ApiKeysResponse {
  api_keys: Record<string, string | null>;
}

export async function getApiKeys(): Promise<ApiKeysResponse> {
  return fetchApi<ApiKeysResponse>('/api/settings/api-keys');
}

export interface ProviderCatalogResponse {
  providers: ProviderCatalogEntry[];
}

export async function getProviderCatalog(): Promise<ProviderCatalogResponse> {
  return fetchApi<ProviderCatalogResponse>('/api/providers/catalog');
}

export async function setApiKey(provider: string, apiKey: string): Promise<void> {
  await fetchApi(`/api/settings/api-keys/${provider}`, {
    method: 'PUT',
    body: JSON.stringify({ api_key: apiKey }),
  });
}

export async function testApiKey(provider: string): Promise<{ valid: boolean; error?: string }> {
  return fetchApi(`/api/settings/api-keys/${provider}/test`, { method: 'POST' });
}

export async function setHotkey(action: string, hotkey: string): Promise<void> {
  await fetchApi('/api/settings/hotkeys', {
    method: 'PUT',
    body: JSON.stringify({ [action]: hotkey }),
  });
}

export async function getHealth(): Promise<{ status: string; version: string }> {
  return fetchApi('/api/health');
}

export async function updateSetting(key: string, value: unknown): Promise<void> {
  await fetchApi('/api/settings', {
    method: 'PUT',
    body: JSON.stringify({ [key]: value }),
  });
}

// ============================================
// Voice Training
// ============================================

export interface TrainingEngine {
  id: string;
  name: string;
  description?: string;
  available: boolean;
  vram_gb_training?: number;
  vram_gb_inference?: number;
  min_dataset_minutes?: number;
  recommended_dataset_minutes?: number;
  install_command?: string;
}

export interface DatasetEntry {
  id: string;
  filename: string;
  audio_path: string;
  transcription: string;
  duration_seconds: number;
  sample_rate: number;
  is_valid: boolean;
  error?: string | null;
  text?: string;
  duration?: number;
  transcribed?: boolean;
}

export interface DatasetStats {
  total_entries: number;
  valid_entries: number;
  entries_with_transcription: number;
  total_duration_seconds: number;
  total_duration_minutes: number;
  avg_duration_seconds: number;
}

export interface TrainingStatus {
  job_id: string;
  status: 'idle' | 'preparing' | 'training' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  current_step?: string;
  current_epoch?: number;
  total_epochs?: number;
  current_loss?: number;
  best_loss?: number;
  eta_seconds?: number;
  error?: string;
  output_voice_id?: string;
}

export async function getTrainingEngines(): Promise<TrainingEngine[]> {
  return fetchApi<TrainingEngine[]>('/api/voice-training/engines');
}

export async function createTrainingDataset(name: string): Promise<{ dataset_id: string }> {
  const formData = new FormData();
  formData.append('name', name);

  const response = await fetch(`${API_BASE}/api/voice-training/datasets`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export async function uploadAudioToDataset(datasetId: string, file: File): Promise<DatasetEntry> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE}/api/voice-training/datasets/${datasetId}/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Upload failed: ${response.status}`);
  }

  return response.json();
}

export async function getDatasetEntries(datasetId: string): Promise<DatasetEntry[]> {
  return fetchApi<DatasetEntry[]>(`/api/voice-training/datasets/${datasetId}/entries`);
}

export async function getDatasetStats(datasetId: string): Promise<DatasetStats> {
  return fetchApi<DatasetStats>(`/api/voice-training/datasets/${datasetId}/stats`);
}

export async function updateDatasetEntry(datasetId: string, entryId: string, text: string): Promise<DatasetEntry> {
  return fetchApi<DatasetEntry>(`/api/voice-training/datasets/${datasetId}/entries/${entryId}`, {
    method: 'PUT',
    body: JSON.stringify({ text }),
  });
}

export async function deleteDatasetEntry(datasetId: string, entryId: string): Promise<void> {
  await fetchApi(`/api/voice-training/datasets/${datasetId}/entries/${entryId}`, { method: 'DELETE' });
}

export async function transcribeDataset(
  datasetId: string,
  entryId?: string,
  model?: string,
  language?: string
): Promise<Record<string, string>> {
  const params = new URLSearchParams();
  if (entryId) params.set('entry_id', entryId);
  if (model) params.set('model', model);
  if (language) params.set('language', language);
  const query = params.toString();

  const data = await fetchApi<{ transcriptions?: Record<string, string> }>(
    `/api/voice-training/datasets/${datasetId}/transcribe${query ? `?${query}` : ''}`,
    { method: 'POST' }
  );
  return data.transcriptions || {};
}

export async function startVoiceTraining(request: {
  dataset_id: string;
  engine: string;
  voice_name: string;
  epochs?: number;
  batch_size?: number;
  learning_rate?: number;
  language?: string;
}): Promise<{ job_id: string }> {
  return fetchApi('/api/voice-training/start', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

export async function getTrainingStatus(): Promise<TrainingStatus> {
  return fetchApi<TrainingStatus>('/api/voice-training/status');
}

export async function cancelVoiceTraining(): Promise<void> {
  await fetchApi('/api/voice-training/cancel', { method: 'POST' });
}

// ============================================
// Reader
// ============================================

export async function readerSpeak(request: {
  text: string;
  provider?: string;
  voice_id?: string;
  voice?: string;
  speed?: number;
  language?: string;
  device?: string;
  fast_mode?: boolean;
  [key: string]: unknown;
}): Promise<TTSGenerateResponse> {
  return fetchApi<TTSGenerateResponse>('/api/reader/speak', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

// ============================================
// Provider Utilities
// ============================================

export interface ServiceProviderModelVariant {
  id: string;
  name: string;
  description?: string;
}

export async function ensureProviderReady(
  service: ServiceType,
  providerId: string,
  modelId?: string
): Promise<{ ready: boolean; install_started?: boolean; install_status?: string; readiness?: Record<string, any> }> {
  return fetchApi(`/api/providers/${service}/${providerId}/ensure`, {
    method: 'POST',
    body: JSON.stringify({ model_id: modelId, auto_install: true }),
  });
}

// Export API_BASE for direct use
export const api = {
  baseUrl: API_BASE,
  fetch: fetchApi,
};

// ============================================
// Transcription
// ============================================

export interface TranscriptSegment {
  id: string;
  start?: number;
  end?: number;
  start_time?: number;
  end_time?: number;
  text: string;
  speaker?: string;
  speaker_id?: number;
  confidence?: number;
}

export type TranscriptionEngineId = 'fast' | 'whisper' | 'fasterwhisper' | 'insanely-fast-whisper' | string;

export interface TranscriptionEngine {
  id: TranscriptionEngineId;
  name: string;
  description?: string;
  supports_diarization: boolean;
  supports_live: boolean;
}

export type DiarizationMode = 'none' | 'auto' | 'manual' | 'pyannote' | 'basic';
export type DiarizationMethod = 'pyannote' | 'clustering' | 'none';

export interface TranscriptionDiarizationStatus {
  available: boolean;
  configured: boolean;
  model_loaded: boolean;
  error?: string;
}

export interface EngineStatus {
  engine: string;
  loaded: boolean;
  model?: string;
  device?: string;
  error?: string;
  engines?: Record<string, { name: string; loaded?: boolean; model?: string; available?: boolean }>;
}

// Re-export TranscriptionJob with extended properties for transcription page
export interface ExtendedTranscriptionJob extends TranscriptionJob {
  segments?: TranscriptSegment[];
  progress?: number;
  duration?: number;
  language?: string;
  engine?: string;
  diarization_enabled?: boolean;
  speakers?: string[];
}

export async function uploadForTranscription(
  file: File,
  language: string,
  enableDiarization: boolean,
  minSpeakers: number,
  maxSpeakers: number,
  whisperModel: string,
  enableAICleanup: boolean,
  diarizationMode: DiarizationMode,
  engine: string,
  onProgress?: (progress: number, loaded: number) => void
): Promise<{ job_id: string }> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('language', language);
  formData.append('enable_diarization', String(enableDiarization));
  formData.append('min_speakers', String(minSpeakers));
  formData.append('max_speakers', String(maxSpeakers));
  formData.append('model', whisperModel);
  formData.append('enable_ai_cleanup', String(enableAICleanup));
  formData.append('diarization_mode', diarizationMode);
  formData.append('engine', engine);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}/api/transcribe/upload`);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        const progress = Math.round((event.loaded / event.total) * 100);
        onProgress(progress, event.loaded);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error('Invalid JSON response'));
        }
      } else {
        reject(new Error(`Upload failed: ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error('Network error'));
    xhr.send(formData);
  });
}

export async function getTranscriptionStatus(jobId: string): Promise<ExtendedTranscriptionJob> {
  return fetchApi<ExtendedTranscriptionJob>(`/api/transcribe/status/${jobId}`);
}

export async function updateTranscriptSegments(
  jobId: string,
  segments: TranscriptSegment[]
): Promise<void> {
  await fetchApi(`/api/transcribe/${jobId}/segments`, {
    method: 'PUT',
    body: JSON.stringify({ segments }),
  });
}

export async function exportTranscript(
  jobId: string,
  format: 'txt' | 'srt' | 'vtt' | 'json',
  includeSpeakers?: boolean,
  includeTimestamps?: boolean
): Promise<Blob> {
  const params = new URLSearchParams({ format });
  if (includeSpeakers !== undefined) params.append('include_speakers', String(includeSpeakers));
  if (includeTimestamps !== undefined) params.append('include_timestamps', String(includeTimestamps));

  const response = await fetch(`${API_BASE}/api/transcribe/${jobId}/export?${params}`);

  if (!response.ok) {
    throw new Error(`Export failed: ${response.status}`);
  }

  return response.blob();
}

export async function importTranscriptionFromLink(
  url: string,
  language: string,
  enableDiarization: boolean,
  minSpeakers: number,
  maxSpeakers: number,
  whisperModel: string,
  enableAICleanup: boolean,
  diarizationMode: DiarizationMode,
  engine: string
): Promise<{ job_id: string }> {
  return fetchApi('/api/transcribe/import-link', {
    method: 'POST',
    body: JSON.stringify({
      url,
      language,
      enable_diarization: enableDiarization,
      min_speakers: minSpeakers,
      max_speakers: maxSpeakers,
      model: whisperModel,
      enable_ai_cleanup: enableAICleanup,
      diarization_mode: diarizationMode,
      engine,
    }),
  });
}

export async function getDiarizationStatus(): Promise<DiarizationStatus> {
  return fetchApi<DiarizationStatus>('/api/transcribe/diarization-status');
}

export async function setupHuggingFaceToken(token: string): Promise<{ success: boolean; error?: string }> {
  return fetchApi('/api/transcribe/setup-huggingface', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

export async function getEngineStatus(): Promise<EngineStatus> {
  return fetchApi<EngineStatus>('/api/transcribe/engine-status');
}

export async function cancelTranscriptionJob(jobId: string): Promise<{ cancelled: boolean }> {
  return fetchApi<{ cancelled: boolean }>(`/api/transcribe/${jobId}/cancel`, { method: 'POST' });
}

export async function pauseTranscriptionJob(jobId: string): Promise<{ paused: boolean; segments_saved?: number }> {
  return fetchApi<{ paused: boolean; segments_saved?: number }>(`/api/transcribe/${jobId}/pause`, { method: 'POST' });
}

export async function resumeTranscriptionJob(jobId: string): Promise<{ resumed: boolean; resume_from_time?: number; reason?: string }> {
  return fetchApi<{ resumed: boolean; resume_from_time?: number; reason?: string }>(`/api/transcribe/${jobId}/resume`, { method: 'POST' });
}

export async function rediarizeTranscription(
  jobId: string,
  options?: {
    num_speakers?: number;
    min_speakers?: number;
    max_speakers?: number;
    diarization_mode?: DiarizationMode;
  }
): Promise<void> {
  await fetchApi(`/api/transcribe/${jobId}/rediarize`, {
    method: 'POST',
    body: JSON.stringify(options || {}),
  });
}
