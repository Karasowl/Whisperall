import io
import hashlib
import logging
import mimetypes
from datetime import datetime, timezone
from pathlib import Path
from time import perf_counter
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile

from ..auth import AuthUser, check_usage, get_current_user
from ..config import settings
from ..db import get_supabase_or_none
from ..providers import google_ocr
from ..schemas import (
    ReaderAnnotationCreateRequest,
    ReaderAnnotationResponse,
    ReaderAnnotationUpdateRequest,
    ReaderBookmarkCreateRequest,
    ReaderBookmarkResponse,
    ReaderImportResponse,
    ReaderImportUrlRequest,
    ReaderProgressResponse,
    ReaderProgressUpsertRequest,
)
from ..usage_events import record_usage_event

log = logging.getLogger(__name__)
router = APIRouter(prefix="/v1/reader", tags=["reader"])

MAX_IMPORT_BYTES = 200 * 1024 * 1024
MAX_OCR_PAGES = 300
OCR_TIMEOUT_SEC = 180
READABILITY_MIN_TEXT_LEN = 120

TEXT_EXTS = {".txt", ".md", ".markdown", ".html", ".htm"}
DOC_EXTS = {".pdf", ".docx", ".epub", ".rtf", ".odt"}
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff"}
SUPPORTED_EXTS = TEXT_EXTS | DOC_EXTS | IMAGE_EXTS

IMAGE_MIME_PREFIX = "image/"
PDF_MIME = "application/pdf"
DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
EPUB_MIME = "application/epub+zip"
RTF_MIME = "application/rtf"
ODT_MIME = "application/vnd.oasis.opendocument.text"
HTML_MIME = "text/html"


def _raise_reader_http_error(
    *,
    status_code: int,
    detail: str,
    code: str,
    headers: dict[str, str] | None = None,
) -> None:
    merged_headers = {"X-Whisperall-Error-Code": code}
    if headers:
        merged_headers.update(headers)
    raise HTTPException(status_code=status_code, detail=detail, headers=merged_headers)


def _require_db():
    db = get_supabase_or_none()
    if not db:
        _raise_reader_http_error(
            status_code=503,
            detail="Database not configured",
            code="READER_DB_UNAVAILABLE",
        )
    return db


def _rollout_bucket(user_id: str) -> int:
    digest = hashlib.sha256(user_id.encode("utf-8")).hexdigest()
    return int(digest[:8], 16) % 100


def _is_reader_v2_enabled_for_user(user_id: str) -> bool:
    if not settings.reader_v2_enabled:
        return False
    pct = int(settings.reader_v2_rollout_percent)
    if pct >= 100:
        return True
    if pct <= 0:
        return False
    return _rollout_bucket(user_id) < pct


def _require_reader_v2_enabled(user: AuthUser) -> None:
    if _is_reader_v2_enabled_for_user(user.user_id):
        return
    _raise_reader_http_error(
        status_code=404,
        detail="Reader v2 is disabled",
        code="READER_V2_DISABLED",
    )


def _record_reader_metric(
    db,
    *,
    user_id: str,
    resource: str,
    units: int,
    metadata: dict | None = None,
) -> None:
    if not db:
        return
    record_usage_event(
        db,
        user_id=user_id,
        module="reader",
        provider="internal",
        model=None,
        resource=resource,
        units=units,
        metadata=metadata,
    )


def _http_error_code(exc: HTTPException) -> str:
    headers = exc.headers or {}
    return headers.get("X-Whisperall-Error-Code") or "HTTP_ERROR"


def _normalize_content_type(value: str | None) -> str:
    return (value or "").split(";")[0].strip().lower()


def _safe_decode(data: bytes) -> str:
    for enc in ("utf-8", "utf-16", "latin-1"):
        try:
            return data.decode(enc)
        except Exception:
            continue
    return data.decode("utf-8", errors="ignore")


def _title_from_name(name: str) -> str:
    stem = Path(name or "Reader Import").stem.strip() or "Reader Import"
    return stem[:120]


