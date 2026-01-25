"""
Centralized Error Code Catalog for Whisperall

Error codes are organized by module with numeric ranges:
- 1xxx: TTS (Text-to-Speech)
- 2xxx: STT (Speech-to-Text)
- 3xxx: Transcription
- 4xxx: Diarization
- 5xxx: Music Generation
- 6xxx: SFX (Sound Effects)
- 7xxx: History
- 8xxx: Voice Changer
- 9xxx: Voice Isolator
- 10xx: Dubbing
- 11xx: Loopback
- 12xx: AI Editor
- 13xx: Reader
- 90xx: Provider/API errors
- 99xx: System/General errors
"""

from enum import Enum, auto
from typing import Dict, Optional


class ErrorCategory(Enum):
    """High-level error categories for grouping"""
    TTS = "tts"
    STT = "stt"
    TRANSCRIPTION = "transcription"
    DIARIZATION = "diarization"
    MUSIC = "music"
    SFX = "sfx"
    HISTORY = "history"
    VOICE_CHANGER = "voice_changer"
    VOICE_ISOLATOR = "voice_isolator"
    DUBBING = "dubbing"
    LOOPBACK = "loopback"
    AI_EDITOR = "ai_editor"
    READER = "reader"
    PROVIDER = "provider"
    SYSTEM = "system"


