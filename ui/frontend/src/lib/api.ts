/**
 * Whisperall API Client
 * Auto-generated based on backend API routes
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5123';

// ============================================
// Types
// ============================================

export type ServiceType = 'tts' | 'stt' | 'music' | 'ai';

export interface ServiceProviderInfo {
  id: string;
  name: string;
  type: ServiceType;
  enabled: boolean;
  configured: boolean;
  description?: string;
  apiKeyRequired?: boolean;
  models?: string[];
}

export interface TTSProviderInfo extends ServiceProviderInfo {
  type: 'tts';
  voices?: Voice[];
  supportsCloning?: boolean;
  supportsStreaming?: boolean;
  // Extended properties for detailed TTS providers
  default_model?: string;
  voice_cloning?: 'none' | 'optional' | 'required';
  preset_voices?: TTSPresetVoice[];
  supported_languages?: string[];
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
  type: 'music';
  genres?: string[];
}

export interface TTSModelVariant {
  id: string;
  name: string;
  description?: string;
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
  // Extended TTS model properties
  supports_exaggeration?: boolean;
  supports_cfg?: boolean;
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
  settings: Record<string, unknown>;
  isDefault?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface HistoryFilter {
  module?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  favorite?: boolean;
}

export interface HistoryModuleInfo {
  id: string;
  name: string;
  count: number;
}

export interface SystemCapabilities {
  ffmpegInstalled: boolean;
  sttInstalled: boolean;
  gpuAvailable: boolean;
  cudaVersion?: string;
  platform: string;
  pythonVersion: string;
}

export interface MediaUploadResponse {
  tempId: string;
  path: string;
  duration?: number;
  format?: string;
}

export interface FFmpegStatus {
  installed: boolean;
  version?: string;
  path?: string;
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
  const endpoint = type ? `/api/tts/providers?type=${type}` : '/api/tts/providers';
  return fetchApi<ServiceProviderInfo[]>(endpoint);
}

export async function getProviderSelection(type: ServiceType): Promise<string | null> {
  const providers = await getServiceProviders(type);
  const active = providers.find(p => p.enabled);
  return active?.id || null;
}

export async function setProvider(type: ServiceType, providerId: string): Promise<void> {
  await fetchApi(`/api/tts/providers/${providerId}/activate`, { method: 'POST' });
}

// TTS Providers
export async function getTTSProviders(): Promise<TTSProviderInfo[]> {
  return fetchApi<TTSProviderInfo[]>('/api/tts/providers');
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
    return await fetchApi<TTSPresetVoice[]>(endpoint);
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
  return fetchApi<Model[]>('/api/models');
}

// Languages
export async function getLanguages(): Promise<Language[]> {
  return fetchApi<Language[]>('/api/languages');
}

// Presets
export async function getPresets(): Promise<Preset[]> {
  return fetchApi<Preset[]>('/api/presets');
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
export async function getHistoryModules(): Promise<HistoryModuleInfo[]> {
  return fetchApi<HistoryModuleInfo[]>('/api/history/modules/list');
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
  voiceName: string
): Promise<Voice> {
  return fetchApi<Voice>('/api/media/trim', {
    method: 'POST',
    body: JSON.stringify({ tempId, start, end, voiceName }),
  });
}

export async function cleanupTempMedia(tempId: string): Promise<void> {
  await fetchApi(`/api/media/${tempId}`, { method: 'DELETE' });
}

// AI Features
export async function aiEdit(
  text: string,
  instruction: string,
  provider?: string
): Promise<{ result: string }> {
  return fetchApi('/api/ai/edit', {
    method: 'POST',
    body: JSON.stringify({ text, instruction, provider }),
  });
}

export async function translateText(
  text: string,
  targetLanguage: string,
  sourceLanguage?: string
): Promise<{ result: string }> {
  return fetchApi('/api/ai/translate', {
    method: 'POST',
    body: JSON.stringify({ text, targetLanguage, sourceLanguage }),
  });
}

// Settings
export async function getAllSettings(): Promise<Record<string, unknown>> {
  return fetchApi<Record<string, unknown>>('/api/settings');
}

export async function getHotkeys(): Promise<Record<string, string>> {
  return fetchApi<Record<string, string>>('/api/settings/hotkeys');
}