def _extract_html_text(html: str) -> str:
    text: str = ""
    try:
        import trafilatura

        extracted = trafilatura.extract(html, include_comments=False, include_tables=True)
        text = (extracted or "").strip()
    except Exception:
        text = ""
    if text:
        return text

    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript"]):
        tag.extract()
    return "\n".join(line.strip() for line in soup.get_text("\n").splitlines() if line.strip())


def _extract_txt_like(file_bytes: bytes, ext: str) -> str:
    text = _safe_decode(file_bytes)
    if ext in {".html", ".htm"}:
        return _extract_html_text(text)
    return text


def _extract_docx_text(file_bytes: bytes) -> str:
    from docx import Document  # type: ignore

    doc = Document(io.BytesIO(file_bytes))
    parts = [p.text.strip() for p in doc.paragraphs if p.text.strip()]
    return "\n\n".join(parts).strip()


def _extract_rtf_text(file_bytes: bytes) -> str:
    from striprtf.striprtf import rtf_to_text  # type: ignore

    return rtf_to_text(_safe_decode(file_bytes)).strip()


def _extract_epub_text(file_bytes: bytes) -> str:
    from ebooklib import ITEM_DOCUMENT, epub  # type: ignore

    book = epub.read_epub(io.BytesIO(file_bytes))
    chunks: list[str] = []
    for item in book.get_items():
        if item.get_type() != ITEM_DOCUMENT:
            continue
        html = item.get_content()
        if not html:
            continue
        text = _extract_html_text(html.decode("utf-8", errors="ignore"))
        if text:
            chunks.append(text)
    return "\n\n".join(chunks).strip()


def _extract_odt_text(file_bytes: bytes) -> str:
    from odf import text as odf_text  # type: ignore
    from odf.opendocument import load  # type: ignore

    doc = load(io.BytesIO(file_bytes))
    lines: list[str] = []
    for p in doc.getElementsByType(odf_text.P):
        txt = "".join(node.data for node in p.childNodes if getattr(node, "data", None))
        txt = txt.strip()
        if txt:
            lines.append(txt)
    return "\n\n".join(lines).strip()


def _extract_pdf_native(file_bytes: bytes) -> tuple[str, list[str]]:
    from pypdf import PdfReader  # type: ignore

    reader = PdfReader(io.BytesIO(file_bytes))
    pages: list[str] = []
    for page in reader.pages:
        content = (page.extract_text() or "").strip()
        pages.append(content)
    return "\n\n".join([p for p in pages if p]).strip(), pages


def _pdf_needs_ocr(pages: list[str], force_ocr: bool) -> bool:
    if force_ocr:
        return True
    if not pages:
        return True
    non_empty = [p for p in pages if p and p.strip()]
    if not non_empty:
        return True
    avg_chars = sum(len(p.strip()) for p in non_empty) / max(1, len(pages))
    return avg_chars < 40


def _render_pdf_pages_to_images(file_bytes: bytes, max_pages: int = MAX_OCR_PAGES) -> list[bytes]:
    try:
        import fitz  # type: ignore
    except Exception as exc:
        raise RuntimeError("PDF OCR requires PyMuPDF (fitz) installed") from exc

    doc = fitz.open(stream=file_bytes, filetype="pdf")
    if doc.page_count > max_pages:
        raise ValueError(f"OCR page limit exceeded ({doc.page_count} > {max_pages})")

    images: list[bytes] = []
    matrix = fitz.Matrix(2.0, 2.0)
    for page in doc:
        pix = page.get_pixmap(matrix=matrix, alpha=False)
        images.append(pix.tobytes("png"))
    return images


