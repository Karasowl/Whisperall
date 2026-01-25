"""
Whisperall Diagnostics Package

Provides structured logging, error tracking, and diagnostic bundle generation
for debugging and monitoring the application.
"""

from .error_codes import ErrorCode, ErrorCategory
from .error_envelope import ErrorEnvelope, create_error_envelope
from .logger import (
    logger,
    log_function,
    error_context,
    get_request_id,
    set_request_id,
    get_job_id,
    set_job_id,
    get_event_store,
    log_info,
    log_error,
    log_warning,
    log_debug,
)
from .fingerprint import generate_fingerprint
from .bundle import create_diagnostic_bundle, get_recent_events, get_errors_by_fingerprint

__all__ = [
    # Error codes
    "ErrorCode",
    "ErrorCategory",
    # Error envelope
    "ErrorEnvelope",
    "create_error_envelope",
    # Logger
    "logger",
    "log_function",
    "error_context",
    "get_request_id",
    "set_request_id",
    "get_job_id",
    "set_job_id",
    "get_event_store",
    "log_info",
    "log_error",
    "log_warning",
    "log_debug",
    # Fingerprint
    "generate_fingerprint",
    # Bundle
    "create_diagnostic_bundle",
    "get_recent_events",
    "get_errors_by_fingerprint",
]
