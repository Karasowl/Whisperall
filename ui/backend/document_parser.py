"""Document parser for audiobook creation"""
import re
from pathlib import Path
from typing import Optional
from dataclasses import dataclass


@dataclass
class Chapter:
    """Represents a chapter in a document"""
    number: int
    title: str
    content: str
    start_line: int = 0


def parse_txt(file_path: str) -> list[Chapter]:
    """
    Parse a TXT file into chapters.

    Detects chapters by looking for patterns like:
    - "Chapter 1", "CHAPTER ONE", "Chapter I"
    - "Part 1", "PART ONE"
    - Lines in ALL CAPS (potential titles)
    - "# Title" markdown-style headers
    """
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    return parse_text_content(content)


def parse_markdown(file_path: str) -> list[Chapter]:
    """Parse a Markdown file into chapters using headers"""
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    return parse_text_content(content)


def parse_pdf(file_path: str) -> list[Chapter]:
    """Parse a PDF file into chapters"""
    try:
        from PyPDF2 import PdfReader
    except ImportError:
        raise ImportError("PDF parsing is not available. Please reinstall the application or contact support.")

    reader = PdfReader(file_path)
    full_text = ""

    for page in reader.pages:
        text = page.extract_text()
        if text:
            full_text += text + "\n"

    return parse_text_content(full_text)


def parse_text_content(content: str) -> list[Chapter]:
    """
    Parse text content into chapters.

    Detection strategy:
    1. Look for markdown headers (# Title)
    2. Look for "Chapter X" patterns
    3. Look for "Part X" patterns
    4. Look for ALL CAPS lines as potential titles
    5. If no chapters found, treat entire text as one chapter
    """
    lines = content.split('\n')
    chapters = []
    current_chapter = None
    current_content = []

    # Patterns for chapter detection
    chapter_patterns = [
        r'^#{1,2}\s+(.+)$',  # Markdown headers
        r'^(?:Chapter|CHAPTER)\s+(\d+|[IVXLC]+)[\s:.-]*(.*)$',  # Chapter 1, Chapter I
        r'^(?:Part|PART)\s+(\d+|[IVXLC]+)[\s:.-]*(.*)$',  # Part 1, Part I
        r'^(?:Section|SECTION)\s+(\d+)[\s:.-]*(.*)$',  # Section 1
    ]

    for line_num, line in enumerate(lines):
        line_stripped = line.strip()

        # Skip empty lines for detection
        if not line_stripped:
            current_content.append(line)
            continue

        # Check for chapter patterns
        is_chapter_start = False
        chapter_title = ""

        for pattern in chapter_patterns:
            match = re.match(pattern, line_stripped, re.IGNORECASE)
            if match:
                is_chapter_start = True
                groups = match.groups()
                if len(groups) >= 2 and groups[1]:
                    chapter_title = f"Chapter {groups[0]}: {groups[1].strip()}"
                elif len(groups) >= 1:
                    chapter_title = f"Chapter {groups[0]}"
                else:
                    chapter_title = line_stripped
                break

        # Check for ALL CAPS lines (potential titles)
        if not is_chapter_start and line_stripped.isupper() and len(line_stripped) > 5 and len(line_stripped) < 100:
            # Likely a title
            is_chapter_start = True
            chapter_title = line_stripped.title()

        if is_chapter_start:
            # Save previous chapter
            if current_chapter is not None:
                current_chapter.content = '\n'.join(current_content).strip()
                if current_chapter.content:  # Only add if has content
                    chapters.append(current_chapter)

            # Start new chapter
            current_chapter = Chapter(
                number=len(chapters) + 1,
                title=chapter_title,
                content="",
                start_line=line_num
            )
            current_content = []
        else:
            current_content.append(line)

    # Don't forget the last chapter
    if current_chapter is not None:
        current_chapter.content = '\n'.join(current_content).strip()
        if current_chapter.content:
            chapters.append(current_chapter)
    elif current_content:
        # No chapters detected, treat all as one
        chapters.append(Chapter(
            number=1,
            title="Full Text",
            content='\n'.join(current_content).strip(),
            start_line=0
        ))

    # If still no chapters, create one from entire content
    if not chapters:
        chapters.append(Chapter(
            number=1,
            title="Full Text",
            content=content.strip(),
            start_line=0
        ))

    return chapters


def parse_document(file_path: str) -> list[Chapter]:
    """
    Parse any supported document format into chapters.

    Supported formats:
    - .txt - Plain text
    - .md - Markdown
    - .pdf - PDF

    Returns:
        List of Chapter objects
    """
    path = Path(file_path)
    suffix = path.suffix.lower()

    if suffix == '.txt':
        return parse_txt(file_path)
    elif suffix == '.md':
        return parse_markdown(file_path)
    elif suffix == '.pdf':
        return parse_pdf(file_path)
    else:
        raise ValueError(f"Unsupported file format: {suffix}")


def get_document_stats(chapters: list[Chapter]) -> dict:
    """Get statistics about parsed document"""
    total_chars = sum(len(c.content) for c in chapters)
    total_words = sum(len(c.content.split()) for c in chapters)

    return {
        "num_chapters": len(chapters),
        "total_characters": total_chars,
        "total_words": total_words,
        "estimated_duration_minutes": total_words / 150,  # ~150 WPM
        "chapters": [
            {
                "number": c.number,
                "title": c.title,
                "characters": len(c.content),
                "words": len(c.content.split()),
            }
            for c in chapters
        ]
    }
