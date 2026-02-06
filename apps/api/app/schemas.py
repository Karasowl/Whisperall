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
    index: int
    storage_path: str
    duration_seconds: float | None = None


class TranscribeRunRequest(BaseModel):
    max_chunks: int = 10


class TTSRequest(BaseModel):
    text: str
    voice: str | None = None


class TranslateRequest(BaseModel):
    text: str
    target_language: str


class AiEditRequest(BaseModel):
    text: str
    mode: str = "clean_fillers"


# ── Responses ─────────────────────────────────────────────

class DictateResponse(BaseModel):
    session_id: str
    text: str
    is_final: bool


class LiveChunkResponse(BaseModel):
    segment_id: str
    text: str
    translated_text: str | None = None


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