class ErrorCode(Enum):
    """
    Centralized error codes with numeric values.

    Each code includes:
    - Numeric value for stable identification
    - Category for grouping
    - Whether the error is retryable
    - Human-readable description
    """

    # ==========================================
    # TTS Errors (1xxx)
    # ==========================================
    TTS_MODEL_LOAD_FAILED = 1001
    TTS_MODEL_NOT_FOUND = 1002
    TTS_CUDA_OOM = 1003
    TTS_VOICE_NOT_FOUND = 1004
    TTS_GENERATION_FAILED = 1005
    TTS_AUDIO_INVALID = 1006
    TTS_TEXT_TOO_LONG = 1007
    TTS_LANGUAGE_UNSUPPORTED = 1008
    TTS_VOICE_CLONE_FAILED = 1009
    TTS_AUDIO_REFERENCE_INVALID = 1010
    TTS_PROVIDER_NOT_CONFIGURED = 1011
    TTS_CHUNK_FAILED = 1012
    TTS_CONCAT_FAILED = 1013
    TTS_FORMAT_CONVERSION_FAILED = 1014

    # ==========================================
    # STT Errors (2xxx)
    # ==========================================
    STT_MODEL_LOAD_FAILED = 2001
    STT_MODEL_NOT_FOUND = 2002
    STT_AUDIO_INVALID = 2003
    STT_TRANSCRIPTION_FAILED = 2004
    STT_LANGUAGE_UNSUPPORTED = 2005
    STT_AUDIO_TOO_SHORT = 2006
    STT_AUDIO_TOO_LONG = 2007
    STT_CUDA_OOM = 2008
    STT_PROVIDER_NOT_CONFIGURED = 2009
    STT_VAD_FAILED = 2010

    # ==========================================
    # Transcription Errors (3xxx)
    # ==========================================
    TRANS_JOB_NOT_FOUND = 3001
    TRANS_JOB_ALREADY_EXISTS = 3002
    TRANS_FILE_NOT_FOUND = 3003
    TRANS_FILE_TOO_LARGE = 3004
    TRANS_FILE_INVALID = 3005
    TRANS_INTERRUPTED = 3006
    TRANS_CANCELLED = 3007
    TRANS_OUTPUT_FAILED = 3008
    TRANS_RESUME_FAILED = 3009
    TRANS_SEGMENT_FAILED = 3010
    TRANS_FFMPEG_FAILED = 3011

    # ==========================================
    # Diarization Errors (4xxx)
    # ==========================================
    DIAR_MODEL_LOAD_FAILED = 4001
    DIAR_AUTH_REQUIRED = 4002
    DIAR_THERMAL_GUARD = 4003
    DIAR_NO_SPEAKERS = 4004
    DIAR_PROCESSING_FAILED = 4005
    DIAR_CLUSTERING_FAILED = 4006
    DIAR_CUDA_OOM = 4007
    DIAR_AUDIO_INVALID = 4008
    DIAR_DIARIZATION_FAILED = 4009

    # ==========================================
    # Music Generation Errors (5xxx)
    # ==========================================
    MUSIC_MODEL_UNAVAILABLE = 5001
    MUSIC_MODEL_LOAD_FAILED = 5002
    MUSIC_CUDA_OOM = 5003
    MUSIC_GENERATION_FAILED = 5004
    MUSIC_PROMPT_INVALID = 5005
    MUSIC_DURATION_INVALID = 5006
    MUSIC_OUTPUT_FAILED = 5007

    # ==========================================
    # SFX Errors (6xxx)
    # ==========================================
    SFX_MODEL_UNAVAILABLE = 6001
    SFX_MODEL_LOAD_FAILED = 6002
    SFX_VIDEO_INVALID = 6003
    SFX_GENERATION_FAILED = 6004
    SFX_CUDA_OOM = 6005
    SFX_PROMPT_INVALID = 6006
    SFX_OUTPUT_FAILED = 6007

    # ==========================================
    # History Errors (7xxx)
    # ==========================================
    HIST_DB_LOCKED = 7001
    HIST_DB_CORRUPTED = 7002
    HIST_DISK_FULL = 7003
    HIST_ENTRY_NOT_FOUND = 7004
    HIST_WRITE_FAILED = 7005
    HIST_READ_FAILED = 7006
    HIST_DELETE_FAILED = 7007
    HIST_MIGRATION_FAILED = 7008

    # ==========================================
    # Voice Changer Errors (8xxx)
    # ==========================================
    VC_MODEL_UNAVAILABLE = 8001
    VC_MODEL_LOAD_FAILED = 8002
    VC_VOICE_NOT_FOUND = 8003
    VC_CONVERSION_FAILED = 8004
    VC_CUDA_OOM = 8005
    VC_AUDIO_INVALID = 8006
    VC_PITCH_INVALID = 8007

    # ==========================================
    # Voice Isolator Errors (9xxx)
    # ==========================================
    VI_MODEL_UNAVAILABLE = 9001
    VI_MODEL_LOAD_FAILED = 9002
    VI_SEPARATION_FAILED = 9003
    VI_CUDA_OOM = 9004
    VI_AUDIO_INVALID = 9005
    VI_OUTPUT_FAILED = 9006

    # ==========================================
    # Dubbing Errors (10xx)
    # ==========================================
    DUB_VIDEO_INVALID = 10001
    DUB_TRANSLATION_FAILED = 10002
    DUB_SYNC_FAILED = 10003
    DUB_TTS_FAILED = 10004
    DUB_AUDIO_MIX_FAILED = 10005
    DUB_OUTPUT_FAILED = 10006
    DUB_LANGUAGE_UNSUPPORTED = 10007
    DUB_DUBBING_FAILED = 10008

    # ==========================================
    # Loopback Errors (11xx)
    # ==========================================
    LOOP_DEVICE_NOT_FOUND = 11001
    LOOP_CAPTURE_FAILED = 11002
    LOOP_WEBSOCKET_CLOSED = 11003
    LOOP_BUFFER_OVERFLOW = 11004
    LOOP_PERMISSION_DENIED = 11005
    LOOP_DEVICE_BUSY = 11006

    # ==========================================
    # AI Editor Errors (12xx)
    # ==========================================
    AI_PROVIDER_UNAVAILABLE = 12001
    AI_API_KEY_INVALID = 12002
    AI_RATE_LIMITED = 12003
    AI_RESPONSE_INVALID = 12004
    AI_TIMEOUT = 12005
    AI_CONTEXT_TOO_LONG = 12006
    AI_PROMPT_INVALID = 12007
    AI_EDIT_FAILED = 12008

    # ==========================================
    # Reader Errors (13xx)
    # ==========================================
    READ_TEXT_EMPTY = 13001
    READ_TTS_FAILED = 13002
    READ_CLIPBOARD_FAILED = 13003
    READ_FILE_INVALID = 13004
    READ_CANCELLED = 13005

    # ==========================================
    # Provider/API Errors (90xx)
    # ==========================================
    PROVIDER_API_KEY_INVALID = 9001
    PROVIDER_API_KEY_MISSING = 9002
    PROVIDER_RATE_LIMITED = 9003
    PROVIDER_TIMEOUT = 9004
    PROVIDER_UNAVAILABLE = 9005
    PROVIDER_RESPONSE_INVALID = 9006
    PROVIDER_QUOTA_EXCEEDED = 9007
    PROVIDER_AUTH_FAILED = 9008
    PROVIDER_NOT_FOUND = 9009

    # ==========================================
    # System/General Errors (99xx)
    # ==========================================
    SYS_DISK_FULL = 9901
    SYS_MEMORY_LOW = 9902
    SYS_CUDA_UNAVAILABLE = 9903
    SYS_FFMPEG_MISSING = 9904
    SYS_PERMISSION_DENIED = 9905
    SYS_NETWORK_ERROR = 9906
    SYS_INTERNAL_ERROR = 9999