async def _extract_pdf_text(
    file_bytes: bytes,
    force_ocr: bool,
    language_hint: str | None,
) -> tuple[str, list[dict], int, str | None, int]:
    native_text, pages = _extract_pdf_native(file_bytes)
    if not _pdf_needs_ocr(pages, force_ocr):
        return native_text, [], len(pages), None, 0

    warning: str | None = None
    try:
        images = _render_pdf_pages_to_images(file_bytes, MAX_OCR_PAGES)
        if len(images) > MAX_OCR_PAGES:
            _raise_reader_http_error(
                status_code=413,
                detail=f"OCR page limit exceeded ({len(images)} > {MAX_OCR_PAGES})",
                code="READER_OCR_LIMIT_EXCEEDED",
            )

        blocks: list[dict] = []
        page_texts: list[str] = []
        chunk_size = 8
        for idx in range(0, len(images), chunk_size):
            batch = images[idx : idx + chunk_size]
            batch_results = await google_ocr.extract_images_text(
                batch,
                language_hint=language_hint,
                timeout_sec=OCR_TIMEOUT_SEC,
            )
            for inner_idx, result in enumerate(batch_results):
                page_num = idx + inner_idx + 1
                txt = (result.get("text") or "").strip()
                if txt:
                    page_texts.append(txt)
                for block in result.get("blocks") or []:
                    blocks.append({"page": page_num, "text": block.get("text") or ""})

        ocr_text = "\n\n".join(page_texts).strip()
        if ocr_text:
            return ocr_text, blocks, len(images), None, len(images)
    except HTTPException:
        raise
    except Exception as exc:
        log.warning("Reader OCR fallback for PDF failed: %s", exc)
        warning = f"OCR failed ({exc}). Returned native PDF text."

    if native_text:
        return native_text, [], len(pages), warning, 0
    _raise_reader_http_error(
        status_code=503,
        detail="OCR provider unavailable for this PDF",
        code="READER_OCR_PROVIDER_UNAVAILABLE",
    )


async def _extract_any(
    *,
    file_bytes: bytes,
    filename: str,
    content_type: str,
    force_ocr: bool,
    language_hint: str | None,
) -> tuple[str, list[dict], int, str | None, int]:
    ext = Path(filename).suffix.lower()
    ctype = _normalize_content_type(content_type)
    if not ext and ctype:
        guessed_ext = mimetypes.guess_extension(ctype) or ""
        ext = guessed_ext.lower()

    is_image = ctype.startswith(IMAGE_MIME_PREFIX) or ext in IMAGE_EXTS
    is_pdf = ctype == PDF_MIME or ext == ".pdf"
    is_docx = ctype == DOCX_MIME or ext == ".docx"
    is_epub = ctype == EPUB_MIME or ext == ".epub"
    is_rtf = ctype == RTF_MIME or ext == ".rtf"
    is_odt = ctype == ODT_MIME or ext == ".odt"
    is_html = ctype == HTML_MIME or ext in {".html", ".htm"}
    is_txt = ext in {".txt", ".md", ".markdown"} or ctype.startswith("text/")

    if is_pdf:
        return await _extract_pdf_text(file_bytes, force_ocr=force_ocr, language_hint=language_hint)
    if is_docx:
        text = _extract_docx_text(file_bytes)
        return text, [], 1, None, 0
    if is_epub:
        text = _extract_epub_text(file_bytes)
        return text, [], 1, None, 0
    if is_rtf:
        text = _extract_rtf_text(file_bytes)
        return text, [], 1, None, 0
    if is_odt:
        text = _extract_odt_text(file_bytes)
        return text, [], 1, None, 0
    if is_html or is_txt:
        text = _extract_txt_like(file_bytes, ".html" if is_html else ext)
        return text, [], 1, None, 0
    if is_image:
        try:
            ocr = await google_ocr.extract_text(
                file_bytes,
                mime_type=ctype or None,
                language_hint=language_hint,
                timeout_sec=OCR_TIMEOUT_SEC,
            )
            pages = int(ocr.get("pages") or 1)
            return (ocr.get("text") or "").strip(), ocr.get("blocks") or [], pages, None, pages
        except httpx.HTTPStatusError as exc:
            log.warning("Reader OCR HTTP error: %s", exc)
            _raise_reader_http_error(
                status_code=503,
                detail="OCR provider unavailable",
                code="READER_OCR_PROVIDER_UNAVAILABLE",
            )
        except Exception as exc:
            log.warning("Reader OCR error: %s", exc)
            _raise_reader_http_error(
                status_code=503,
                detail=f"OCR provider unavailable: {exc}",
                code="READER_OCR_PROVIDER_UNAVAILABLE",
            )

    _raise_reader_http_error(
        status_code=400,
        detail=f"Unsupported reader import format: {ext or ctype or 'unknown'}",
        code="READER_IMPORT_UNSUPPORTED_FORMAT",
    )


