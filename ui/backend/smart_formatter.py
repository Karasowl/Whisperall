"""
Smart formatting utilities for STT output.
Applies punctuation, capitalization, filler removal, backtrack, and snippets.
"""

from __future__ import annotations

import re
from typing import Dict, Iterable, List


FILLER_WORDS = {
    "um", "uh", "er", "ah", "eh", "like", "you know", "i mean", "kind of", "sort of"
}

BACKTRACK_PHRASES = [
    "scratch that",
    "delete that",
    "undo that",
    "cancel that",
    "actually",
]

COMMAND_MAP = {
    "new paragraph": "\n\n",
    "new line": "\n",
    "next line": "\n",
    "comma": ",",
    "period": ".",
    "dot": ".",
    "question mark": "?",
    "exclamation point": "!",
    "exclamation mark": "!",
    "colon": ":",
    "semicolon": ";",
}


def _normalize_whitespace(text: str) -> str:
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _remove_fillers(text: str) -> str:
    if not text:
        return text
    pattern = r"\b(" + "|".join(re.escape(w) for w in sorted(FILLER_WORDS, key=len, reverse=True)) + r")\b"
    return re.sub(pattern, "", text, flags=re.IGNORECASE)


def _apply_backtrack(text: str) -> str:
    lowered = text.lower()
    for phrase in BACKTRACK_PHRASES:
        if phrase in lowered:
            parts = re.split(re.escape(phrase), text, flags=re.IGNORECASE)
            return parts[0].strip()
    return text


def _apply_commands(text: str) -> str:
    for phrase, replacement in COMMAND_MAP.items():
        text = re.sub(rf"\b{re.escape(phrase)}\b", replacement, text, flags=re.IGNORECASE)
    return text


def _apply_dictionary(text: str, entries: Iterable[Dict]) -> str:
    for entry in entries:
        if not entry.get("enabled", True):
            continue
        source = entry.get("source")
        target = entry.get("target")
        if not source or target is None:
            continue
        text = re.sub(rf"\b{re.escape(source)}\b", str(target), text, flags=re.IGNORECASE)
    return text


def _apply_snippets(text: str, entries: Iterable[Dict]) -> str:
    for entry in entries:
        if not entry.get("enabled", True):
            continue
        trigger = entry.get("trigger")
        expansion = entry.get("expansion")
        if not trigger or expansion is None:
            continue
        text = re.sub(rf"\b{re.escape(trigger)}\b", str(expansion), text, flags=re.IGNORECASE)
    return text


def _apply_capitalization(text: str) -> str:
    if not text:
        return text
    text = text.strip()
    return text[0].upper() + text[1:]


def _apply_terminal_punctuation(text: str) -> str:
    if not text:
        return text
    if text[-1] not in ".!?":
        return text + "."
    return text


class SmartFormatter:
    def __init__(self, enable_punctuation: bool = True, enable_backtrack: bool = True, enable_fillers: bool = True):
        self.enable_punctuation = enable_punctuation
        self.enable_backtrack = enable_backtrack
        self.enable_fillers = enable_fillers

    def format_text(self, text: str, dictionary_entries: List[Dict], snippet_entries: List[Dict]) -> str:
        result = text or ""

        if self.enable_backtrack:
            result = _apply_backtrack(result)
        if self.enable_fillers:
            result = _remove_fillers(result)

        result = _apply_commands(result)
        result = _apply_dictionary(result, dictionary_entries)
        result = _apply_snippets(result, snippet_entries)

        if self.enable_punctuation:
            result = _apply_capitalization(result)
            result = _apply_terminal_punctuation(result)

        return _normalize_whitespace(result)

