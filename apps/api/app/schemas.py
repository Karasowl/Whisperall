from datetime import datetime, date
from typing import Literal

from pydantic import BaseModel, Field


# ── Requests ──────────────────────────────────────────────

class DictateRequest(BaseModel):
    session_id: str | None = None
    chunk_index: int = 0
    is_final: bool = False
    language: str | None = None
    prompt: str | None = None


class LiveChunkRequest(BaseModel):
    session_id: str | None = None
    chunk_index: int = 0
    translate_to: str | None = None


class TranscribeJobRequest(BaseModel):
    language: str | None = None
    enable_diarization: bool = False
    enable_translation: bool = False
    target_language: str | None = None
    total_chunks: int = Field(..., ge=1)


class TranscribeChunkRegister(BaseModel):
    index: int = Field(..., ge=0)
    storage_path: str
    duration_seconds: float | None = None
    rms_level: float | None = Field(default=None, ge=0, le=1)
    chunk_bytes: int | None = Field(default=None, ge=0)


class TranscribeUrlRequest(BaseModel):
    url: str
    language: str | None = None
    enable_diarization: bool = False


class TranscribeRunRequest(BaseModel):
    max_chunks: int = Field(default=10, ge=1, le=50)


class TTSRequest(BaseModel):
    text: str
    voice: str | None = None
    language: str | None = None


class TranslateRequest(BaseModel):
    text: str
    target_language: str


class AiEditRequest(BaseModel):
    text: str
    mode: str = "clean_fillers"
    prompt: str | None = None


class ReaderImportUrlRequest(BaseModel):
    url: str
    force_ocr: bool = False
    language_hint: str | None = None
    save: bool = True


class ReaderProgressUpsertRequest(BaseModel):
    char_offset: int = Field(default=0, ge=0)
    playback_seconds: float = Field(default=0, ge=0)
    section_index: int = Field(default=0, ge=0)
    updated_at_client: datetime | None = None


class ReaderBookmarkCreateRequest(BaseModel):
    document_id: str
    char_offset: int = Field(default=0, ge=0)
    label: str | None = None


class ReaderAnnotationCreateRequest(BaseModel):
    document_id: str
    start_offset: int = Field(..., ge=0)
    end_offset: int = Field(..., ge=0)
    note: str = ""
    color: str = "#137fec"


class ReaderAnnotationUpdateRequest(BaseModel):
    note: str | None = None
    color: str | None = None


# ── Responses ─────────────────────────────────────────────

class DictateResponse(BaseModel):
    session_id: str
    text: str
    is_final: bool


class LiveChunkResponse(BaseModel):
    segment_id: str
    text: str
    translated_text: str | None = None
    segments: list[dict] | None = None


class TranscribeJobResponse(BaseModel):
    id: str
    status: str
    processed_chunks: int
    total_chunks: int


class TTSResponse(BaseModel):
    audio_url: str


class TTSVoice(BaseModel):
    provider: Literal["google", "edge"]
    name: str
    locale: str
    gender: str | None = None
    label: str | None = None


class TTSVoicesResponse(BaseModel):
    voices: list[TTSVoice]


class TranslateResponse(BaseModel):
    text: str


class AiEditResponse(BaseModel):
    text: str


class UsageRecordResponse(BaseModel):
    stt_seconds: int = Field(default=0, ge=0)
    tts_chars: int = Field(default=0, ge=0)
    translate_chars: int = Field(default=0, ge=0)
    transcribe_seconds: int = Field(default=0, ge=0)
    ai_edit_tokens: int = Field(default=0, ge=0)
    notes_count: int = Field(default=0, ge=0)
    storage_bytes: int = Field(default=0, ge=0)


class UsageResponse(BaseModel):
    plan: Literal["free", "basic", "pro"]
    usage: UsageRecordResponse
    limits: UsageRecordResponse
    period_start: datetime
    period_end: datetime
    next_reset_at: datetime
    generated_at: datetime


class ReaderImportResponse(BaseModel):
    text: str
    blocks: list[dict] = []
    pages: int = 0
    title: str
    source: str
    document_id: str | None = None
    rich_html: str | None = None
    toc: list[dict] = []
    warning: str | None = None


class ReaderProgressResponse(BaseModel):
    document_id: str
    char_offset: int = Field(default=0, ge=0)
    playback_seconds: float = Field(default=0, ge=0)
    section_index: int = Field(default=0, ge=0)
    updated_at: datetime


class ReaderBookmarkResponse(BaseModel):
    id: str
    document_id: str
    char_offset: int = Field(default=0, ge=0)
    label: str
    created_at: datetime


class ReaderAnnotationResponse(BaseModel):
    id: str
    document_id: str
    start_offset: int = Field(..., ge=0)
    end_offset: int = Field(..., ge=0)
    note: str
    color: str
    created_at: datetime
    updated_at: datetime


# ── Admin / Business ────────────────────────────────────────

class AdminPricingEntry(BaseModel):
    provider: str
    resource: str
    model: str | None = None
    unit: str
    usd_per_unit: float
    effective_from: date
    updated_at: datetime | None = None


class AdminPricingUpsertRequest(BaseModel):
    provider: str
    resource: str
    model: str | None = None
    unit: str
    usd_per_unit: float
    effective_from: date | None = None


class AdminInvoiceEntry(BaseModel):
    provider: str
    period: date
    amount_usd: float
    currency: str = "USD"
    notes: str | None = None
    updated_at: datetime | None = None


class AdminInvoiceUpsertRequest(BaseModel):
    provider: str
    period: date | None = None
    amount_usd: float
    currency: str = "USD"
    notes: str | None = None


class AdminCostBreakdown(BaseModel):
    total_usd: float
    by_provider: dict[str, float]


class AdminRevenueEntry(BaseModel):
    period: date
    source: str = "total"
    amount_usd: float
    currency: str = "USD"
    notes: str | None = None
    updated_at: datetime | None = None


class AdminRevenueUpsertRequest(BaseModel):
    period: date | None = None
    source: str | None = None
    amount_usd: float
    currency: str = "USD"
    notes: str | None = None


class AdminRevenueBreakdown(BaseModel):
    total_usd: float
    by_source: dict[str, float]


class AdminOverviewResponse(BaseModel):
    period_start: datetime
    period_end: datetime
    generated_at: datetime
    users_total: int
    users_active_30d: int
    usage_total: UsageRecordResponse
    estimated_cost: AdminCostBreakdown
    real_cost: AdminCostBreakdown
    revenue: AdminRevenueBreakdown
    profit_real_usd: float
    profit_estimated_usd: float
    pricing: list[AdminPricingEntry]
    invoices: list[AdminInvoiceEntry]
    revenue_entries: list[AdminRevenueEntry]


# ── Shared ────────────────────────────────────────────────

class TranscriptSegment(BaseModel):
    start: float
    end: float
    text: str
    speaker: str | None = None


class TranscriptResult(BaseModel):
    segments: list[TranscriptSegment]
    plain_text: str
    language: str | None = None