def _assert_document_owner(db, document_id: str, user: AuthUser) -> dict:
    res = (
        db.table("documents")
        .select("id,user_id,source,title,content,updated_at")
        .eq("id", document_id)
        .eq("user_id", user.user_id)
        .maybe_single()
        .execute()
    )
    row = res.data
    if not row:
        _raise_reader_http_error(
            status_code=404,
            detail="Reader document not found",
            code="READER_DOCUMENT_NOT_FOUND",
        )
    return row


def _save_reader_document(
    db,
    *,
    user: AuthUser,
    text: str,
    title: str,
) -> str:
    check_usage(user, "notes_count", 1)
    created = (
        db.table("documents")
        .insert(
            {
                "user_id": user.user_id,
                "title": title or "Reader Import",
                "content": text,
                "source": "reader",
                "tags": ["reader"],
            }
        )
        .execute()
    )
    row = (created.data or [{}])[0]
    try:
        db.rpc("increment_usage", {"p_user_id": user.user_id, "p_notes_count": 1}).execute()
    except Exception as exc:
        log.warning("Reader notes usage increment failed: %s", exc)
    return row.get("id")


async def _download_url(url: str) -> tuple[bytes, str, str]:
    try:
        async with httpx.AsyncClient(timeout=120, follow_redirects=True) as client:
            resp = await client.get(
                url,
                headers={
                    "User-Agent": (
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                        "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
                    )
                },
            )
    except Exception as exc:
        _raise_reader_http_error(
            status_code=400,
            detail=f"Could not download URL: {exc}",
            code="READER_IMPORT_DOWNLOAD_FAILED",
        )

    if resp.status_code != 200:
        _raise_reader_http_error(
            status_code=400,
            detail=f"Could not download URL (HTTP {resp.status_code})",
            code="READER_IMPORT_DOWNLOAD_FAILED",
        )

    content = resp.content
    if len(content) > MAX_IMPORT_BYTES:
        _raise_reader_http_error(
            status_code=413,
            detail=f"Import exceeds size limit ({MAX_IMPORT_BYTES} bytes)",
            code="READER_OCR_LIMIT_EXCEEDED",
        )
    return content, _normalize_content_type(resp.headers.get("content-type")), str(resp.url)


@router.post("/import-file", response_model=ReaderImportResponse)
async def import_file(
    file: UploadFile = File(...),
    force_ocr: bool = Form(False),
    language_hint: str | None = Form(None),
    save: bool = Form(True),
    user: AuthUser = Depends(get_current_user),
):
    _require_reader_v2_enabled(user)
    started = perf_counter()
    db = _require_db()
    filename = file.filename or "upload.bin"
    content_type = _normalize_content_type(file.content_type) or (mimetypes.guess_type(filename)[0] or "")
    pages = 0
    ocr_pages = 0
    try:
        payload = await file.read()
        if len(payload) > MAX_IMPORT_BYTES:
            _raise_reader_http_error(
                status_code=413,
                detail=f"Import exceeds size limit ({MAX_IMPORT_BYTES} bytes)",
                code="READER_OCR_LIMIT_EXCEEDED",
            )

        text, blocks, pages, warning, ocr_pages = await _extract_any(
            file_bytes=payload,
            filename=filename,
            content_type=content_type,
            force_ocr=force_ocr,
            language_hint=language_hint,
        )
        title = _title_from_name(filename)
        document_id = _save_reader_document(db, user=user, text=text, title=title) if save else None
        elapsed_ms = int((perf_counter() - started) * 1000)
        _record_reader_metric(
            db,
            user_id=user.user_id,
            resource="reader_import_count",
            units=1,
            metadata={
                "source": "file",
                "status": "success",
                "mime": content_type or "unknown",
                "force_ocr": bool(force_ocr),
                "pages": pages,
            },
        )
        if ocr_pages > 0:
            _record_reader_metric(
                db,
                user_id=user.user_id,
                resource="reader_ocr_pages",
                units=ocr_pages,
                metadata={
                    "source": "file",
                    "mime": content_type or "unknown",
                    "force_ocr": bool(force_ocr),
                },
            )
        log.info(
            "reader_import_file mime=%s pages=%s ocr_pages=%s force_ocr=%s save=%s warning=%s elapsed_ms=%s",
            content_type or "unknown",
            pages,
            ocr_pages,
            force_ocr,
            save,
            bool(warning),
            elapsed_ms,
        )
        return ReaderImportResponse(
            text=text,
            blocks=blocks,
            pages=pages,
            title=title,
            source="file",
            document_id=document_id,
            warning=warning,
        )
    except HTTPException as exc:
        _record_reader_metric(
            db,
            user_id=user.user_id,
            resource="reader_import_count",
            units=1,
            metadata={
                "source": "file",
                "status": "failed",
                "code": _http_error_code(exc),
                "mime": content_type or "unknown",
                "pages": pages,
            },
        )
        _record_reader_metric(
            db,
            user_id=user.user_id,
            resource="reader_import_fail_rate",
            units=1,
            metadata={
                "source": "file",
                "code": _http_error_code(exc),
            },
        )
        raise
    except Exception:
        _record_reader_metric(
            db,
            user_id=user.user_id,
            resource="reader_import_count",
            units=1,
            metadata={
                "source": "file",
                "status": "failed",
                "code": "INTERNAL_ERROR",
                "mime": content_type or "unknown",
            },
        )
        _record_reader_metric(
            db,
            user_id=user.user_id,
            resource="reader_import_fail_rate",
            units=1,
            metadata={"source": "file", "code": "INTERNAL_ERROR"},
        )
        raise


