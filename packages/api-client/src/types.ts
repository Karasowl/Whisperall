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
  duration_seconds?: number;
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

// ── Documents ──────────────────────────────────────────

export type DocumentSource = 'dictation' | 'live' | 'transcription' | 'manual';

export type Document = {
  id: string;
  user_id: string;
  title: string;
  content: string;
  source: DocumentSource | null;
  source_id: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
};

export type CreateDocumentParams = {
  title: string;
  content: string;
  source?: DocumentSource;
  tags?: string[];
};

export type UpdateDocumentParams = {
  title?: string;
  content?: string;
  tags?: string[];
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
