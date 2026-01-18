"""
Export Utilities - Format transcripts as TXT, SRT, VTT.
"""

from __future__ import annotations


def format_timestamp_srt(seconds: float) -> str:
    """Format seconds as SRT timestamp: 00:01:23,456"""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int((seconds % 1) * 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"


def format_timestamp_vtt(seconds: float) -> str:
    """Format seconds as VTT timestamp: 00:01:23.456"""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int((seconds % 1) * 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}.{millis:03d}"


def format_timestamp_simple(seconds: float) -> str:
    """Format seconds as simple timestamp: 01:23:45"""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    if hours > 0:
        return f"{hours:02d}:{minutes:02d}:{secs:02d}"
    return f"{minutes:02d}:{secs:02d}"


def export_to_txt(
    segments: list[dict],
    include_speakers: bool = True,
    include_timestamps: bool = False
) -> str:
    """
    Export transcript as plain text.

    Args:
        segments: List of transcript segments
        include_speakers: Include speaker labels
        include_timestamps: Include timestamps

    Returns:
        Formatted plain text string
    """
    lines = []

    for seg in segments:
        parts = []

        if include_timestamps:
            ts = format_timestamp_simple(seg["start_time"])
            parts.append(f"[{ts}]")

        if include_speakers and seg.get("speaker"):
            parts.append(f"{seg['speaker']}:")

        parts.append(seg["text"])

        lines.append(" ".join(parts))

    return "\n\n".join(lines)


def export_to_srt(
    segments: list[dict],
    include_speakers: bool = True
) -> str:
    """
    Export transcript as SRT subtitle format.

    Args:
        segments: List of transcript segments
        include_speakers: Include speaker labels in text

    Returns:
        SRT formatted string
    """
    lines = []

    for i, seg in enumerate(segments, 1):
        # Sequence number
        lines.append(str(i))

        # Timestamps
        start_ts = format_timestamp_srt(seg["start_time"])
        end_ts = format_timestamp_srt(seg["end_time"])
        lines.append(f"{start_ts} --> {end_ts}")

        # Text with optional speaker
        text = seg["text"]
        if include_speakers and seg.get("speaker"):
            text = f"[{seg['speaker']}] {text}"
        lines.append(text)

        # Empty line between entries
        lines.append("")

    return "\n".join(lines)


def export_to_vtt(
    segments: list[dict],
    include_speakers: bool = True
) -> str:
    """
    Export transcript as WebVTT subtitle format.

    Args:
        segments: List of transcript segments
        include_speakers: Include speaker labels in text

    Returns:
        VTT formatted string
    """
    lines = ["WEBVTT", ""]  # VTT header

    for i, seg in enumerate(segments, 1):
        # Optional cue identifier
        lines.append(str(i))

        # Timestamps
        start_ts = format_timestamp_vtt(seg["start_time"])
        end_ts = format_timestamp_vtt(seg["end_time"])
        lines.append(f"{start_ts} --> {end_ts}")

        # Text with optional speaker (VTT supports <v> tag)
        text = seg["text"]
        if include_speakers and seg.get("speaker"):
            # VTT voice span for speaker identification
            text = f"<v {seg['speaker']}>{text}</v>"
        lines.append(text)

        # Empty line between entries
        lines.append("")

    return "\n".join(lines)


def export_transcript(
    segments: list[dict],
    format: str,
    include_speakers: bool = True,
    include_timestamps: bool = True
) -> tuple[str, str]:
    """
    Export transcript to specified format.

    Args:
        segments: List of transcript segments
        format: Export format (txt, srt, vtt)
        include_speakers: Include speaker labels
        include_timestamps: Include timestamps (for txt only)

    Returns:
        Tuple of (content, mime_type)
    """
    if format == "txt":
        content = export_to_txt(segments, include_speakers, include_timestamps)
        return content, "text/plain"

    elif format == "srt":
        content = export_to_srt(segments, include_speakers)
        return content, "application/x-subrip"

    elif format == "vtt":
        content = export_to_vtt(segments, include_speakers)
        return content, "text/vtt"

    else:
        raise ValueError(f"Unsupported export format: {format}")