@router.post("/import-url", response_model=ReaderImportResponse)
async def import_url(payload: ReaderImportUrlRequest, user: AuthUser = Depends(get_current_user)):
    _require_reader_v2_enabled(user)
    started = perf_counter()
    db = _require_db()
    content_type = "unknown"
    pages = 1
    ocr_pages = 0
    try:
        content, content_type, final_url = await _download_url(payload.url)
        path = urlparse(final_url).path
        filename = Path(path).name or "url-import.html"

        text = ""
        blocks: list[dict] = []
        warning: str | None = None

        is_html = content_type == HTML_MIME or filename.lower().endswith((".html", ".htm"))
        if is_html and not payload.force_ocr:
            text = _extract_html_text(_safe_decode(content)).strip()
            if len(text) < READABILITY_MIN_TEXT_LEN:
                warning = "Low text extraction quality from URL page; try force_ocr on a direct image/PDF file URL."

        if not text:
            text, blocks, pages, warning2, ocr_pages = await _extract_any(
                file_bytes=content,
                filename=filename,
                content_type=content_type,
                force_ocr=payload.force_ocr,
                language_hint=payload.language_hint,
            )
            warning = warning or warning2

        title = _title_from_name(filename or payload.url)
        document_id = _save_reader_document(db, user=user, text=text, title=title) if payload.save else None
        elapsed_ms = int((perf_counter() - started) * 1000)
        _record_reader_metric(
            db,
            user_id=user.user_id,
            resource="reader_import_count",
            units=1,
            metadata={
                "source": "url",
                "status": "success",
                "content_type": content_type or "unknown",
                "force_ocr": bool(payload.force_ocr),
                "pages": pages,
            },
        )
        if ocr_pages > 0:
            _record_reader_metric(
                db,
                user_id=user.user_id,
                resource="reader_ocr_pages",
                units=ocr_pages,
                metadata={
                    "source": "url",
                    "content_type": content_type or "unknown",
                    "force_ocr": bool(payload.force_ocr),
                },
            )
        log.info(
            "reader_import_url content_type=%s pages=%s ocr_pages=%s force_ocr=%s save=%s warning=%s elapsed_ms=%s",
            content_type or "unknown",
            pages,
            ocr_pages,
            payload.force_ocr,
            payload.save,
            bool(warning),
            elapsed_ms,
        )
        return ReaderImportResponse(
            text=text,
            blocks=blocks,
            pages=pages,
            title=title,
            source="url",
            document_id=document_id,
            warning=warning,
        )
    except HTTPException as exc:
        _record_reader_metric(
            db,
            user_id=user.user_id,
            resource="reader_import_count",
            units=1,
            metadata={
                "source": "url",
                "status": "failed",
                "code": _http_error_code(exc),
                "content_type": content_type or "unknown",
            },
        )
        _record_reader_metric(
            db,
            user_id=user.user_id,
            resource="reader_import_fail_rate",
            units=1,
            metadata={
                "source": "url",
                "code": _http_error_code(exc),
            },
        )
        raise
    except Exception:
        _record_reader_metric(
            db,
            user_id=user.user_id,
            resource="reader_import_count",
            units=1,
            metadata={
                "source": "url",
                "status": "failed",
                "code": "INTERNAL_ERROR",
                "content_type": content_type or "unknown",
            },
        )
        _record_reader_metric(
            db,
            user_id=user.user_id,
            resource="reader_import_fail_rate",
            units=1,
            metadata={"source": "url", "code": "INTERNAL_ERROR"},
        )
        raise


