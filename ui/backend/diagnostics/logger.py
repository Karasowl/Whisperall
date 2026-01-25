"""
Structured Logger with Loguru

Provides:
- Structured JSON logging to file
- Console output for development
- @log_function decorator for automatic tracing
- error_context context manager for enriching errors
- Thread-local request/job ID tracking
"""

from __future__ import annotations

import os
import sys
import time
import threading
import functools
from pathlib import Path
from datetime import datetime
from typing import Any, Callable, Dict, Optional, TypeVar, ParamSpec
from contextlib import contextmanager

from loguru import logger

# Import from sibling modules
from .error_codes import ErrorCode, classify_exception
from .error_envelope import ErrorEnvelope, create_error_envelope
from .fingerprint import generate_request_id, generate_trace_id

# Type hints for decorator
P = ParamSpec("P")
T = TypeVar("T")

# Thread-local storage for request context
_context = threading.local()

# Check if DEV_MODE is enabled
DEV_MODE = os.environ.get("DEV_MODE", "false").lower() == "true"

# Maximum events to keep in memory
MAX_MEMORY_EVENTS = 1000


class EventStore:
    """
    In-memory store for recent events.
    Thread-safe circular buffer for quick access to recent logs.
    """

    def __init__(self, max_size: int = MAX_MEMORY_EVENTS):
        self._events: list[Dict[str, Any]] = []
        self._errors: list[Dict[str, Any]] = []
        self._lock = threading.Lock()
        self._max_size = max_size

    def add_event(self, event: Dict[str, Any]) -> None:
        """Add an event to the store"""
        with self._lock:
            self._events.append(event)
            if len(self._events) > self._max_size:
                self._events.pop(0)

            # Also track errors separately
            if event.get("level") == "ERROR" or event.get("error_code"):
                self._errors.append(event)
                if len(self._errors) > self._max_size:
                    self._errors.pop(0)

    def get_events(
        self,
        limit: int = 100,
        job_id: Optional[str] = None,
        module: Optional[str] = None,
        level: Optional[str] = None,
    ) -> list[Dict[str, Any]]:
        """Get recent events with optional filtering"""
        with self._lock:
            events = self._events.copy()

        # Apply filters
        if job_id:
            events = [e for e in events if e.get("job_id") == job_id]
        if module:
            events = [e for e in events if e.get("module") == module]
        if level:
            events = [e for e in events if e.get("level") == level]

        # Return most recent first
        return list(reversed(events[-limit:]))

    def get_errors(self, limit: int = 100) -> list[Dict[str, Any]]:
        """Get recent errors"""
        with self._lock:
            return list(reversed(self._errors[-limit:]))

    def get_errors_by_fingerprint(self) -> Dict[str, Dict[str, Any]]:
        """
        Group errors by fingerprint.
        Returns dict of fingerprint -> {count, last_seen, sample_error}
        """
        with self._lock:
            grouped: Dict[str, Dict[str, Any]] = {}

            for error in self._errors:
                fp = error.get("fingerprint", "unknown")
                if fp not in grouped:
                    grouped[fp] = {
                        "fingerprint": fp,
                        "count": 0,
                        "first_seen": error.get("timestamp"),
                        "last_seen": error.get("timestamp"),
                        "error_code": error.get("error_code"),
                        "error_name": error.get("error_name"),
                        "module": error.get("module"),
                        "function": error.get("function"),
                        "message": error.get("message"),
                        "retryable": error.get("retryable"),
                    }

                grouped[fp]["count"] += 1
                grouped[fp]["last_seen"] = error.get("timestamp")

            return grouped

    def clear(self) -> None:
        """Clear all events"""
        with self._lock:
            self._events.clear()
            self._errors.clear()


# Global event store
_event_store = EventStore()


def get_event_store() -> EventStore:
    """Get the global event store"""
    return _event_store