# Metadata for each error code
_ERROR_METADATA: Dict[ErrorCode, Dict] = {
    # TTS
    ErrorCode.TTS_MODEL_LOAD_FAILED: {
        "category": ErrorCategory.TTS,
        "retryable": False,
        "description": "Failed to load TTS model",
    },
    ErrorCode.TTS_MODEL_NOT_FOUND: {
        "category": ErrorCategory.TTS,
        "retryable": False,
        "description": "TTS model not found or not downloaded",
    },
    ErrorCode.TTS_CUDA_OOM: {
        "category": ErrorCategory.TTS,
        "retryable": True,
        "description": "GPU out of memory during TTS generation",
    },
    ErrorCode.TTS_VOICE_NOT_FOUND: {
        "category": ErrorCategory.TTS,
        "retryable": False,
        "description": "Voice ID does not exist",
    },
    ErrorCode.TTS_GENERATION_FAILED: {
        "category": ErrorCategory.TTS,
        "retryable": True,
        "description": "Audio generation failed",
    },
    ErrorCode.TTS_AUDIO_INVALID: {
        "category": ErrorCategory.TTS,
        "retryable": True,
        "description": "Generated audio is invalid or corrupted",
    },
    ErrorCode.TTS_TEXT_TOO_LONG: {
        "category": ErrorCategory.TTS,
        "retryable": False,
        "description": "Input text exceeds maximum length",
    },
    ErrorCode.TTS_LANGUAGE_UNSUPPORTED: {
        "category": ErrorCategory.TTS,
        "retryable": False,
        "description": "Language not supported by TTS model",
    },
    ErrorCode.TTS_VOICE_CLONE_FAILED: {
        "category": ErrorCategory.TTS,
        "retryable": True,
        "description": "Voice cloning failed",
    },
    ErrorCode.TTS_AUDIO_REFERENCE_INVALID: {
        "category": ErrorCategory.TTS,
        "retryable": False,
        "description": "Reference audio for voice cloning is invalid",
    },
    ErrorCode.TTS_PROVIDER_NOT_CONFIGURED: {
        "category": ErrorCategory.TTS,
        "retryable": False,
        "description": "TTS provider not configured or API key missing",
    },
    ErrorCode.TTS_CHUNK_FAILED: {
        "category": ErrorCategory.TTS,
        "retryable": True,
        "description": "Failed to generate audio for text chunk",
    },
    ErrorCode.TTS_CONCAT_FAILED: {
        "category": ErrorCategory.TTS,
        "retryable": True,
        "description": "Failed to concatenate audio segments",
    },
    ErrorCode.TTS_FORMAT_CONVERSION_FAILED: {
        "category": ErrorCategory.TTS,
        "retryable": True,
        "description": "Failed to convert audio format",
    },

    # STT
    ErrorCode.STT_MODEL_LOAD_FAILED: {
        "category": ErrorCategory.STT,
        "retryable": False,
        "description": "Failed to load STT model",
    },
    ErrorCode.STT_MODEL_NOT_FOUND: {
        "category": ErrorCategory.STT,
        "retryable": False,
        "description": "STT model not found or not downloaded",
    },
    ErrorCode.STT_AUDIO_INVALID: {
        "category": ErrorCategory.STT,
        "retryable": False,
        "description": "Audio format not supported",
    },
    ErrorCode.STT_TRANSCRIPTION_FAILED: {
        "category": ErrorCategory.STT,
        "retryable": True,
        "description": "Transcription failed",
    },
    ErrorCode.STT_LANGUAGE_UNSUPPORTED: {
        "category": ErrorCategory.STT,
        "retryable": False,
        "description": "Language not supported",
    },
    ErrorCode.STT_AUDIO_TOO_SHORT: {
        "category": ErrorCategory.STT,
        "retryable": False,
        "description": "Audio too short for transcription",
    },
    ErrorCode.STT_AUDIO_TOO_LONG: {
        "category": ErrorCategory.STT,
        "retryable": False,
        "description": "Audio exceeds maximum length",
    },
    ErrorCode.STT_CUDA_OOM: {
        "category": ErrorCategory.STT,
        "retryable": True,
        "description": "GPU out of memory during transcription",
    },
    ErrorCode.STT_PROVIDER_NOT_CONFIGURED: {
        "category": ErrorCategory.STT,
        "retryable": False,
        "description": "STT provider not configured",
    },
    ErrorCode.STT_VAD_FAILED: {
        "category": ErrorCategory.STT,
        "retryable": True,
        "description": "Voice activity detection failed",
    },

    # Transcription
    ErrorCode.TRANS_JOB_NOT_FOUND: {
        "category": ErrorCategory.TRANSCRIPTION,
        "retryable": False,
        "description": "Transcription job not found",
    },
    ErrorCode.TRANS_JOB_ALREADY_EXISTS: {
        "category": ErrorCategory.TRANSCRIPTION,
        "retryable": False,
        "description": "Transcription job already exists",
    },
    ErrorCode.TRANS_FILE_NOT_FOUND: {
        "category": ErrorCategory.TRANSCRIPTION,
        "retryable": False,
        "description": "Input file not found",
    },
    ErrorCode.TRANS_FILE_TOO_LARGE: {
        "category": ErrorCategory.TRANSCRIPTION,
        "retryable": False,
        "description": "File exceeds maximum size",
    },
    ErrorCode.TRANS_FILE_INVALID: {
        "category": ErrorCategory.TRANSCRIPTION,
        "retryable": False,
        "description": "Invalid or corrupted file",
    },
    ErrorCode.TRANS_INTERRUPTED: {
        "category": ErrorCategory.TRANSCRIPTION,
        "retryable": True,
        "description": "Transcription was interrupted",
    },
    ErrorCode.TRANS_CANCELLED: {
        "category": ErrorCategory.TRANSCRIPTION,
        "retryable": False,
        "description": "Transcription was cancelled by user",
    },
    ErrorCode.TRANS_OUTPUT_FAILED: {
        "category": ErrorCategory.TRANSCRIPTION,
        "retryable": True,
        "description": "Failed to write output file",
    },
    ErrorCode.TRANS_RESUME_FAILED: {
        "category": ErrorCategory.TRANSCRIPTION,
        "retryable": True,
        "description": "Failed to resume transcription",
    },
    ErrorCode.TRANS_SEGMENT_FAILED: {
        "category": ErrorCategory.TRANSCRIPTION,
        "retryable": True,
        "description": "Failed to process audio segment",
    },
    ErrorCode.TRANS_FFMPEG_FAILED: {
        "category": ErrorCategory.TRANSCRIPTION,
        "retryable": True,
        "description": "FFmpeg processing failed",
    },

    # Diarization
    ErrorCode.DIAR_MODEL_LOAD_FAILED: {
        "category": ErrorCategory.DIARIZATION,
        "retryable": False,
        "description": "Failed to load diarization model",
    },
    ErrorCode.DIAR_AUTH_REQUIRED: {
        "category": ErrorCategory.DIARIZATION,
        "retryable": False,
        "description": "HuggingFace token required for pyannote",
    },
    ErrorCode.DIAR_THERMAL_GUARD: {
        "category": ErrorCategory.DIARIZATION,
        "retryable": True,
        "description": "GPU thermal throttling triggered",
    },
    ErrorCode.DIAR_NO_SPEAKERS: {
        "category": ErrorCategory.DIARIZATION,
        "retryable": False,
        "description": "No speakers detected in audio",
    },
    ErrorCode.DIAR_PROCESSING_FAILED: {
        "category": ErrorCategory.DIARIZATION,
        "retryable": True,
        "description": "Diarization processing failed",
    },
    ErrorCode.DIAR_CLUSTERING_FAILED: {
        "category": ErrorCategory.DIARIZATION,
        "retryable": True,
        "description": "Speaker clustering failed",
    },
    ErrorCode.DIAR_CUDA_OOM: {
        "category": ErrorCategory.DIARIZATION,
        "retryable": True,
        "description": "GPU out of memory during diarization",
    },
    ErrorCode.DIAR_AUDIO_INVALID: {
        "category": ErrorCategory.DIARIZATION,
        "retryable": False,
        "description": "Audio format not supported for diarization",
    },
    ErrorCode.DIAR_DIARIZATION_FAILED: {
        "category": ErrorCategory.DIARIZATION,
        "retryable": True,
        "description": "Diarization failed",
    },

    # Music
    ErrorCode.MUSIC_MODEL_UNAVAILABLE: {
        "category": ErrorCategory.MUSIC,
        "retryable": False,
        "description": "Music generation model not installed",
    },
    ErrorCode.MUSIC_MODEL_LOAD_FAILED: {
        "category": ErrorCategory.MUSIC,
        "retryable": False,
        "description": "Failed to load music model",
    },
    ErrorCode.MUSIC_CUDA_OOM: {
        "category": ErrorCategory.MUSIC,
        "retryable": True,
        "description": "GPU out of memory during music generation",
    },
    ErrorCode.MUSIC_GENERATION_FAILED: {
        "category": ErrorCategory.MUSIC,
        "retryable": True,
        "description": "Music generation failed",
    },
    ErrorCode.MUSIC_PROMPT_INVALID: {
        "category": ErrorCategory.MUSIC,
        "retryable": False,
        "description": "Invalid music prompt",
    },
    ErrorCode.MUSIC_DURATION_INVALID: {
        "category": ErrorCategory.MUSIC,
        "retryable": False,
        "description": "Invalid duration specified",
    },
    ErrorCode.MUSIC_OUTPUT_FAILED: {
        "category": ErrorCategory.MUSIC,
        "retryable": True,
        "description": "Failed to write music output",
    },

    # SFX
    ErrorCode.SFX_MODEL_UNAVAILABLE: {
        "category": ErrorCategory.SFX,
        "retryable": False,
        "description": "SFX model not installed",
    },
    ErrorCode.SFX_MODEL_LOAD_FAILED: {
        "category": ErrorCategory.SFX,
        "retryable": False,
        "description": "Failed to load SFX model",
    },
    ErrorCode.SFX_VIDEO_INVALID: {
        "category": ErrorCategory.SFX,
        "retryable": False,
        "description": "Video format not supported",
    },
    ErrorCode.SFX_GENERATION_FAILED: {
        "category": ErrorCategory.SFX,
        "retryable": True,
        "description": "SFX generation failed",
    },
    ErrorCode.SFX_CUDA_OOM: {
        "category": ErrorCategory.SFX,
        "retryable": True,
        "description": "GPU out of memory during SFX generation",
    },
    ErrorCode.SFX_PROMPT_INVALID: {
        "category": ErrorCategory.SFX,
        "retryable": False,
        "description": "Invalid SFX prompt",
    },
    ErrorCode.SFX_OUTPUT_FAILED: {
        "category": ErrorCategory.SFX,
        "retryable": True,
        "description": "Failed to write SFX output",
    },

    # History
    ErrorCode.HIST_DB_LOCKED: {
        "category": ErrorCategory.HISTORY,
        "retryable": True,
        "description": "Database is locked",
    },
    ErrorCode.HIST_DB_CORRUPTED: {
        "category": ErrorCategory.HISTORY,
        "retryable": False,
        "description": "Database is corrupted",
    },
    ErrorCode.HIST_DISK_FULL: {
        "category": ErrorCategory.HISTORY,
        "retryable": False,
        "description": "Disk is full",
    },
    ErrorCode.HIST_ENTRY_NOT_FOUND: {
        "category": ErrorCategory.HISTORY,
        "retryable": False,
        "description": "History entry not found",
    },
    ErrorCode.HIST_WRITE_FAILED: {
        "category": ErrorCategory.HISTORY,
        "retryable": True,
        "description": "Failed to write history entry",
    },
    ErrorCode.HIST_READ_FAILED: {
        "category": ErrorCategory.HISTORY,
        "retryable": True,
        "description": "Failed to read history",
    },
    ErrorCode.HIST_DELETE_FAILED: {
        "category": ErrorCategory.HISTORY,
        "retryable": True,
        "description": "Failed to delete history entry",
    },
    ErrorCode.HIST_MIGRATION_FAILED: {
        "category": ErrorCategory.HISTORY,
        "retryable": False,
        "description": "Database migration failed",
    },

    # Voice Changer
    ErrorCode.VC_MODEL_UNAVAILABLE: {
        "category": ErrorCategory.VOICE_CHANGER,
        "retryable": False,
        "description": "Voice changer model not installed",
    },
    ErrorCode.VC_MODEL_LOAD_FAILED: {
        "category": ErrorCategory.VOICE_CHANGER,
        "retryable": False,
        "description": "Failed to load voice changer model",
    },
    ErrorCode.VC_VOICE_NOT_FOUND: {
        "category": ErrorCategory.VOICE_CHANGER,
        "retryable": False,
        "description": "Target voice not found",
    },
    ErrorCode.VC_CONVERSION_FAILED: {
        "category": ErrorCategory.VOICE_CHANGER,
        "retryable": True,
        "description": "Voice conversion failed",
    },
    ErrorCode.VC_CUDA_OOM: {
        "category": ErrorCategory.VOICE_CHANGER,
        "retryable": True,
        "description": "GPU out of memory during voice conversion",
    },
    ErrorCode.VC_AUDIO_INVALID: {
        "category": ErrorCategory.VOICE_CHANGER,
        "retryable": False,
        "description": "Input audio is invalid",
    },
    ErrorCode.VC_PITCH_INVALID: {
        "category": ErrorCategory.VOICE_CHANGER,
        "retryable": False,
        "description": "Invalid pitch shift value",
    },

    # Voice Isolator
    ErrorCode.VI_MODEL_UNAVAILABLE: {
        "category": ErrorCategory.VOICE_ISOLATOR,
        "retryable": False,
        "description": "Voice isolator model not installed",
    },
    ErrorCode.VI_MODEL_LOAD_FAILED: {
        "category": ErrorCategory.VOICE_ISOLATOR,
        "retryable": False,
        "description": "Failed to load voice isolator model",
    },
    ErrorCode.VI_SEPARATION_FAILED: {
        "category": ErrorCategory.VOICE_ISOLATOR,
        "retryable": True,
        "description": "Voice separation failed",
    },
    ErrorCode.VI_CUDA_OOM: {
        "category": ErrorCategory.VOICE_ISOLATOR,
        "retryable": True,
        "description": "GPU out of memory during separation",
    },
    ErrorCode.VI_AUDIO_INVALID: {
        "category": ErrorCategory.VOICE_ISOLATOR,
        "retryable": False,
        "description": "Input audio is invalid",
    },
    ErrorCode.VI_OUTPUT_FAILED: {
        "category": ErrorCategory.VOICE_ISOLATOR,
        "retryable": True,
        "description": "Failed to write output",
    },

    # Dubbing
    ErrorCode.DUB_VIDEO_INVALID: {
        "category": ErrorCategory.DUBBING,
        "retryable": False,
        "description": "Video format not supported",
    },
    ErrorCode.DUB_TRANSLATION_FAILED: {
        "category": ErrorCategory.DUBBING,
        "retryable": True,
        "description": "Translation failed",
    },
    ErrorCode.DUB_SYNC_FAILED: {
        "category": ErrorCategory.DUBBING,
        "retryable": True,
        "description": "Audio sync failed",
    },
    ErrorCode.DUB_TTS_FAILED: {
        "category": ErrorCategory.DUBBING,
        "retryable": True,
        "description": "TTS for dubbing failed",
    },
    ErrorCode.DUB_AUDIO_MIX_FAILED: {
        "category": ErrorCategory.DUBBING,
        "retryable": True,
        "description": "Audio mixing failed",
    },
    ErrorCode.DUB_OUTPUT_FAILED: {
        "category": ErrorCategory.DUBBING,
        "retryable": True,
        "description": "Failed to write output video",
    },
    ErrorCode.DUB_LANGUAGE_UNSUPPORTED: {
        "category": ErrorCategory.DUBBING,
        "retryable": False,
        "description": "Target language not supported",
    },
    ErrorCode.DUB_DUBBING_FAILED: {
        "category": ErrorCategory.DUBBING,
        "retryable": True,
        "description": "Dubbing operation failed",
    },

    # Loopback
    ErrorCode.LOOP_DEVICE_NOT_FOUND: {
        "category": ErrorCategory.LOOPBACK,
        "retryable": False,
        "description": "Audio device not found",
    },
    ErrorCode.LOOP_CAPTURE_FAILED: {
        "category": ErrorCategory.LOOPBACK,
        "retryable": True,
        "description": "Audio capture failed",
    },
    ErrorCode.LOOP_WEBSOCKET_CLOSED: {
        "category": ErrorCategory.LOOPBACK,
        "retryable": True,
        "description": "WebSocket connection closed",
    },
    ErrorCode.LOOP_BUFFER_OVERFLOW: {
        "category": ErrorCategory.LOOPBACK,
        "retryable": True,
        "description": "Audio buffer overflow",
    },
    ErrorCode.LOOP_PERMISSION_DENIED: {
        "category": ErrorCategory.LOOPBACK,
        "retryable": False,
        "description": "Permission denied for audio capture",
    },
    ErrorCode.LOOP_DEVICE_BUSY: {
        "category": ErrorCategory.LOOPBACK,
        "retryable": True,
        "description": "Audio device is busy",
    },

    # AI Editor
    ErrorCode.AI_PROVIDER_UNAVAILABLE: {
        "category": ErrorCategory.AI_EDITOR,
        "retryable": False,
        "description": "AI provider not configured",
    },
    ErrorCode.AI_API_KEY_INVALID: {
        "category": ErrorCategory.AI_EDITOR,
        "retryable": False,
        "description": "AI API key is invalid",
    },
    ErrorCode.AI_RATE_LIMITED: {
        "category": ErrorCategory.AI_EDITOR,
        "retryable": True,
        "description": "AI API rate limit exceeded",
    },
    ErrorCode.AI_RESPONSE_INVALID: {
        "category": ErrorCategory.AI_EDITOR,
        "retryable": True,
        "description": "AI response is invalid",
    },
    ErrorCode.AI_TIMEOUT: {
        "category": ErrorCategory.AI_EDITOR,
        "retryable": True,
        "description": "AI request timed out",
    },
    ErrorCode.AI_CONTEXT_TOO_LONG: {
        "category": ErrorCategory.AI_EDITOR,
        "retryable": False,
        "description": "Context exceeds maximum length",
    },
    ErrorCode.AI_PROMPT_INVALID: {
        "category": ErrorCategory.AI_EDITOR,
        "retryable": False,
        "description": "Invalid prompt",
    },
    ErrorCode.AI_EDIT_FAILED: {
        "category": ErrorCategory.AI_EDITOR,
        "retryable": True,
        "description": "AI edit operation failed",
    },

    # Reader
    ErrorCode.READ_TEXT_EMPTY: {
        "category": ErrorCategory.READER,
        "retryable": False,
        "description": "No text to read",
    },
    ErrorCode.READ_TTS_FAILED: {
        "category": ErrorCategory.READER,
        "retryable": True,
        "description": "TTS synthesis failed",
    },
    ErrorCode.READ_CLIPBOARD_FAILED: {
        "category": ErrorCategory.READER,
        "retryable": True,
        "description": "Failed to read clipboard",
    },
    ErrorCode.READ_FILE_INVALID: {
        "category": ErrorCategory.READER,
        "retryable": False,
        "description": "File format not supported",
    },
    ErrorCode.READ_CANCELLED: {
        "category": ErrorCategory.READER,
        "retryable": False,
        "description": "Reading was cancelled",
    },

    # Provider
    ErrorCode.PROVIDER_API_KEY_INVALID: {
        "category": ErrorCategory.PROVIDER,
        "retryable": False,
        "description": "API key is invalid",
    },
    ErrorCode.PROVIDER_API_KEY_MISSING: {
        "category": ErrorCategory.PROVIDER,
        "retryable": False,
        "description": "API key is missing",
    },
    ErrorCode.PROVIDER_RATE_LIMITED: {
        "category": ErrorCategory.PROVIDER,
        "retryable": True,
        "description": "Rate limit exceeded",
    },
    ErrorCode.PROVIDER_TIMEOUT: {
        "category": ErrorCategory.PROVIDER,
        "retryable": True,
        "description": "Request timed out",
    },
    ErrorCode.PROVIDER_UNAVAILABLE: {
        "category": ErrorCategory.PROVIDER,
        "retryable": True,
        "description": "Provider service unavailable",
    },
    ErrorCode.PROVIDER_RESPONSE_INVALID: {
        "category": ErrorCategory.PROVIDER,
        "retryable": True,
        "description": "Invalid response from provider",
    },
    ErrorCode.PROVIDER_QUOTA_EXCEEDED: {
        "category": ErrorCategory.PROVIDER,
        "retryable": False,
        "description": "API quota exceeded",
    },
    ErrorCode.PROVIDER_AUTH_FAILED: {
        "category": ErrorCategory.PROVIDER,
        "retryable": False,
        "description": "Authentication failed",
    },
    ErrorCode.PROVIDER_NOT_FOUND: {
        "category": ErrorCategory.PROVIDER,
        "retryable": False,
        "description": "Provider not found",
    },

    # System
    ErrorCode.SYS_DISK_FULL: {
        "category": ErrorCategory.SYSTEM,
        "retryable": False,
        "description": "Disk is full",
    },
    ErrorCode.SYS_MEMORY_LOW: {
        "category": ErrorCategory.SYSTEM,
        "retryable": True,
        "description": "Low memory",
    },
    ErrorCode.SYS_CUDA_UNAVAILABLE: {
        "category": ErrorCategory.SYSTEM,
        "retryable": False,
        "description": "CUDA is not available",
    },
    ErrorCode.SYS_FFMPEG_MISSING: {
        "category": ErrorCategory.SYSTEM,
        "retryable": False,
        "description": "FFmpeg is not installed",
    },
    ErrorCode.SYS_PERMISSION_DENIED: {
        "category": ErrorCategory.SYSTEM,
        "retryable": False,
        "description": "Permission denied",
    },
    ErrorCode.SYS_NETWORK_ERROR: {
        "category": ErrorCategory.SYSTEM,
        "retryable": True,
        "description": "Network error",
    },
    ErrorCode.SYS_INTERNAL_ERROR: {
        "category": ErrorCategory.SYSTEM,
        "retryable": False,
        "description": "Internal error",
    },
}


