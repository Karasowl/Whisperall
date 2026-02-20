// ── Request Types ────────────────────────────────────────

export type DictateParams = {
  audio: Blob;
  session_id?: string;
  is_final?: boolean;
  language?: string;
  prompt?: string;
};

export type LiveChunkParams = {
  audio: Blob;
  session_id?: string;
  chunk_index?: number;
  translate_to?: string;
};

export type TranscribeJobParams = {
  language?: string;
  enable_diarization?: boolean;
  enable_translation?: boolean;
  target_language?: string;
  total_chunks: number;
};

export type TranscribeChunkParams = {
  index: number;
  storage_path: string;
  chunk_bytes?: number;
  duration_seconds?: number;
  rms_level?: number;
};

export type TranscribeRunParams = {
  max_chunks?: number;
};

export type TranscribeUrlParams = {
  url: string;
  language?: string;
  enable_diarization?: boolean;
};

export type TTSParams = {
  text: string;
  voice?: string;
  language?: string;
};

export type TranslateParams = {
  text: string;
  target_language: string;
};

export type AiEditParams = {
  text: string;
  mode?: string;
  prompt?: string;
};

// ── Response Types ───────────────────────────────────────

export type DictateResponse = {
  session_id: string;
  text: string;
  is_final: boolean;
};

export type LiveChunkResponse = {
  segment_id: string;
  text: string;
  translated_text?: string;
  segments?: Array<{ speaker?: string; text: string; start?: number; end?: number }>;
};

export type TranscribeJobResponse = {
  id: string;
  status: string;
  processed_chunks: number;
  total_chunks: number;
};

export type TranscribeResultResponse = {
  text: string;
  segments?: TranscriptSegment[] | null;
};

export type TTSResponse = {
  audio_url: string;
};

export type TTSVoice = {
  provider: "google" | "edge";
  name: string;
  locale: string;
  gender?: string | null;
  label?: string | null;
};

export type TTSVoicesResponse = {
  voices: TTSVoice[];
};

export type TranslateResponse = {
  text: string;
};

export type AiEditResponse = {
  text: string;
};

// ── Shared Domain Types ──────────────────────────────────

export type TranscriptSegment = {
  start: number;
  end: number;
  text: string;
  speaker?: string;
};

export type TranscriptResult = {
  segments: TranscriptSegment[];
  plain_text: string;
  language?: string;
};

export type LiveSegment = {
  id: string;
  text: string;
  translated_text?: string;
  speaker?: string;
  created_at: string;
};

export type AudioChunk = {
  id: string;
  index: number;
  duration_ms: number;
  mime_type: string;
};

export type UserPlan = "free" | "basic" | "pro";

export type UserProfile = {
  id: string;
  plan: UserPlan;
  created_at: string;
};

export type UsageRecord = {
  stt_seconds: number;
  tts_chars: number;
  translate_chars: number;
  transcribe_seconds: number;
  ai_edit_tokens: number;
  notes_count: number;
  storage_bytes: number;
};

export type PlanLimits = Record<UserPlan, UsageRecord>;

// ── History ──────────────────────────────────────────

export type HistoryEntry = {
  id: string;
  module: string;
  input_text: string | null;
  output_text: string | null;
  audio_url: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
};

// ── Usage API ──────────────────────────────────────────

export type UsageResponse = {
  plan: UserPlan;
  usage: UsageRecord;
  limits: UsageRecord;
  period_start: string;
  period_end: string;
  next_reset_at: string;
  generated_at: string;
};

// ── Admin API ──────────────────────────────────────────

export type AdminPricingEntry = {
  provider: string;
  resource: string;
  model: string | null;
  unit: string;
  usd_per_unit: number;
  effective_from: string; // YYYY-MM-DD
  updated_at: string | null;
};

export type AdminPricingUpsertParams = {
  provider: string;
  resource: string;
  model?: string | null;
  unit: string;
  usd_per_unit: number;
  effective_from?: string; // YYYY-MM-DD
};

export type AdminInvoiceEntry = {
  provider: string;
  period: string; // YYYY-MM-DD (month start)
  amount_usd: number;
  currency: string;
  notes: string | null;
  updated_at: string | null;
};

export type AdminInvoiceUpsertParams = {
  provider: string;
  period?: string; // YYYY-MM-DD (month start)
  amount_usd: number;
  currency?: string;
  notes?: string | null;
};

export type AdminCostBreakdown = {
  total_usd: number;
  by_provider: Record<string, number>;
};

export type AdminRevenueEntry = {
  period: string; // YYYY-MM-DD (month start)
  source: string; // total | stripe | appstore | ...
  amount_usd: number;
  currency: string;
  notes: string | null;
  updated_at: string | null;
};

