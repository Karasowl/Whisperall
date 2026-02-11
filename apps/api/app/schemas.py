from datetime import datetime
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


class UsageResponse(BaseModel):
    plan: Literal["free", "basic", "pro"]
    usage: UsageRecordResponse
    limits: UsageRecordResponse
    period_start: datetime
    period_end: datetime
    next_reset_at: datetime
    generated_at: datetime


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