@router.get("/documents")
async def list_reader_documents(
    limit: int = Query(default=30, ge=1, le=100),
    cursor: str | None = Query(default=None),
    q: str | None = Query(default=None),
    user: AuthUser = Depends(get_current_user),
):
    _require_reader_v2_enabled(user)
    db = _require_db()
    query = (
        db.table("documents")
        .select("*")
        .eq("user_id", user.user_id)
        .eq("source", "reader")
        .order("updated_at", desc=True)
        .limit(limit)
    )
    if cursor:
        query = query.lt("updated_at", cursor)
    rows = (query.execute().data or [])
    if q:
        ql = q.lower().strip()
        rows = [r for r in rows if ql in (r.get("title") or "").lower() or ql in (r.get("content") or "").lower()]
    return rows


@router.put("/progress/{document_id}", response_model=ReaderProgressResponse)
async def upsert_reader_progress(
    document_id: str,
    payload: ReaderProgressUpsertRequest,
    user: AuthUser = Depends(get_current_user),
):
    _require_reader_v2_enabled(user)
    db = _require_db()
    _assert_document_owner(db, document_id, user)

    now_iso = datetime.now(timezone.utc).isoformat()
    updated_at = payload.updated_at_client.isoformat() if payload.updated_at_client else now_iso
    row = {
        "user_id": user.user_id,
        "document_id": document_id,
        "char_offset": payload.char_offset,
        "playback_seconds": payload.playback_seconds,
        "section_index": payload.section_index,
        "updated_at": updated_at,
    }
    db.table("reader_progress").upsert(row, on_conflict="user_id,document_id").execute()
    current = (
        db.table("reader_progress")
        .select("*")
        .eq("user_id", user.user_id)
        .eq("document_id", document_id)
        .maybe_single()
        .execute()
    )
    out = current.data or row
    return ReaderProgressResponse(
        document_id=document_id,
        char_offset=int(out.get("char_offset") or 0),
        playback_seconds=float(out.get("playback_seconds") or 0),
        section_index=int(out.get("section_index") or 0),
        updated_at=datetime.fromisoformat(str(out.get("updated_at")).replace("Z", "+00:00")),
    )


@router.get("/progress/{document_id}", response_model=ReaderProgressResponse)
async def get_reader_progress(document_id: str, user: AuthUser = Depends(get_current_user)):
    _require_reader_v2_enabled(user)
    db = _require_db()
    _assert_document_owner(db, document_id, user)
    current = (
        db.table("reader_progress")
        .select("*")
        .eq("user_id", user.user_id)
        .eq("document_id", document_id)
        .maybe_single()
        .execute()
    )
    if not current.data:
        return ReaderProgressResponse(
            document_id=document_id,
            char_offset=0,
            playback_seconds=0,
            section_index=0,
            updated_at=datetime.now(timezone.utc),
        )
    out = current.data
    return ReaderProgressResponse(
        document_id=document_id,
        char_offset=int(out.get("char_offset") or 0),
        playback_seconds=float(out.get("playback_seconds") or 0),
        section_index=int(out.get("section_index") or 0),
        updated_at=datetime.fromisoformat(str(out.get("updated_at")).replace("Z", "+00:00")),
    )