def get_error_metadata(code: ErrorCode) -> Dict:
    """Get metadata for an error code"""
    return _ERROR_METADATA.get(code, {
        "category": ErrorCategory.SYSTEM,
        "retryable": False,
        "description": "Unknown error",
    })


def get_error_category(code: ErrorCode) -> ErrorCategory:
    """Get the category for an error code"""
    return get_error_metadata(code).get("category", ErrorCategory.SYSTEM)


def is_retryable(code: ErrorCode) -> bool:
    """Check if an error is retryable"""
    return get_error_metadata(code).get("retryable", False)


def get_error_description(code: ErrorCode) -> str:
    """Get human-readable description for an error code"""
    return get_error_metadata(code).get("description", "Unknown error")


def classify_exception(exception: Exception, module: str) -> ErrorCode:
    """
    Attempt to classify an exception into an error code.
    This is a fallback for exceptions that weren't explicitly mapped.
    """
    error_str = str(exception).lower()
    exc_type = type(exception).__name__.lower()

    # CUDA OOM detection
    if "cuda" in error_str and ("out of memory" in error_str or "oom" in error_str):
        module_map = {
            "tts": ErrorCode.TTS_CUDA_OOM,
            "stt": ErrorCode.STT_CUDA_OOM,
            "diarization": ErrorCode.DIAR_CUDA_OOM,
            "music": ErrorCode.MUSIC_CUDA_OOM,
            "sfx": ErrorCode.SFX_CUDA_OOM,
            "voice_changer": ErrorCode.VC_CUDA_OOM,
            "voice_isolator": ErrorCode.VI_CUDA_OOM,
        }
        return module_map.get(module, ErrorCode.SYS_MEMORY_LOW)

    # Network/timeout errors
    if "timeout" in error_str or "timed out" in error_str:
        return ErrorCode.PROVIDER_TIMEOUT
    if "connection" in error_str or "network" in error_str:
        return ErrorCode.SYS_NETWORK_ERROR

    # Rate limiting
    if "rate limit" in error_str or "429" in error_str:
        return ErrorCode.PROVIDER_RATE_LIMITED

    # Auth errors
    if "401" in error_str or "unauthorized" in error_str or "api key" in error_str:
        return ErrorCode.PROVIDER_API_KEY_INVALID
    if "403" in error_str or "forbidden" in error_str:
        return ErrorCode.PROVIDER_AUTH_FAILED

    # File errors
    if "filenotfound" in exc_type or "no such file" in error_str:
        return ErrorCode.TRANS_FILE_NOT_FOUND
    if "permission" in error_str and "denied" in error_str:
        return ErrorCode.SYS_PERMISSION_DENIED
    if "disk" in error_str and ("full" in error_str or "space" in error_str):
        return ErrorCode.SYS_DISK_FULL

    # Default to internal error
    return ErrorCode.SYS_INTERNAL_ERROR
