import logging
from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import settings
from .db import get_supabase_or_none
from .routers import health, dictate, live, transcribe, tts, translate, ai_edit, documents, folders, history, usage, api_keys, admin, reader

log = logging.getLogger(__name__)

_HTTP_ERROR_CODES = {
    status.HTTP_400_BAD_REQUEST: "BAD_REQUEST",
    status.HTTP_401_UNAUTHORIZED: "UNAUTHORIZED",
    status.HTTP_403_FORBIDDEN: "FORBIDDEN",
    status.HTTP_404_NOT_FOUND: "NOT_FOUND",
    status.HTTP_409_CONFLICT: "CONFLICT",
    status.HTTP_413_REQUEST_ENTITY_TOO_LARGE: "PAYLOAD_TOO_LARGE",
    status.HTTP_422_UNPROCESSABLE_ENTITY: "VALIDATION_ERROR",
    status.HTTP_429_TOO_MANY_REQUESTS: "RATE_LIMITED",
}


def _request_id_from_request(request: Request) -> str:
    incoming = request.headers.get("x-request-id")
    if incoming:
        normalized = incoming.strip()
        if normalized:
            return normalized[:128]
    return str(uuid4())


def _error_response_payload(detail: object, code: str, request_id: str) -> dict:
    message = detail if isinstance(detail, str) else "Request failed"
    return {
        "detail": detail,
        "error": {
            "code": code,
            "message": message,
            "request_id": request_id,
        },
    }


def _ensure_storage_buckets():
    """Create required storage buckets if they don't exist."""
    db = get_supabase_or_none()
    if not db:
        return
    try:
        buckets = {b.name for b in db.storage.list_buckets()}
        if "audio" not in buckets:
            db.storage.create_bucket("audio", options={"public": True})
            log.info("Created 'audio' storage bucket")
    except Exception as e:
        log.warning("Could not ensure storage buckets: %s", e)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.validate_runtime_flags()
    settings.load_remote_keys()
    _ensure_storage_buckets()
    yield


app = FastAPI(title='Whisperall API', version='2.0.0', lifespan=lifespan)

cors_origins = settings.get_cors_origins()
if settings.cors_origin_regex:
    log.info("CORS configured with origins=%s and regex=%s", cors_origins, settings.cors_origin_regex)
else:
    log.info("CORS configured with origins=%s", cors_origins)

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    request_id = _request_id_from_request(request)
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content=_error_response_payload(exc.errors(), "VALIDATION_ERROR", request_id),
        headers={"X-Request-Id": request_id},
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    headers = dict(exc.headers or {})
    request_id = headers.get("X-Request-Id") or _request_id_from_request(request)
    headers["X-Request-Id"] = request_id
    code = headers.get("X-Whisperall-Error-Code") or _HTTP_ERROR_CODES.get(exc.status_code, "HTTP_ERROR")
    return JSONResponse(
        status_code=exc.status_code,
        content=_error_response_payload(exc.detail, code, request_id),
        headers=headers,
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    log.error("Unhandled error on %s %s: %s", request.method, request.url.path, exc)
    request_id = _request_id_from_request(request)
    detail = str(exc) if settings.env != "prod" else "Internal server error"
    return JSONResponse(
        status_code=500,
        content=_error_response_payload(detail, "INTERNAL_ERROR", request_id),
        headers={"X-Request-Id": request_id},
    )

app.include_router(health.router)
app.include_router(dictate.router)
app.include_router(live.router)
app.include_router(transcribe.router)
app.include_router(tts.router)
app.include_router(translate.router)
app.include_router(ai_edit.router)
app.include_router(documents.router)
app.include_router(folders.router)
app.include_router(history.router)
app.include_router(usage.router)
app.include_router(api_keys.router)
app.include_router(admin.router)
app.include_router(reader.router)

# Keep `app` as FastAPI for tests (dependency overrides), and expose a
# runtime ASGI wrapper so CORS headers are preserved even on outer 500s.
asgi_app = CORSMiddleware(
    app,
    allow_origins=cors_origins,
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=False,
    allow_methods=['*'],
    allow_headers=['*'],
)

# Alias used by process managers if needed.
application = asgi_app