def _get_logs_dir() -> Path:
    """Get logs directory - lazy import to avoid circular deps"""
    try:
        from app_paths import get_logs_dir
        return get_logs_dir()
    except ImportError:
        # Fallback for testing
        return Path.cwd() / "logs"


def _serialize_event(record: Dict) -> str:
    """Custom serializer for log events"""
    import json

    # Extract relevant fields
    event = {
        "timestamp": record["time"].isoformat(),
        "level": record["level"].name,
        "message": record["message"],
        "module": record.get("extra", {}).get("module", "unknown"),
        "function": record.get("extra", {}).get("function", "unknown"),
    }

    # Add all extra fields
    for key, value in record.get("extra", {}).items():
        if key not in event and value is not None:
            # Handle non-serializable types
            if isinstance(value, datetime):
                event[key] = value.isoformat()
            elif isinstance(value, (str, int, float, bool, list, dict)) or value is None:
                event[key] = value
            else:
                event[key] = str(value)

    # Store in memory
    _event_store.add_event(event)

    # Escape braces to prevent loguru from interpreting them as format placeholders
    json_str = json.dumps(event, ensure_ascii=False, default=str)
    return json_str.replace("{", "{{").replace("}", "}}") + "\n"


def _setup_logger() -> None:
    """Configure the logger with handlers"""
    # Remove default handler
    logger.remove()

    # Console handler for development (always show errors, info in dev mode)
    log_format = (
        "<green>{time:HH:mm:ss}</green> | "
        "<level>{level: <8}</level> | "
        "<cyan>{extra[module]}</cyan>.<cyan>{extra[function]}</cyan> | "
        "<level>{message}</level>"
    )

    # Always add console handler for errors
    logger.add(
        sys.stderr,
        format=log_format,
        level="INFO" if DEV_MODE else "WARNING",
        filter=lambda record: "module" in record["extra"],
        colorize=True,
    )

    # File handler for structured JSON logs
    logs_dir = _get_logs_dir()
    logs_dir.mkdir(parents=True, exist_ok=True)

    logger.add(
        logs_dir / "events.jsonl",
        format=_serialize_event,
        level="DEBUG",
        rotation="10 MB",
        retention="7 days",
        compression="gz",
        serialize=False,  # We handle serialization ourselves
    )

    # Separate error log file
    logger.add(
        logs_dir / "errors.jsonl",
        format=_serialize_event,
        level="ERROR",
        rotation="10 MB",
        retention="30 days",
        compression="gz",
        serialize=False,
    )


# Initialize logger on module load
_setup_logger()


# === Context Management ===


def get_request_id() -> Optional[str]:
    """Get the current request ID from thread-local storage"""
    return getattr(_context, "request_id", None)


def set_request_id(request_id: str) -> None:
    """Set the current request ID in thread-local storage"""
    _context.request_id = request_id


def get_job_id() -> Optional[str]:
    """Get the current job ID from thread-local storage"""
    return getattr(_context, "job_id", None)


def set_job_id(job_id: str) -> None:
    """Set the current job ID in thread-local storage"""
    _context.job_id = job_id


def get_trace_id() -> Optional[str]:
    """Get the current trace ID from thread-local storage"""
    return getattr(_context, "trace_id", None)


def set_trace_id(trace_id: str) -> None:
    """Set the current trace ID in thread-local storage"""
    _context.trace_id = trace_id


def get_context_dict() -> Dict[str, Any]:
    """Get all context values as a dictionary"""
    return {
        "request_id": get_request_id(),
        "job_id": get_job_id(),
        "trace_id": get_trace_id(),
        "provider": getattr(_context, "provider", None),
        "model": getattr(_context, "model", None),
        "device": getattr(_context, "device", None),
    }