@router.get("/bookmarks/{document_id}", response_model=list[ReaderBookmarkResponse])
async def list_bookmarks(document_id: str, user: AuthUser = Depends(get_current_user)):
    _require_reader_v2_enabled(user)
    db = _require_db()
    _assert_document_owner(db, document_id, user)
    rows = (
        db.table("reader_bookmarks")
        .select("*")
        .eq("user_id", user.user_id)
        .eq("document_id", document_id)
        .order("created_at")
        .execute()
    )
    return rows.data or []


@router.post("/bookmarks", response_model=ReaderBookmarkResponse)
async def create_bookmark(payload: ReaderBookmarkCreateRequest, user: AuthUser = Depends(get_current_user)):
    _require_reader_v2_enabled(user)
    db = _require_db()
    _assert_document_owner(db, payload.document_id, user)
    created = (
        db.table("reader_bookmarks")
        .insert(
            {
                "user_id": user.user_id,
                "document_id": payload.document_id,
                "char_offset": payload.char_offset,
                "label": (payload.label or "").strip() or f"Bookmark {payload.char_offset}",
            }
        )
        .execute()
    )
    row = (created.data or [None])[0]
    if not row:
        raise HTTPException(status_code=500, detail="Failed to create bookmark")
    return row


@router.delete("/bookmarks/{bookmark_id}")
async def delete_bookmark(bookmark_id: str, user: AuthUser = Depends(get_current_user)):
    _require_reader_v2_enabled(user)
    db = _require_db()
    db.table("reader_bookmarks").delete().eq("id", bookmark_id).eq("user_id", user.user_id).execute()
    return {"status": "deleted"}


@router.get("/annotations/{document_id}", response_model=list[ReaderAnnotationResponse])
async def list_annotations(document_id: str, user: AuthUser = Depends(get_current_user)):
    _require_reader_v2_enabled(user)
    db = _require_db()
    _assert_document_owner(db, document_id, user)
    rows = (
        db.table("reader_annotations")
        .select("*")
        .eq("user_id", user.user_id)
        .eq("document_id", document_id)
        .order("created_at")
        .execute()
    )
    return rows.data or []


@router.post("/annotations", response_model=ReaderAnnotationResponse)
async def create_annotation(payload: ReaderAnnotationCreateRequest, user: AuthUser = Depends(get_current_user)):
    _require_reader_v2_enabled(user)
    db = _require_db()
    _assert_document_owner(db, payload.document_id, user)
    if payload.end_offset < payload.start_offset:
        _raise_reader_http_error(
            status_code=400,
            detail="end_offset must be >= start_offset",
            code="READER_ANNOTATION_INVALID_RANGE",
        )
    created = (
        db.table("reader_annotations")
        .insert(
            {
                "user_id": user.user_id,
                "document_id": payload.document_id,
                "start_offset": payload.start_offset,
                "end_offset": payload.end_offset,
                "note": payload.note,
                "color": payload.color,
            }
        )
        .execute()
    )
    row = (created.data or [None])[0]
    if not row:
        raise HTTPException(status_code=500, detail="Failed to create annotation")
    return row


@router.patch("/annotations/{annotation_id}", response_model=ReaderAnnotationResponse)
async def update_annotation(
    annotation_id: str,
    payload: ReaderAnnotationUpdateRequest,
    user: AuthUser = Depends(get_current_user),
):
    _require_reader_v2_enabled(user)
    db = _require_db()
    data = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not data:
        _raise_reader_http_error(
            status_code=400,
            detail="No fields to update",
            code="READER_ANNOTATION_NO_FIELDS",
        )
    updated = (
        db.table("reader_annotations")
        .update(data)
        .eq("id", annotation_id)
        .eq("user_id", user.user_id)
        .execute()
    )
    row = (updated.data or [None])[0]
    if not row:
        _raise_reader_http_error(
            status_code=404,
            detail="Annotation not found",
            code="READER_DOCUMENT_NOT_FOUND",
        )
    return row


@router.delete("/annotations/{annotation_id}")
async def delete_annotation(annotation_id: str, user: AuthUser = Depends(get_current_user)):
    _require_reader_v2_enabled(user)
    db = _require_db()
    db.table("reader_annotations").delete().eq("id", annotation_id).eq("user_id", user.user_id).execute()
    return {"status": "deleted"}