export type AdminRevenueUpsertParams = {
  period?: string; // YYYY-MM-DD (month start)
  source?: string | null;
  amount_usd: number;
  currency?: string;
  notes?: string | null;
};

export type AdminRevenueBreakdown = {
  total_usd: number;
  by_source: Record<string, number>;
};

export type AdminOverviewResponse = {
  period_start: string;
  period_end: string;
  generated_at: string;
  users_total: number;
  users_active_30d: number;
  usage_total: UsageRecord;
  estimated_cost: AdminCostBreakdown;
  real_cost: AdminCostBreakdown;
  revenue: AdminRevenueBreakdown;
  profit_real_usd: number;
  profit_estimated_usd: number;
  pricing: AdminPricingEntry[];
  invoices: AdminInvoiceEntry[];
  revenue_entries: AdminRevenueEntry[];
};

// ── Folders ──────────────────────────────────────────

export type Folder = {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

export type CreateFolderParams = { name: string };
export type UpdateFolderParams = { name: string };

// ── Documents ──────────────────────────────────────────

export type DocumentSource = 'dictation' | 'live' | 'transcription' | 'manual' | 'reader';

export type Document = {
  id: string;
  user_id: string;
  title: string;
  content: string;
  source: DocumentSource | null;
  source_id: string | null;
  audio_url: string | null;
  tags: string[];
  folder_id: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateDocumentParams = {
  title: string;
  content: string;
  source?: DocumentSource;
  source_id?: string;
  audio_url?: string;
  tags?: string[];
  folder_id?: string;
};

export type UpdateDocumentParams = {
  title?: string;
  content?: string;
  source_id?: string | null;
  audio_url?: string | null;
  tags?: string[];
  folder_id?: string | null;
};

export type DocumentTranscriptionEntry = {
  id: string;
  document_id: string;
  user_id: string;
  block_id: string | null;
  source: "mic" | "system" | "audio" | null;
  language: string;
  diarization: boolean;
  text: string;
  segments: Array<{ start?: number; end?: number; speaker?: string; text: string }>;
  audio_url: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateDocumentTranscriptionParams = {
  block_id?: string | null;
  source?: "mic" | "system" | "audio" | null;
  language?: string;
  diarization?: boolean;
  text: string;
  segments?: Array<{ start?: number; end?: number; speaker?: string; text: string }>;
  audio_url?: string | null;
};

// ── Reader ──────────────────────────────────────────

export type ReaderDocument = Document & {
  source: "reader";
};

export type ReaderImportFileParams = {
  file: File | Blob;
  filename?: string;
  force_ocr?: boolean;
  language_hint?: string;
  save?: boolean;
};

export type ReaderImportUrlParams = {
  url: string;
  force_ocr?: boolean;
  language_hint?: string;
  save?: boolean;
};

export type ReaderImportResponse = {
  text: string;
  blocks: Array<{ page?: number; text: string }>;
  pages: number;
  title: string;
  source: "file" | "url";
  document_id?: string | null;
  rich_html?: string | null;
  toc?: Array<{ id: string; title: string; level: number }>;
  warning?: string | null;
};

export type ReaderProgress = {
  document_id: string;
  char_offset: number;
  playback_seconds: number;
  section_index: number;
  updated_at: string;
};

export type ReaderProgressUpsertParams = {
  char_offset?: number;
  playback_seconds?: number;
  section_index?: number;
  updated_at_client?: string;
};

export type ReaderBookmark = {
  id: string;
  document_id: string;
  char_offset: number;
  label: string;
  created_at: string;
};

export type CreateReaderBookmarkParams = {
  document_id: string;
  char_offset: number;
  label?: string;
};

export type ReaderAnnotation = {
  id: string;
  document_id: string;
  start_offset: number;
  end_offset: number;
  note: string;
  color: string;
  created_at: string;
  updated_at: string;
};

export type CreateReaderAnnotationParams = {
  document_id: string;
  start_offset: number;
  end_offset: number;
  note?: string;
  color?: string;
};

export type UpdateReaderAnnotationParams = {
  note?: string;
  color?: string;
};

export type ReaderDisplaySettings = {
  font_size: number;
  line_height: number;
  letter_spacing: number;
  theme: "paper" | "dark" | "high_contrast";
  highlight_mode: "word" | "sentence" | "paragraph" | "none";
  captions_on: boolean;
};

// ── API Keys ──────────────────────────────────────────

export type ApiKey = {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

export type CreateApiKeyParams = {
  name?: string;
};

export type CreateApiKeyResponse = ApiKey & {
  key: string; // full key, shown once
};