@contextmanager
def error_context(
    provider: Optional[str] = None,
    model: Optional[str] = None,
    device: Optional[str] = None,
    job_id: Optional[str] = None,
    **extra_context,
):
    """
    Context manager to enrich error context.

    Usage:
        with error_context(provider="chatterbox", model="turbo"):
            # Any errors raised here will have provider/model context
            do_something()
    """
    # Save previous context
    prev_provider = getattr(_context, "provider", None)
    prev_model = getattr(_context, "model", None)
    prev_device = getattr(_context, "device", None)
    prev_job_id = getattr(_context, "job_id", None)
    prev_extra = getattr(_context, "extra", {})

    # Set new context
    if provider is not None:
        _context.provider = provider
    if model is not None:
        _context.model = model
    if device is not None:
        _context.device = device
    if job_id is not None:
        _context.job_id = job_id
    _context.extra = {**prev_extra, **extra_context}

    try:
        yield
    finally:
        # Restore previous context
        _context.provider = prev_provider
        _context.model = prev_model
        _context.device = prev_device
        _context.job_id = prev_job_id
        _context.extra = prev_extra


# === Decorators ===


def log_function(
    module: str,
    error_code: Optional[ErrorCode] = None,
    log_args: bool = False,
    log_result: bool = False,
):
    """
    Decorator that automatically logs function entry, exit, and errors.

    Args:
        module: Module name for logging (e.g., "tts", "stt")
        error_code: Default error code to use if exception occurs
        log_args: Whether to log function arguments
        log_result: Whether to log function result

    Usage:
        @log_function(module="tts")
        def generate_audio(text: str, voice_id: str) -> bytes:
            ...
    """

    def decorator(func: Callable[P, T]) -> Callable[P, T]:
        @functools.wraps(func)
        def wrapper(*args: P.args, **kwargs: P.kwargs) -> T:
            # Generate request ID if not present
            request_id = get_request_id() or generate_request_id()
            set_request_id(request_id)

            start_time = time.monotonic()
            func_name = func.__name__

            # Build base log context
            log_ctx = {
                "module": module,
                "function": func_name,
                "request_id": request_id,
                "job_id": get_job_id(),
                "provider": getattr(_context, "provider", None),
                "model": getattr(_context, "model", None),
                "device": getattr(_context, "device", None),
            }

            # Optionally log arguments
            if log_args:
                # Extract safe args (exclude self, large objects)
                safe_kwargs = {}
                for key, value in kwargs.items():
                    if isinstance(value, (str, int, float, bool)) or value is None:
                        safe_kwargs[key] = value
                    elif isinstance(value, str) and len(value) > 100:
                        safe_kwargs[key] = f"<str len={len(value)}>"
                log_ctx["args"] = safe_kwargs

            # Log function entry (debug level)
            logger.bind(**log_ctx).debug(f"Entering {func_name}")

            try:
                result = func(*args, **kwargs)
                duration_ms = int((time.monotonic() - start_time) * 1000)

                # Log success
                success_ctx = {
                    **log_ctx,
                    "duration_ms": duration_ms,
                    "status": "success",
                }
                if log_result and result is not None:
                    if isinstance(result, (str, int, float, bool)):
                        success_ctx["result"] = result
                    else:
                        success_ctx["result_type"] = type(result).__name__

                logger.bind(**success_ctx).info(f"{func_name} completed")

                return result

            except Exception as e:
                duration_ms = int((time.monotonic() - start_time) * 1000)

                # Create error envelope
                envelope = create_error_envelope(
                    exception=e,
                    module=module,
                    function=func_name,
                    error_code=error_code,
                    request_id=request_id,
                    job_id=get_job_id(),
                    provider=getattr(_context, "provider", None),
                    model=getattr(_context, "model", None),
                    device=getattr(_context, "device", None),
                    duration_ms=duration_ms,
                    context=getattr(_context, "extra", {}),
                )

                # Log error with full envelope
                logger.bind(**envelope.to_log_dict()).error(
                    f"{func_name} failed: {envelope.message}"
                )

                # Re-raise the original exception
                raise

        return wrapper

    return decorator


