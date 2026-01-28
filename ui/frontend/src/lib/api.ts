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
  language?: string;
  gender?: string;
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
}

export interface Model {
  id: string;
  name: string;
  provider: string;
  type: ServiceType;
  description?: string;
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

export async function getTTSProviderVoices(providerId: string): Promise<TTSPresetVoice[]> {
  const provider = await getTTSProvider(providerId);
  return (provider.voices || []).map(v => ({
    id: v.id,
    name: v.name,
    provider: providerId,
    previewUrl: v.previewUrl,
    language: v.language,
    gender: v.gender,
  }));
}

// Voices
export async function getVoices(): Promise<Voice[]> {
  return fetchApi<Voice[]>('/api/voices');
}

export async function createVoice(voice: Partial<Voice>): Promise<Voice> {
  return fetchApi<Voice>('/api/voices', {
    method: 'POST',
    body: JSON.stringify(voice),
  });
}

export async function deleteVoice(voiceId: string): Promise<void> {
  await fetchApi(`/api/voices/${voiceId}`, { method: 'DELETE' });
}

export async function analyzeVoice(voiceId: string): Promise<Record<string, unknown>> {
  return fetchApi<Record<string, unknown>>(`/api/voices/${voiceId}/analyze`);
}

export function getAudioUrl(path: string): string {
  if (path.startsWith('http')) return path;
  return `${API_BASE}/api/audio/${encodeURIComponent(path)}`;
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
