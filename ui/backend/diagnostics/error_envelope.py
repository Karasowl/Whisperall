"""
Error Envelope - Structured error representation

This module defines the mandatory structure for all errors in the application.
Every error should be wrapped in an ErrorEnvelope to ensure consistent
logging, tracking, and debugging.
"""

from __future__ import annotations

import traceback
from dataclasses import dataclass, field, asdict
from datetime import datetime
from typing import Any, Dict, List, Optional, Union

from .error_codes import (
    ErrorCode,
    ErrorCategory,
    get_error_category,
    get_error_description,
    is_retryable,
    classify_exception,
)
from .fingerprint import generate_fingerprint, sanitize_stack_trace


@dataclass
class ErrorEnvelope:
    """
    Mandatory structure for all errors.

    This envelope ensures that every error has consistent fields for:
    - Identification (error_code, fingerprint)
    - Context (module, function, provider, model)
    - Execution trace (job_id, request_id, trace_id)
    - Metrics (duration_ms, retry_count)
    - Details (message, stack_trace, retryable)
    """

    # === Identification ===
    error_code: ErrorCode
    fingerprint: str

    # === Context (mandatory) ===
    module: str  # e.g., "tts", "stt", "diarization"
    function: str  # e.g., "generate", "transcribe"
    timestamp: datetime = field(default_factory=datetime.now)

    # === Execution trace ===
    job_id: Optional[str] = None
    request_id: Optional[str] = None
    trace_id: Optional[str] = None

    # === Provider/Model context ===
    provider: Optional[str] = None
    model: Optional[str] = None
    device: Optional[str] = None

    # === Metrics ===
    duration_ms: Optional[int] = None
    retry_count: int = 0

    # === Error details ===
    message: str = ""
    stack_trace: Optional[str] = None
    retryable: bool = False

    # === Additional context (no PII) ===
    context: Dict[str, Any] = field(default_factory=dict)

    # === Derived fields ===
    category: Optional[ErrorCategory] = field(default=None, init=False)
    description: Optional[str] = field(default=None, init=False)

    def __post_init__(self):
        """Compute derived fields after initialization"""
        self.category = get_error_category(self.error_code)
        self.description = get_error_description(self.error_code)
        if not self.retryable:
            self.retryable = is_retryable(self.error_code)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for logging/serialization"""
        data = {
            "error_code": self.error_code.value,
            "error_code_name": self.error_code.name,
            "fingerprint": self.fingerprint,
            "module": self.module,
            "function": self.function,
            "timestamp": self.timestamp.isoformat(),
            "category": self.category.value if self.category else None,
            "description": self.description,
            "message": self.message,
            "retryable": self.retryable,
        }

        # Add optional fields if present
        if self.job_id:
            data["job_id"] = self.job_id
        if self.request_id:
            data["request_id"] = self.request_id
        if self.trace_id:
            data["trace_id"] = self.trace_id
        if self.provider:
            data["provider"] = self.provider
        if self.model:
            data["model"] = self.model
        if self.device:
            data["device"] = self.device
        if self.duration_ms is not None:
            data["duration_ms"] = self.duration_ms
        if self.retry_count > 0:
            data["retry_count"] = self.retry_count
        if self.stack_trace:
            data["stack_trace"] = self.stack_trace
        if self.context:
            data["context"] = self.context

        return data

    def to_log_dict(self) -> Dict[str, Any]:
        """
        Convert to dictionary optimized for structured logging.
        Flattens nested structures for better log querying.
        """
        data = {
            "error_code": self.error_code.value,
            "error_name": self.error_code.name,
            "fingerprint": self.fingerprint,
            "module": self.module,
            "function": self.function,
            "category": self.category.value if self.category else "unknown",
            "retryable": self.retryable,
            "level": "ERROR",
        }

        if self.job_id:
            data["job_id"] = self.job_id
        if self.request_id:
            data["request_id"] = self.request_id
        if self.provider:
            data["provider"] = self.provider
        if self.model:
            data["model"] = self.model
        if self.device:
            data["device"] = self.device
        if self.duration_ms is not None:
            data["duration_ms"] = self.duration_ms

        # Flatten context into top-level fields with prefix
        for key, value in self.context.items():
            if isinstance(value, (str, int, float, bool)) or value is None:
                data[f"ctx_{key}"] = value

        return data

    def to_bug_report(self) -> str:
        """
        Generate a concise bug report string suitable for copying to
        GitHub issues or bug tracking systems.
        """
        lines = [
            f"**Error:** {self.error_code.name} ({self.error_code.value})",
            f"**Module:** {self.module}.{self.function}",
            f"**Fingerprint:** `{self.fingerprint}`",
        ]

        if self.provider or self.model:
            parts = []
            if self.provider:
                parts.append(f"Provider: {self.provider}")
            if self.model:
                parts.append(f"Model: {self.model}")
            lines.append(f"**Config:** {', '.join(parts)}")

        if self.duration_ms is not None:
            lines.append(f"**Duration:** {self.duration_ms}ms")

        if self.retry_count > 0:
            lines.append(f"**Retries:** {self.retry_count}")

        lines.append(f"**Message:** {self.message}")

        if self.context:
            # Format relevant context
            ctx_parts = []
            for key, value in self.context.items():
                if isinstance(value, (str, int, float, bool)):
                    ctx_parts.append(f"{key}={value}")
            if ctx_parts:
                lines.append(f"**Context:** {', '.join(ctx_parts[:5])}")  # Limit to 5

        return "\n".join(lines)

    @classmethod
    def from_exception(
        cls,
        exception: Exception,
        module: str,
        function: str,
        error_code: Optional[ErrorCode] = None,
        **kwargs,
    ) -> "ErrorEnvelope":
        """
        Create an ErrorEnvelope from an exception.

        Args:
            exception: The exception that was raised
            module: Module where the error occurred
            function: Function where the error occurred
            error_code: Optional explicit error code (will auto-classify if not provided)
            **kwargs: Additional fields (provider, model, job_id, etc.)

        Returns:
            ErrorEnvelope instance
        """
        # Auto-classify if no error code provided
        if error_code is None:
            error_code = classify_exception(exception, module)

        # Extract message
        message = str(exception)
        if not message:
            message = type(exception).__name__

        # Get stack trace
        stack_trace = sanitize_stack_trace(traceback.format_exc())

        # Extract context from kwargs
        context = kwargs.pop("context", {})

        # Add exception type to context
        context["exception_type"] = type(exception).__name__

        # Generate fingerprint
        fingerprint = generate_fingerprint(
            module=module,
            function=function,
            error_code=error_code.value,
            error_message=message,
            context={**context, **kwargs},
        )

        return cls(
            error_code=error_code,
            fingerprint=fingerprint,
            module=module,
            function=function,
            message=message,
            stack_trace=stack_trace,
            context=context,
            **kwargs,
        )


def create_error_envelope(
    exception: Exception,
    module: str,
    function: str,
    error_code: Optional[ErrorCode] = None,
    request_id: Optional[str] = None,
    job_id: Optional[str] = None,
    provider: Optional[str] = None,
    model: Optional[str] = None,
    device: Optional[str] = None,
    duration_ms: Optional[int] = None,
    retry_count: int = 0,
    context: Optional[Dict[str, Any]] = None,
) -> ErrorEnvelope:
    """
    Convenience function to create an ErrorEnvelope from an exception.

    This is the primary way to create error envelopes in the codebase.
    """
    return ErrorEnvelope.from_exception(
        exception=exception,
        module=module,
        function=function,
        error_code=error_code,
        request_id=request_id,
        job_id=job_id,
        provider=provider,
        model=model,
        device=device,
        duration_ms=duration_ms,
        retry_count=retry_count,
        context=context or {},
    )


class DiagnosticException(Exception):
    """
    Base exception class that carries an ErrorEnvelope.

    Use this for exceptions that need to propagate structured error information.
    """

    def __init__(self, envelope: ErrorEnvelope, original: Optional[Exception] = None):
        self.envelope = envelope
        self.original = original
        super().__init__(envelope.message)

    @property
    def error_code(self) -> ErrorCode:
        return self.envelope.error_code

    @property
    def fingerprint(self) -> str:
        return self.envelope.fingerprint

    @property
    def retryable(self) -> bool:
        return self.envelope.retryable

    def to_dict(self) -> Dict[str, Any]:
        return self.envelope.to_dict()

    def to_bug_report(self) -> str:
        return self.envelope.to_bug_report()