def log_async_function(
    module: str,
    error_code: Optional[ErrorCode] = None,
    log_args: bool = False,
    log_result: bool = False,
):
    """
    Async version of log_function decorator.

    Usage:
        @log_async_function(module="tts")
        async def generate_audio(text: str) -> bytes:
            ...
    """

    def decorator(func: Callable[P, T]) -> Callable[P, T]:
        @functools.wraps(func)
        async def wrapper(*args: P.args, **kwargs: P.kwargs) -> T:
            request_id = get_request_id() or generate_request_id()
            set_request_id(request_id)

            start_time = time.monotonic()
            func_name = func.__name__

            log_ctx = {
                "module": module,
                "function": func_name,
                "request_id": request_id,
                "job_id": get_job_id(),
                "provider": getattr(_context, "provider", None),
                "model": getattr(_context, "model", None),
                "device": getattr(_context, "device", None),
            }

            if log_args:
                safe_kwargs = {}
                for key, value in kwargs.items():
                    if isinstance(value, (str, int, float, bool)) or value is None:
                        safe_kwargs[key] = value
                log_ctx["args"] = safe_kwargs

            logger.bind(**log_ctx).debug(f"Entering {func_name}")

            try:
                result = await func(*args, **kwargs)
                duration_ms = int((time.monotonic() - start_time) * 1000)

                success_ctx = {
                    **log_ctx,
                    "duration_ms": duration_ms,
                    "status": "success",
                }
                logger.bind(**success_ctx).info(f"{func_name} completed")

                return result

            except Exception as e:
                duration_ms = int((time.monotonic() - start_time) * 1000)

                envelope = create_error_envelope(
                    exception=e,
                    module=module,
                    function=func_name,
                    error_code=error_code,
                    request_id=request_id,
                    job_id=get_job_id(),
                    provider=getattr(_context, "provider", None),
                    model=getattr(_context, "model", None),
                    device=getattr(_context, "device", None),
                    duration_ms=duration_ms,
                    context=getattr(_context, "extra", {}),
                )

                logger.bind(**envelope.to_log_dict()).error(
                    f"{func_name} failed: {envelope.message}"
                )

                raise

        return wrapper

    return decorator


# === Convenience logging functions ===


def log_info(module: str, function: str, message: str, **extra) -> None:
    """Log an info message with context"""
    ctx = {
        "module": module,
        "function": function,
        "request_id": get_request_id(),
        "job_id": get_job_id(),
        **extra,
    }
    logger.bind(**ctx).info(message)


def log_warning(module: str, function: str, message: str, **extra) -> None:
    """Log a warning message with context"""
    ctx = {
        "module": module,
        "function": function,
        "request_id": get_request_id(),
        "job_id": get_job_id(),
        **extra,
    }
    logger.bind(**ctx).warning(message)


def log_error(
    module: str,
    function: str,
    message: str,
    error_code: Optional[ErrorCode] = None,
    exception: Optional[Exception] = None,
    **extra,
) -> None:
    """Log an error message with context"""
    ctx = {
        "module": module,
        "function": function,
        "request_id": get_request_id(),
        "job_id": get_job_id(),
        "level": "ERROR",
        **extra,
    }

    if error_code:
        ctx["error_code"] = error_code.value
        ctx["error_name"] = error_code.name

    if exception:
        ctx["exception_type"] = type(exception).__name__
        ctx["exception_message"] = str(exception)

    logger.bind(**ctx).error(message)


def log_debug(module: str, function: str, message: str, **extra) -> None:
    """Log a debug message with context"""
    ctx = {
        "module": module,
        "function": function,
        "request_id": get_request_id(),
        "job_id": get_job_id(),
        **extra,
    }
    logger.bind(**ctx).debug(message)


# Re-export logger for direct use
__all__ = [
    "logger",
    "log_function",
    "log_async_function",
    "error_context",
    "get_request_id",
    "set_request_id",
    "get_job_id",
    "set_job_id",
    "get_trace_id",
    "set_trace_id",
    "get_context_dict",
    "get_event_store",
    "log_info",
    "log_warning",
    "log_error",
    "log_debug",
    "DEV_MODE",
]
