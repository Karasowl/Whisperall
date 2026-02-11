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
