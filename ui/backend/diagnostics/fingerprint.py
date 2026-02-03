"""
Stable Error Fingerprinting

Generates stable fingerprints for errors to group identical errors together.
The fingerprint is based on:
- Module
- Function
- Error code
- Key identifying parameters (not variable data like timestamps)
"""

import hashlib
import re
from typing import Any, Dict, List, Optional


def _normalize_value(value: Any) -> str:
    """Normalize a value for fingerprinting"""
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        # Normalize numbers to avoid floating point differences
        return str(int(value)) if isinstance(value, int) else f"{value:.2f}"
    if isinstance(value, str):
        # Remove variable parts like timestamps, UUIDs, file paths
        normalized = value.lower().strip()
        # Remove UUIDs
        normalized = re.sub(
            r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',
            '<uuid>',
            normalized
        )
        # Remove timestamps
        normalized = re.sub(
            r'\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}',
            '<timestamp>',
            normalized
        )
        # Remove file paths (keep just the filename)
        normalized = re.sub(r'[a-zA-Z]:\\[^"\']+\\', '<path>/', normalized)
        normalized = re.sub(r'/[^"\']+/', '<path>/', normalized)
        # Remove memory addresses
        normalized = re.sub(r'0x[0-9a-f]+', '<addr>', normalized)
        # Remove line numbers from stack traces
        normalized = re.sub(r'line \d+', 'line <n>', normalized)
        return normalized
    if isinstance(value, (list, tuple)):
        return f"[{len(value)} items]"
    if isinstance(value, dict):
        return f"{{{len(value)} keys}}"
    return str(type(value).__name__)


def _extract_key_params(context: Dict[str, Any]) -> Dict[str, str]:
    """
    Extract key parameters from context that should be part of the fingerprint.
    These are stable identifiers, not variable data.
    """
    key_params = {}

    # Parameters that identify the operation
    stable_keys = [
        "provider",
        "model",
        "model_type",
        "voice_id",
        "language",
        "device",
        "engine",
        "format",
        "output_format",
    ]

    for key in stable_keys:
        if key in context and context[key] is not None:
            key_params[key] = _normalize_value(context[key])

    return key_params


def generate_fingerprint(
    module: str,
    function: str,
    error_code: int,
    error_message: Optional[str] = None,
    context: Optional[Dict[str, Any]] = None,
) -> str:
    """
    Generate a stable fingerprint for an error.

    The fingerprint is a short hash that groups similar errors together.
    It's based on the structural characteristics of the error, not variable data.

    Args:
        module: The module where the error occurred (e.g., "tts", "stt")
        function: The function where the error occurred
        error_code: The numeric error code
        error_message: Optional error message (will be normalized)
        context: Optional context dictionary with additional parameters

    Returns:
        8-character hexadecimal fingerprint
    """
    # Build the fingerprint components
    components: List[str] = [
        module.lower(),
        function.lower(),
        str(error_code),
    ]

    # Add normalized error message if present
    if error_message:
        # Extract the error type/class from the message
        normalized_msg = _normalize_value(error_message)
        # Take first 100 chars to avoid huge fingerprints
        components.append(normalized_msg[:100])

    # Add key parameters from context
    if context:
        key_params = _extract_key_params(context)
        for key in sorted(key_params.keys()):
            components.append(f"{key}={key_params[key]}")

    # Generate hash
    fingerprint_str = "|".join(components)
    hash_bytes = hashlib.sha256(fingerprint_str.encode("utf-8")).digest()

    # Return first 8 hex characters (32 bits = 4 billion unique values)
    return hash_bytes[:4].hex()


def generate_request_id() -> str:
    """Generate a unique request ID for tracing"""
    import uuid
    return str(uuid.uuid4())[:8]


def generate_trace_id() -> str:
    """Generate a unique trace ID for distributed tracing"""
    import uuid
    return str(uuid.uuid4())


def sanitize_stack_trace(stack_trace: str, max_lines: int = 20) -> str:
    """
    Sanitize a stack trace by:
    - Limiting the number of lines
    - Removing sensitive paths
    - Removing memory addresses
    """
    lines = stack_trace.split("\n")

    # Keep only the last N lines (most relevant)
    if len(lines) > max_lines:
        lines = lines[-max_lines:]
        lines.insert(0, f"... ({len(stack_trace.split(chr(10))) - max_lines} lines omitted)")

    sanitized_lines = []
    for line in lines:
        # Remove full paths, keep only filename
        line = re.sub(r'File "[^"]*[/\\]([^"]+)"', r'File "\1"', line)
        # Remove user directory paths
        line = re.sub(r'C:\\Users\\[^\\]+\\', r'C:\\Users\\<user>\\', line)
        line = re.sub(r'/home/[^/]+/', '/home/<user>/', line)
        # Remove memory addresses
        line = re.sub(r'0x[0-9a-fA-F]+', '0x<addr>', line)
        sanitized_lines.append(line)

    return "\n".join(sanitized_lines)
