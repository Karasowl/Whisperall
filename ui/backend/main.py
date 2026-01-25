"""FastAPI backend for Whisperall"""
import os
import shutil
import uuid
import json
import asyncio
import subprocess
import sys
import datetime
import threading
from pathlib import Path
from typing import Any, Optional, List
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, UploadFile, File, Form, BackgroundTasks, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from tts_service import get_tts_service, TTSService
from audio_utils import (
    chunk_text,
    concatenate_audio,
    change_speed,
    convert_format,
    estimate_generation_time,
)
from document_parser import parse_document, get_document_stats, Chapter
from model_manager import get_model_manager, ModelCategory, AVAILABLE_MODELS
from voice_analyzer import get_voice_analyzer, VoiceAnalysis
from settings_service import settings_service, get_settings
from stt_service import get_stt_service
from smart_formatter import SmartFormatter
from dictionary import list_entries as list_dictionary_entries, add_entry as add_dictionary_entry, delete_entry as delete_dictionary_entry
from snippets import list_entries as list_snippet_entries, add_entry as add_snippet_entry, delete_entry as delete_snippet_entry
from reader_service import get_reader_service
from translator import get_translation_service
from ai_editor import get_ai_edit_service
from transcription_service import get_transcription_service
from diarization_service import get_diarization_service, ThermalGuardTriggered
from export_utils import export_transcript
from system_telemetry import get_system_telemetry
from audio_cache import (
    ensure_audio_cached,
    get_audio_cache_status,
    clear_audio_cache,
    get_cached_audio_path,
)
from media_import import (
    download_media_from_url,
    is_http_url,
    sanitize_filename,
    DownloadCancelled,
)
from provider_catalog import get_supported_provider_catalog, normalize_provider_id
from providers.catalog import (
    get_providers_for_service,
    get_available_providers,
    get_all_providers,
    get_provider_options_for_frontend,
)
from providers.usage import ProviderUsageError, resolve_tts_provider_usage
from app_paths import (
    get_temp_dir,
    get_output_dir,
    get_voices_dir,
    get_presets_dir,
    get_history_dir,
    get_transcriptions_dir,
)

# Directories
BASE_DIR = Path(__file__).parent.parent.parent
VOICES_DIR = get_voices_dir()
OUTPUT_DIR = get_output_dir()
TEMP_DIR = get_temp_dir()
PRESETS_DIR = get_presets_dir()
HISTORY_DIR = get_history_dir()

# Ensure directories exist
VOICES_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
TEMP_DIR.mkdir(parents=True, exist_ok=True)
PRESETS_DIR.mkdir(parents=True, exist_ok=True)
HISTORY_DIR.mkdir(parents=True, exist_ok=True)

# Default presets that ship with the app
DEFAULT_PRESETS = [
    {
        "id": "narrator",
        "name": "Narrator",
        "description": "Calm voice for narration and audiobooks",
        "model": "multilingual",
        "temperature": 0.7,
        "exaggeration": 0.3,
        "cfg_weight": 0.6,
        "speed": 0.95,
        "is_default": True,
    },
    {
        "id": "energetic",
        "name": "Energetic",
        "description": "Bright voice with higher expressiveness",
        "model": "multilingual",
        "temperature": 0.9,
        "exaggeration": 0.8,
        "cfg_weight": 0.4,
        "speed": 1.1,
        "is_default": True,
    },
    {
        "id": "meditation",
        "name": "Meditation",
        "description": "Soft and slow for relaxation",
        "model": "multilingual",
        "temperature": 0.6,
        "exaggeration": 0.2,
        "cfg_weight": 0.7,
        "speed": 0.85,
        "is_default": True,
    },
    {
        "id": "audiobook",
        "name": "Audiobook",
        "description": "Balanced preset for long content",
        "model": "multilingual",
        "temperature": 0.75,
        "exaggeration": 0.4,
        "cfg_weight": 0.5,
        "speed": 1.0,
        "is_default": True,
    },
    {
        "id": "dramatic",
        "name": "Dramatic",
        "description": "High emotional expressiveness",
        "model": "multilingual",
        "temperature": 0.85,
        "exaggeration": 0.9,
        "cfg_weight": 0.3,
        "speed": 0.9,
        "is_default": True,
    },
]

# Job status storage (in-memory for simplicity)
jobs: dict[str, dict] = {}
book_cancelled_jobs: set[str] = set()
book_paused_jobs: set[str] = set()

# STT sessions (in-memory)
stt_sessions: dict[str, dict] = {}

# Transcription jobs (in-memory with disk persistence)
transcription_jobs: dict[str, dict] = {}
cancelled_jobs: set[str] = set()  # Track cancelled job IDs
TRANSCRIPTIONS_DIR = get_transcriptions_dir()
TRANSCRIPTIONS_DIR.mkdir(parents=True, exist_ok=True)


def _cleanup_orphaned_transcription_jobs():
    """Mark pending/transcribing jobs as interrupted on startup.

    These jobs were running when the app was closed and never completed.
    We preserve any partial segments that were saved.
    """
    if not TRANSCRIPTIONS_DIR.exists():
        return

    def _segments_cover_duration(job_data: dict) -> bool:
        segments = job_data.get("segments") or []
        if not segments:
            return False
        total_duration = job_data.get("total_duration") or 0
        if total_duration <= 0:
            return False
        last_end = segments[-1].get("end_time", 0)
        return last_end >= total_duration * 0.97

    def _mark_recovered(job_data: dict, previous_status: str, now_iso: str) -> None:
        job_data["status"] = "completed"
        job_data["previous_status"] = previous_status
        job_data["progress"] = 100
        job_data["active_started_at"] = None
        if previous_status == "diarizing":
            msg = "Diarization interrupted on restart; transcript preserved"
            job_data["current_step"] = msg
            if not job_data.get("diarization_error"):
                job_data["diarization_error"] = msg
        else:
            job_data["current_step"] = "Recovered after restart"
        job_data["recovered_at"] = now_iso

    orphaned_count = 0
    recovered_count = 0
    for job_file in TRANSCRIPTIONS_DIR.glob("*.json"):
        try:
            with open(job_file, "r", encoding="utf-8") as f:
                job_data = json.load(f)

            status = job_data.get("status", "")
            segments = job_data.get("segments", [])
            progress = job_data.get("progress", 0)
            looks_complete = _segments_cover_duration(job_data) or bool(job_data.get("completed_at"))

            if status == "interrupted" and looks_complete:
                now_iso = datetime.datetime.now().isoformat()
                _mark_recovered(job_data, job_data.get("previous_status", "interrupted"), now_iso)
                with open(job_file, "w", encoding="utf-8") as f:
                    json.dump(job_data, f, ensure_ascii=False, indent=2)
                recovered_count += 1
                print(f"[Startup] Recovered interrupted job {job_file.stem} as completed")
                continue

            # Jobs that were in progress when app closed
            if status in ("pending", "transcribing", "diarizing", "cleaning", "extracting_audio", "downloading"):
                job_id = job_file.stem
                now_iso = datetime.datetime.now().isoformat()

                if looks_complete:
                    _mark_recovered(job_data, status, now_iso)
                    recovered_count += 1
                    print(f"[Startup] Recovered orphaned job {job_id} as completed (was {status})")
                else:
                    # Mark as interrupted with info about what was saved
                    job_data["status"] = "interrupted"
                    job_data["previous_status"] = status
                    job_data["current_step"] = f"Interrupted at {progress:.1f}% - {len(segments)} segments saved"
                    job_data["interrupted_at"] = now_iso
                    job_data["active_started_at"] = None
                    orphaned_count += 1
                    print(f"[Startup] Marked orphaned job {job_id} as interrupted ({len(segments)} segments preserved)")

                with open(job_file, "w", encoding="utf-8") as f:
                    json.dump(job_data, f, ensure_ascii=False, indent=2)

        except Exception as e:
            print(f"[Startup] Error processing {job_file}: {e}")

    if orphaned_count > 0:
        print(f"[Startup] Found and marked {orphaned_count} interrupted transcription job(s)")
    if recovered_count > 0:
        print(f"[Startup] Recovered {recovered_count} transcription job(s) as completed")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events"""
    print("Starting Whisperall backend...")

    # Clean up orphaned transcription jobs from previous session
    _cleanup_orphaned_transcription_jobs()

    # Ensure pyannote has a working audio decoder (fallback if torchcodec is missing)
    try:
        from diarization_service import get_diarization_service
        diarization = get_diarization_service()
        diarization._ensure_pyannote_audio_decoder()
    except Exception as exc:
        print(f"[Startup] Pyannote audio decoder fallback not applied: {exc}")

    preload_enabled = settings_service.get("performance.preload_models", True)
    if preload_enabled:
        def _preload_tts_models():
            print("[Startup] Pre-loading TTS models (background)...")
            tts = get_tts_service()
            try:
                tts._load_model("multilingual")
                print("[Startup] Multilingual TTS model loaded successfully")
            except Exception as e:
                print(f"[Startup] TTS pre-load failed (will load on first request): {e}")

        threading.Thread(target=_preload_tts_models, daemon=True).start()
    else:
        print("[Startup] TTS pre-load disabled (will load on first request)")
    yield
    print("Shutting down Whisperall backend...")


app = FastAPI(
    title="Whisperall API",
    description="Local speech suite powered by Chatterbox and Whisper",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve output files
app.mount("/output", StaticFiles(directory=str(OUTPUT_DIR)), name="output")
app.mount("/voice-files", StaticFiles(directory=str(VOICES_DIR)), name="voice-files")


# --- Pydantic Models ---

class GenerateRequest(BaseModel):
    text: str
    provider: str = "chatterbox"  # TTS provider: chatterbox, f5-tts, orpheus, kokoro
    model: str = "multilingual"  # Model variant (provider-specific)
    language: str = "en"
    voice_id: Optional[str] = None  # ID of saved voice (for cloning providers)
    preset_voice_id: Optional[str] = None  # ID of preset voice (for Kokoro)
    temperature: float = 0.8
    exaggeration: float = 0.5
    cfg_weight: float = 0.5
    top_p: float = 0.95
    top_k: int = 1000
    speed: float = 1.0
    seed: Optional[int] = None
    output_format: str = "wav"  # wav, mp3, flac
    fast_mode: bool = False  # Disables CFG for ~50% faster generation
    device: Optional[str] = None
    # F5-TTS specific
    nfe_step: int = 32
    # Provider-specific extra params
    extra_params: Optional[dict] = None


class GenerateBookRequest(BaseModel):
    chapters: list[dict]  # [{number, title, content}]
    provider: str = "chatterbox"
    model: str = "multilingual"
    language: str = "en"
    voice_id: Optional[str] = None
    preset_voice_id: Optional[str] = None
    temperature: float = 0.8
    exaggeration: float = 0.5
    cfg_weight: float = 0.5
    top_p: float = 0.95
    top_k: int = 1000
    speed: float = 1.0
    seed: Optional[int] = None
    output_format: str = "wav"
    fast_mode: bool = False  # Disables CFG for ~50% faster generation
    device: Optional[str] = None
    # F5-TTS specific
    nfe_step: int = 32
    # Provider-specific extra params
    extra_params: Optional[dict] = None


class VoiceCreate(BaseModel):
    name: str
    tags: list[str] = []


class TrimRequest(BaseModel):
    start_time: float  # seconds
    end_time: float    # seconds
    name: str
    tags: str = ""


class PresetCreate(BaseModel):
    name: str
    description: str = ""
    model: str = "multilingual"
    language: str = "en"
    temperature: float = 0.8
    exaggeration: float = 0.5
    cfg_weight: float = 0.5
    speed: float = 1.0
    voice_id: Optional[str] = None


class PresetUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    model: Optional[str] = None
    language: Optional[str] = None
    temperature: Optional[float] = None
    exaggeration: Optional[float] = None
    cfg_weight: Optional[float] = None
    speed: Optional[float] = None
    voice_id: Optional[str] = None


class STTStartRequest(BaseModel):
    language: str = "auto"
    prompt: Optional[str] = None


class AIEditRequest(BaseModel):
    text: str
    command: str
    provider: Optional[str] = None


class TranslateRequest(BaseModel):
    text: str
    source_lang: str = "auto"
    target_lang: str = "en"
    provider: Optional[str] = None


class ReaderRequest(BaseModel):
    text: str
    language: str = "en"
    voice: Optional[str] = None
    speed: float = 1.0
    fast_mode: bool = False  # Halves generation time by disabling CFG
    device: Optional[str] = None


class DictionaryCreate(BaseModel):
    source: str
    target: str
    enabled: bool = True


class SnippetCreate(BaseModel):
    trigger: str
    expansion: str
    enabled: bool = True


# --- API Endpoints ---

@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    version = os.environ.get("NEXT_PUBLIC_APP_VERSION") or os.environ.get("APP_VERSION") or "dev"
    build_time = os.environ.get("NEXT_PUBLIC_BUILD_TIME") or os.environ.get("BUILD_TIME") or ""
    return {
        "status": "ok",
        "message": "Whisperall is running",
        "version": version,
        "build_time": build_time,
    }


@app.get("/api/system/telemetry")
async def system_telemetry():
    """Lightweight system telemetry (GPU temps/power when available)."""
    return get_system_telemetry()


@app.get("/api/cache/audio/status")
async def audio_cache_status():
    """Get audio cache size/limits."""
    return get_audio_cache_status()


@app.post("/api/cache/audio/clear")
async def audio_cache_clear():
    """Clear cached audio for privacy."""
    return clear_audio_cache()


@app.get("/api/models")
async def list_models():
    """List available TTS models"""
    return {
        "models": [
            {
                "id": "original",
                "name": "Chatterbox Original",
                "description": "500M model with creative controls (English only)",
                "languages": ["en"],
                "supports_exaggeration": True,
                "supports_cfg": True,
            },
            {
                "id": "turbo",
                "name": "Chatterbox Turbo",
                "description": "350M fast model with paralinguistic tags (English only)",
                "languages": ["en"],
                "supports_exaggeration": False,
                "supports_cfg": False,
                "tags": ["[laugh]", "[cough]", "[sigh]", "[gasp]", "[chuckle]", "[clear throat]", "[sniff]", "[groan]", "[shush]"],
            },
            {
                "id": "multilingual",
                "name": "Chatterbox Multilingual",
                "description": "500M model supporting 23 languages",
                "languages": list(get_tts_service().get_supported_languages().keys()),
                "supports_exaggeration": True,
                "supports_cfg": True,
            },
        ]
    }


@app.get("/api/languages")
async def list_languages():
    """List supported languages for multilingual model"""
    service = get_tts_service()
    languages = service.get_supported_languages()
    return {
        "languages": [
            {"code": code, "name": name}
            for code, name in languages.items()
        ]
    }


@app.get("/api/voices")
async def list_voices():
    """List saved voices with file sizes"""
    voices = []
    metadata_file = VOICES_DIR / "metadata.json"

    if metadata_file.exists():
        with open(metadata_file) as f:
            voices = json.load(f)

    # Verify files still exist and add sizes
    valid_voices = []
    total_size = 0
    for voice in voices:
        audio_path = VOICES_DIR / voice["filename"]
        if audio_path.exists():
            # Calculate total size (audio + embedding if exists)
            size = audio_path.stat().st_size
            embedding_path = VOICES_DIR / f"{voice['id']}_embedding.npy"
            if embedding_path.exists():
                size += embedding_path.stat().st_size

            voice["size_bytes"] = size
            voice["size_mb"] = round(size / (1024 * 1024), 2)
            valid_voices.append(voice)
            total_size += size

    return {
        "voices": valid_voices,
        "total_size_bytes": total_size,
        "total_size_mb": round(total_size / (1024 * 1024), 2)
    }


@app.post("/api/voices")
async def create_voice(
    name: str = Form(...),
    tags: str = Form(""),
    audio: UploadFile = File(...)
):
    """Save a new voice reference"""
    voice_id = str(uuid.uuid4())[:8]
    filename = f"{voice_id}_{audio.filename}"
    filepath = VOICES_DIR / filename

    # Save audio file
    content = await audio.read()
    with open(filepath, "wb") as f:
        f.write(content)

    # Update metadata
    metadata_file = VOICES_DIR / "metadata.json"
    voices = []
    if metadata_file.exists():
        with open(metadata_file) as f:
            voices = json.load(f)

    voice_data = {
        "id": voice_id,
        "name": name,
        "filename": filename,
        "tags": [t.strip() for t in tags.split(",") if t.strip()],
    }
    voices.append(voice_data)

    with open(metadata_file, "w") as f:
        json.dump(voices, f, indent=2)

    return voice_data


@app.delete("/api/voices/{voice_id}")
async def delete_voice(voice_id: str):
    """Delete a saved voice and all associated files"""
    metadata_file = VOICES_DIR / "metadata.json"

    if not metadata_file.exists():
        raise HTTPException(404, "Voice not found")

    with open(metadata_file) as f:
        voices = json.load(f)

    voice = next((v for v in voices if v["id"] == voice_id), None)
    if not voice:
        raise HTTPException(404, "Voice not found")

    # Delete audio file
    filepath = VOICES_DIR / voice["filename"]
    file_size = 0
    if filepath.exists():
        file_size = filepath.stat().st_size
        filepath.unlink()

    # Delete embedding file if exists
    embedding_path = VOICES_DIR / f"{voice_id}_embedding.npy"
    if embedding_path.exists():
        file_size += embedding_path.stat().st_size
        embedding_path.unlink()

    # Update metadata
    voices = [v for v in voices if v["id"] != voice_id]
    with open(metadata_file, "w") as f:
        json.dump(voices, f, indent=2)

    return {
        "message": "Voice deleted",
        "freed_bytes": file_size
    }


# --- FFmpeg Management ---

def get_ffmpeg_path() -> str:
    """Get FFmpeg path - uses bundled version from imageio-ffmpeg"""
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        # Fallback to system ffmpeg
        return "ffmpeg"


def check_ffmpeg_available() -> dict:
    """Check if FFmpeg is available and get version"""
    import subprocess

    ffmpeg_path = get_ffmpeg_path()
    try:
        result = subprocess.run(
            [ffmpeg_path, "-version"],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0:
            # Extract version from first line
            version_line = result.stdout.split('\n')[0]
            return {
                "available": True,
                "path": ffmpeg_path,
                "version": version_line,
                "bundled": "imageio_ffmpeg" in ffmpeg_path or "imageio-ffmpeg" in ffmpeg_path,
            }
    except Exception as e:
        pass

    return {
        "available": False,
        "path": None,
        "version": None,
        "error": "FFmpeg not found",
    }


@app.get("/api/system/ffmpeg")
async def get_ffmpeg_status():
    """Check FFmpeg availability"""
    return check_ffmpeg_available()


@app.get("/api/system/capabilities")
async def get_system_capabilities():
    """Get system capabilities (GPU, devices, etc.)"""
    import torch

    cuda_available = torch.cuda.is_available()
    mps_available = torch.backends.mps.is_available() if hasattr(torch.backends, 'mps') else False

    gpu_info = None
    if cuda_available:
        gpu_info = {
            "name": torch.cuda.get_device_name(0),
            "memory_total_gb": round(torch.cuda.get_device_properties(0).total_memory / 1e9, 2),
            "cuda_version": torch.version.cuda,
        }

    # Get current TTS device
    tts = get_tts_service()

    return {
        "cuda_available": cuda_available,
        "mps_available": mps_available,
        "gpu": gpu_info,
        "current_tts_device": tts.device,
        "torch_version": torch.__version__,
        "performance_settings": {
            "fast_mode": settings_service.get("performance.fast_mode", False),
            "device": settings_service.get("performance.device", "auto"),
            "preload_models": settings_service.get("performance.preload_models", True),
        }
    }


@app.post("/api/system/install-ffmpeg")
async def install_ffmpeg():
    """Install FFmpeg via imageio-ffmpeg (downloads if needed)"""
    try:
        import subprocess
        import sys

        # Install imageio-ffmpeg if not present
        result = subprocess.run(
            [sys.executable, "-m", "pip", "install", "imageio-ffmpeg"],
            capture_output=True,
            text=True,
            timeout=120
        )

        if result.returncode != 0:
            raise Exception("FFmpeg installation failed. Please try restarting the application.")

        # Verify installation
        import importlib
        import imageio_ffmpeg
        importlib.reload(imageio_ffmpeg)

        ffmpeg_path = imageio_ffmpeg.get_ffmpeg_exe()

        return {
            "success": True,
            "message": "FFmpeg installed successfully",
            "path": ffmpeg_path,
        }
    except Exception as e:
        raise HTTPException(500, f"Failed to install FFmpeg: {str(e)}")


@app.post("/api/system/install-stt")
async def install_stt_engine():
    """Install the local STT engine (faster-whisper)."""
    try:
        result = subprocess.run(
            [sys.executable, "-m", "pip", "install", "faster-whisper"],
            capture_output=True,
            text=True,
            timeout=600,
            check=True,
        )
        output = (result.stdout or "") + "\n" + (result.stderr or "")
        lines = [line for line in output.splitlines() if line.strip()]
        summary = "\n".join(lines[-12:]) if lines else "Install complete."
        return {"success": True, "message": "faster-whisper installed", "output": summary}
    except subprocess.CalledProcessError as exc:
        output = (exc.stdout or "") + "\n" + (exc.stderr or "")
        lines = [line for line in output.splitlines() if line.strip()]
        summary = "\n".join(lines[-12:]) if lines else "Install failed."
        raise HTTPException(500, f"Install failed: {summary}") from exc


# --- Media Upload and Trimming ---

@app.post("/api/media/upload")
async def upload_media(file: UploadFile = File(...)):
    """Upload video/audio file for processing, extract audio if video"""
    import subprocess
    import wave

    # Get FFmpeg path
    ffmpeg_path = get_ffmpeg_path()

    # Save uploaded file temporarily
    temp_id = str(uuid.uuid4())[:8]
    original_ext = Path(file.filename).suffix.lower()
    temp_input = TEMP_DIR / f"{temp_id}_input{original_ext}"
    temp_audio = TEMP_DIR / f"{temp_id}_audio.wav"

    content = await file.read()
    with open(temp_input, "wb") as f:
        f.write(content)

    try:
        # Check if it's a video file - extract audio with ffmpeg
        video_extensions = ['.mp4', '.avi', '.mov', '.mkv', '.webm', '.flv', '.wmv']
        audio_extensions = ['.wav', '.mp3', '.flac', '.ogg', '.m4a', '.aac']

        if original_ext in video_extensions:
            # Extract audio from video using ffmpeg
            try:
                result = subprocess.run([
                    ffmpeg_path, '-y', '-i', str(temp_input),
                    '-vn', '-acodec', 'pcm_s16le', '-ar', '22050', '-ac', '1',
                    str(temp_audio)
                ], capture_output=True, text=True, timeout=60)

                if result.returncode != 0:
                    raise HTTPException(500, f"FFmpeg error: {result.stderr}")

            except FileNotFoundError:
                raise HTTPException(500, "FFmpeg not found. Use /api/system/install-ffmpeg to install.")

        elif original_ext in audio_extensions:
            # Convert audio to consistent WAV format
            try:
                result = subprocess.run([
                    ffmpeg_path, '-y', '-i', str(temp_input),
                    '-acodec', 'pcm_s16le', '-ar', '22050', '-ac', '1',
                    str(temp_audio)
                ], capture_output=True, text=True, timeout=60)

                if result.returncode != 0:
                    raise HTTPException(500, f"FFmpeg error: {result.stderr}")

            except FileNotFoundError:
                raise HTTPException(500, "FFmpeg not found. Use /api/system/install-ffmpeg to install.")
        else:
            raise HTTPException(400, f"Unsupported file format: {original_ext}")

        # Get audio duration
        with wave.open(str(temp_audio), 'rb') as wav:
            frames = wav.getnframes()
            rate = wav.getframerate()
            duration = frames / float(rate)

        # Generate waveform data for visualization (downsample for performance)
        import numpy as np
        from scipy.io import wavfile

        sr, audio_data = wavfile.read(str(temp_audio))
        if len(audio_data.shape) > 1:
            audio_data = audio_data.mean(axis=1)  # Convert to mono

        # Normalize
        audio_data = audio_data.astype(np.float32)
        if audio_data.max() > 0:
            audio_data = audio_data / np.abs(audio_data).max()

        # Downsample to ~500 points for visualization
        target_points = 500
        chunk_size = max(1, len(audio_data) // target_points)
        waveform = []
        for i in range(0, len(audio_data), chunk_size):
            chunk = audio_data[i:i + chunk_size]
            waveform.append(float(np.abs(chunk).mean()))

        # Clean up input file
        temp_input.unlink()

        return {
            "temp_id": temp_id,
            "duration": duration,
            "sample_rate": sr,
            "waveform": waveform,
            "audio_url": f"/temp/{temp_id}_audio.wav",
        }

    except Exception as e:
        # Cleanup on error
        if temp_input.exists():
            temp_input.unlink()
        if temp_audio.exists():
            temp_audio.unlink()
        raise HTTPException(500, str(e))


@app.post("/api/media/trim")
async def trim_and_save(
    temp_id: str = Form(...),
    start_time: float = Form(...),
    end_time: float = Form(...),
    name: str = Form(...),
    tags: str = Form("")
):
    """Trim audio to selected range and save to voice library"""
    import subprocess

    temp_audio = TEMP_DIR / f"{temp_id}_audio.wav"
    if not temp_audio.exists():
        raise HTTPException(404, "Temporary audio not found. Please upload again.")

    # Validate range
    duration = end_time - start_time
    if duration <= 0:
        raise HTTPException(400, "Invalid time range")
    if duration > 30:
        raise HTTPException(400, "Maximum duration is 30 seconds")

    # Create new voice entry
    voice_id = str(uuid.uuid4())[:8]
    filename = f"{voice_id}_{name.replace(' ', '_')}.wav"
    output_path = VOICES_DIR / filename

    # Get FFmpeg path
    ffmpeg_path = get_ffmpeg_path()

    # Trim audio using ffmpeg
    try:
        result = subprocess.run([
            ffmpeg_path, '-y', '-i', str(temp_audio),
            '-ss', str(start_time), '-t', str(duration),
            '-acodec', 'pcm_s16le', '-ar', '22050', '-ac', '1',
            str(output_path)
        ], capture_output=True, text=True, timeout=30)

        if result.returncode != 0:
            raise HTTPException(500, f"FFmpeg error: {result.stderr}")

    except FileNotFoundError:
        raise HTTPException(500, "FFmpeg not found")

    # Save to voice metadata
    metadata_file = VOICES_DIR / "metadata.json"
    voices = []
    if metadata_file.exists():
        with open(metadata_file) as f:
            voices = json.load(f)

    voice_data = {
        "id": voice_id,
        "name": name,
        "filename": filename,
        "tags": [t.strip() for t in tags.split(",") if t.strip()],
        "duration": duration,
    }
    voices.append(voice_data)

    with open(metadata_file, "w") as f:
        json.dump(voices, f, indent=2)

    # Cleanup temp file
    temp_audio.unlink()

    # Auto-analyze the voice
    try:
        analyzer = get_voice_analyzer()
        analysis = analyzer.analyze(str(output_path))

        voice_data["analysis"] = {
            "duration_seconds": analysis.duration_seconds,
            "pitch_mean": analysis.pitch_mean,
            "pitch_std": analysis.pitch_std,
            "pitch_category": analysis.pitch_category,
            "energy_mean": analysis.energy_mean,
            "energy_category": analysis.energy_category,
            "tempo_category": analysis.tempo_category,
            "description": analysis.description,
        }

        # Save embedding
        import numpy as np
        embedding_path = VOICES_DIR / f"{voice_id}_embedding.npy"
        np.save(str(embedding_path), analysis.embedding)

        # Update metadata with analysis
        with open(metadata_file, "w") as f:
            json.dump(voices, f, indent=2)

    except Exception as e:
        print(f"Auto-analysis failed: {e}")

    return voice_data


@app.delete("/api/media/{temp_id}")
async def cleanup_temp_media(temp_id: str):
    """Clean up temporary media files"""
    temp_audio = TEMP_DIR / f"{temp_id}_audio.wav"
    if temp_audio.exists():
        temp_audio.unlink()
    return {"message": "Cleaned up"}


# Mount temp directory for audio preview
app.mount("/temp", StaticFiles(directory=str(TEMP_DIR)), name="temp")


@app.get("/api/voices/{voice_id}/analyze")
async def analyze_voice(voice_id: str):
    """Analyze a voice to extract characteristics"""
    metadata_file = VOICES_DIR / "metadata.json"

    if not metadata_file.exists():
        raise HTTPException(404, "Voice not found")

    with open(metadata_file) as f:
        voices = json.load(f)

    voice = next((v for v in voices if v["id"] == voice_id), None)
    if not voice:
        raise HTTPException(404, "Voice not found")

    filepath = VOICES_DIR / voice["filename"]
    if not filepath.exists():
        raise HTTPException(404, "Voice file not found")

    try:
        analyzer = get_voice_analyzer()
        analysis = analyzer.analyze(str(filepath))

        # Store analysis in metadata
        voice["analysis"] = {
            "duration_seconds": analysis.duration_seconds,
            "pitch_mean": analysis.pitch_mean,
            "pitch_std": analysis.pitch_std,
            "pitch_category": analysis.pitch_category,
            "energy_mean": analysis.energy_mean,
            "energy_category": analysis.energy_category,
            "tempo_category": analysis.tempo_category,
            "description": analysis.description,
        }

        # Save embedding separately (too large for JSON)
        import numpy as np
        embedding_path = VOICES_DIR / f"{voice_id}_embedding.npy"
        np.save(str(embedding_path), analysis.embedding)

        # Update metadata
        with open(metadata_file, "w") as f:
            json.dump(voices, f, indent=2)

        return {
            "voice_id": voice_id,
            "analysis": voice["analysis"],
            "embedding_saved": True,
        }

    except Exception as e:
        raise HTTPException(500, f"Analysis failed: {str(e)}")


@app.post("/api/voices/compare")
async def compare_voices(voice_id_1: str = Form(...), voice_id_2: str = Form(...)):
    """Compare similarity between two voices"""
    import numpy as np

    # Load embeddings
    embedding1_path = VOICES_DIR / f"{voice_id_1}_embedding.npy"
    embedding2_path = VOICES_DIR / f"{voice_id_2}_embedding.npy"

    if not embedding1_path.exists():
        raise HTTPException(400, f"Voice {voice_id_1} has not been analyzed yet")
    if not embedding2_path.exists():
        raise HTTPException(400, f"Voice {voice_id_2} has not been analyzed yet")

    embedding1 = np.load(str(embedding1_path))
    embedding2 = np.load(str(embedding2_path))

    analyzer = get_voice_analyzer()
    similarity = analyzer.compare_voices(embedding1, embedding2)

    return {
        "voice_id_1": voice_id_1,
        "voice_id_2": voice_id_2,
        "similarity": round(similarity * 100, 1),
        "similarity_label": "muy similar" if similarity > 0.85 else "similar" if similarity > 0.7 else "diferente",
    }


# --- Preset Endpoints ---

def get_presets_file():
    """Get path to user presets file"""
    return PRESETS_DIR / "user_presets.json"


def load_all_presets():
    """Load both default and user presets"""
    presets = list(DEFAULT_PRESETS)  # Copy default presets

    # Load user presets
    presets_file = get_presets_file()
    if presets_file.exists():
        with open(presets_file) as f:
            user_presets = json.load(f)
            presets.extend(user_presets)

    return presets


def save_user_presets(presets: list):
    """Save user presets to file"""
    presets_file = get_presets_file()
    with open(presets_file, "w") as f:
        json.dump(presets, f, indent=2)


@app.get("/api/presets")
async def list_presets():
    """List all presets (default + user)"""
    presets = load_all_presets()
    return {"presets": presets}


@app.get("/api/presets/{preset_id}")
async def get_preset(preset_id: str):
    """Get a specific preset by ID"""
    presets = load_all_presets()
    preset = next((p for p in presets if p["id"] == preset_id), None)
    if not preset:
        raise HTTPException(404, "Preset not found")
    return preset


@app.post("/api/presets")
async def create_preset(preset: PresetCreate):
    """Create a new user preset"""
    preset_id = str(uuid.uuid4())[:8]

    new_preset = {
        "id": preset_id,
        "name": preset.name,
        "description": preset.description,
        "model": preset.model,
        "language": preset.language,
        "temperature": preset.temperature,
        "exaggeration": preset.exaggeration,
        "cfg_weight": preset.cfg_weight,
        "speed": preset.speed,
        "voice_id": preset.voice_id,
        "is_default": False,
    }

    # Load existing user presets
    presets_file = get_presets_file()
    user_presets = []
    if presets_file.exists():
        with open(presets_file) as f:
            user_presets = json.load(f)

    user_presets.append(new_preset)
    save_user_presets(user_presets)

    return new_preset


@app.put("/api/presets/{preset_id}")
async def update_preset(preset_id: str, preset: PresetUpdate):
    """Update a user preset (default presets cannot be modified)"""
    # Check if it's a default preset
    if any(p["id"] == preset_id for p in DEFAULT_PRESETS):
        raise HTTPException(400, "Cannot modify default presets")

    presets_file = get_presets_file()
    if not presets_file.exists():
        raise HTTPException(404, "Preset not found")

    with open(presets_file) as f:
        user_presets = json.load(f)

    preset_index = next((i for i, p in enumerate(user_presets) if p["id"] == preset_id), None)
    if preset_index is None:
        raise HTTPException(404, "Preset not found")

    # Update fields that are provided
    update_data = preset.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        if value is not None:
            user_presets[preset_index][key] = value

    save_user_presets(user_presets)
    return user_presets[preset_index]


@app.delete("/api/presets/{preset_id}")
async def delete_preset(preset_id: str):
    """Delete a user preset (default presets cannot be deleted)"""
    # Check if it's a default preset
    if any(p["id"] == preset_id for p in DEFAULT_PRESETS):
        raise HTTPException(400, "Cannot delete default presets")

    presets_file = get_presets_file()
    if not presets_file.exists():
        raise HTTPException(404, "Preset not found")

    with open(presets_file) as f:
        user_presets = json.load(f)

    original_len = len(user_presets)
    user_presets = [p for p in user_presets if p["id"] != preset_id]

    if len(user_presets) == original_len:
        raise HTTPException(404, "Preset not found")

    save_user_presets(user_presets)
    return {"message": "Preset deleted", "id": preset_id}


# --- History Endpoints ---

HISTORY_MODULES = {"tts", "stt", "reader", "ai_edit", "translation"}


def normalize_history_module(module: Optional[str]) -> str:
    """Normalize and validate history module."""
    normalized = (module or "tts").strip().lower()
    if normalized not in HISTORY_MODULES:
        raise HTTPException(400, f"Unsupported history module: {normalized}")
    return normalized


def get_history_file(module: str):
    """Get path to history file for a module."""
    if module == "tts":
        return HISTORY_DIR / "history.json"
    return HISTORY_DIR / f"history_{module}.json"


def load_history(module: str) -> list:
    """Load history for a module."""
    history_file = get_history_file(module)
    if history_file.exists():
        with open(history_file) as f:
            return json.load(f)
    return []


def save_history(module: str, history: list):
    """Save history for a module."""
    history_file = get_history_file(module)
    with open(history_file, "w") as f:
        json.dump(history, f, indent=2)


def save_history_entry(module: str, entry: dict):
    """Add a new entry to a module history."""
    if not settings_service.get("ui.save_history", True):
        return
    entry["module"] = module
    history = load_history(module)
    history.insert(0, entry)  # Add at beginning (most recent first)
    history = history[:100]
    save_history(module, history)


# NOTE: Old file-based history routes commented out - replaced by new database-based routes
# defined later in the file (around line 6757+). See history_service.py and history_db.py.
#
# @app.get("/api/history")
# async def get_history_list(limit: int = 50, offset: int = 0, module: Optional[str] = None):
#     """Get module history (default: tts)."""
#     module_id = normalize_history_module(module)
#     history = load_history(module_id)
#
#     valid_history = []
#     for entry in history:
#         if module_id in {"tts", "reader"} and entry.get("filename"):
#             output_path = OUTPUT_DIR / entry["filename"]
#             if output_path.exists():
#                 entry["file_exists"] = True
#                 entry["file_size_bytes"] = output_path.stat().st_size
#                 entry["file_size_mb"] = round(output_path.stat().st_size / (1024 * 1024), 2)
#             else:
#                 entry["file_exists"] = False
#         valid_history.append(entry)
#
#     total = len(valid_history)
#     paginated = valid_history[offset:offset + limit]
#
#     return {
#         "module": module_id,
#         "history": paginated,
#         "total": total,
#         "limit": limit,
#         "offset": offset,
#     }
#
#
# @app.get("/api/history/{history_id}")
# async def get_history_entry(history_id: str, module: Optional[str] = None):
#     """Get a specific history entry."""
#     module_id = normalize_history_module(module)
#     history = load_history(module_id)
#     entry = next((h for h in history if h["id"] == history_id), None)
#     if not entry:
#         raise HTTPException(404, "History entry not found")
#
#     if module_id in {"tts", "reader"} and entry.get("filename"):
#         output_path = OUTPUT_DIR / entry["filename"]
#         entry["file_exists"] = output_path.exists()
#         if entry["file_exists"]:
#             entry["file_size_bytes"] = output_path.stat().st_size
#
#     return entry
#
#
# @app.delete("/api/history/{history_id}")
# async def delete_history_entry(history_id: str, delete_file: bool = True, module: Optional[str] = None):
#     """Delete a history entry and optionally its audio file."""
#     module_id = normalize_history_module(module)
#     history = load_history(module_id)
#
#     entry = next((h for h in history if h["id"] == history_id), None)
#     if not entry:
#         raise HTTPException(404, "History entry not found")
#
#     freed_space = 0
#     if delete_file and module_id in {"tts", "reader"} and entry.get("filename"):
#         output_path = OUTPUT_DIR / entry["filename"]
#         if output_path.exists():
#             freed_space = output_path.stat().st_size
#             output_path.unlink()
#
#     history = [h for h in history if h["id"] != history_id]
#     save_history(module_id, history)
#
#     return {
#         "message": "History entry deleted",
#         "id": history_id,
#         "file_deleted": delete_file,
#         "freed_bytes": freed_space,
#     }
#
#
# @app.delete("/api/history")
# async def clear_history(delete_files: bool = False, module: Optional[str] = None):
#     """Clear all history entries for a module."""
#     module_id = normalize_history_module(module)
#     history = load_history(module_id)
#     freed_space = 0
#
#     if delete_files and module_id in {"tts", "reader"}:
#         for entry in history:
#             filename = entry.get("filename")
#             if not filename:
#                 continue
#             output_path = OUTPUT_DIR / filename
#             if output_path.exists():
#                 freed_space += output_path.stat().st_size
#                 output_path.unlink()
#
#     save_history(module_id, [])
#
#     return {
#         "message": "History cleared",
#         "entries_deleted": len(history),
#         "files_deleted": delete_files,
#         "freed_bytes": freed_space,
#     }


 # =====================================================
 # TTS PROVIDERS ENDPOINTS
 # =====================================================

POINT_BASED_TTS_PROVIDERS = {"elevenlabs"}


def build_tts_billing(provider_id: str, text: str, chunks: list[str]) -> dict[str, Any]:
    normalized = (provider_id or "chatterbox").lower()
    char_count = sum(len(chunk) for chunk in chunks if chunk)
    if char_count == 0:
        char_count = len(text or "")
    is_point_provider = normalized in POINT_BASED_TTS_PROVIDERS
    unit = "points" if is_point_provider else "characters"
    provider_label = provider_id or "TTS provider"
    details = (
        f"{char_count} ElevenLabs points ({char_count} characters)"
        if is_point_provider
        else f"{char_count} characters via {provider_label}"
    )
    return {
        "value": char_count,
        "unit": unit,
        "details": details,
        "provider": normalized,
        "amount": None,
        "currency": "points" if is_point_provider else None,
    }


@app.get("/api/tts/providers")
async def list_tts_providers():
    """List all implemented TTS providers."""
    from tts_providers import list_providers, get_provider_info
    from tts_providers.registry import is_provider_ready, get_missing_dependencies

    providers = []

    # 1. Add all implemented providers from TTS registry
    for provider_id in list_providers():
        info = get_provider_info(provider_id)
        if info:
            models = []
            for m in info.models:
                if isinstance(m, dict):
                    models.append(m)
                elif hasattr(m, "__dict__"):
                    models.append({
                        "id": getattr(m, "id", None),
                        "name": getattr(m, "name", None),
                        "size_gb": getattr(m, "size_gb", None),
                        "vram_gb": getattr(m, "vram_gb", None),
                        "description": getattr(m, "description", None),
                    })
                else:
                    models.append({"id": m, "name": m})

            # Determine type (local vs API)
            api_provider_ids = [
                "openai-tts", "elevenlabs", "fishaudio", "cartesia", "playht",
                "siliconflow", "minimax", "zyphra", "narilabs"
            ]
            is_api = provider_id in api_provider_ids

            deps = get_missing_dependencies(provider_id)
            providers.append({
                "id": info.id,
                "name": info.name,
                "description": info.description,
                "voice_cloning": info.voice_cloning.value,
                "supported_languages": info.supported_languages,
                "models": models,
                "default_model": info.default_model,
                "sample_rate": info.sample_rate,
                "vram_gb": info.vram_requirement_gb,
                "supports_streaming": info.supports_streaming,
                "supports_emotion_tags": info.supports_emotion_tags,
                "supports_fast_mode": getattr(info, 'supports_fast_mode', False),
                "requires_reference_text": info.requires_reference_text,
                "min_reference_duration": info.min_reference_duration,
                "max_reference_duration": info.max_reference_duration,
                "extra_params": info.extra_params,
                "preset_voices": [
                    {
                        "id": v.id,
                        "name": v.name,
                        "language": v.language,
                        "gender": v.gender,
                        "description": v.description,
                        "sample_url": v.sample_url,
                    }
                    for v in info.preset_voices
                ],
                "is_ready": deps.get("ready", is_provider_ready(provider_id)),
                "is_implemented": True,
                "type": "api" if is_api else "local",
                "readiness": deps,
            })
    return {"providers": providers}


@app.get("/api/tts/providers/{provider_id}")
async def get_tts_provider_info(provider_id: str):
    """Get detailed info about a specific TTS provider"""
    from tts_providers import get_provider_info

    info = get_provider_info(provider_id)
    if not info:
        raise HTTPException(404, f"TTS provider not found: {provider_id}")

    models = []
    for m in info.models:
        if isinstance(m, dict):
            models.append(m)
        elif hasattr(m, "__dict__"):
            models.append({
                "id": getattr(m, "id", None),
                "name": getattr(m, "name", None),
                "size_gb": getattr(m, "size_gb", None),
                "vram_gb": getattr(m, "vram_gb", None),
                "description": getattr(m, "description", None),
            })
        else:
            models.append({"id": m, "name": m})

    return {
        "id": info.id,
        "name": info.name,
        "description": info.description,
        "voice_cloning": info.voice_cloning.value,
        "supported_languages": info.supported_languages,
        "models": models,
        "default_model": info.default_model,
        "sample_rate": info.sample_rate,
        "vram_gb": info.vram_requirement_gb,
        "supports_streaming": info.supports_streaming,
        "supports_emotion_tags": info.supports_emotion_tags,
        "requires_reference_text": info.requires_reference_text,
        "preset_voices": [
            {
                "id": v.id,
                "name": v.name,
                "language": v.language,
                "gender": v.gender,
                "description": v.description,
                "sample_url": v.sample_url,
            }
            for v in info.preset_voices
        ],
        "extra_params": info.extra_params,
    }


@app.get("/api/tts/providers/{provider_id}/usage")
async def get_tts_provider_usage(provider_id: str):
    """Expose usage/quota info for API-based TTS providers."""
    try:
        usage = resolve_tts_provider_usage(provider_id)
    except ProviderUsageError as exc:
        raise HTTPException(exc.status_code, str(exc))

    return {"provider": provider_id, "usage": usage}


@app.get("/api/tts/providers/{provider_id}/voices")
async def get_tts_provider_voices(provider_id: str, language: Optional[str] = None):
    """Get preset voices for a provider (mainly for Kokoro)"""
    from tts_providers import get_provider
    from tts_providers.registry import get_missing_dependencies

    try:
        provider = get_provider(provider_id)
    except ValueError as e:
        raise HTTPException(404, str(e))

    deps = get_missing_dependencies(provider_id)
    if deps.get("missing_api_key"):
        raise HTTPException(400, deps.get("error_message") or "API key not configured")

    try:
        voices = provider.get_preset_voices(language)
    except Exception as exc:
        detail = str(exc) or "Failed to load voices"
        raise HTTPException(400, detail)

    if language:
        language = language.lower()
        lang_base = language.split("-")[0] if "-" in language else language

        def _matches_lang(voice_lang: Optional[str]) -> bool:
            if not voice_lang:
                return False
            tokens = [part.strip().lower() for part in voice_lang.replace(";", ",").split(",")]
            for token in tokens:
                if not token:
                    continue
                if token == language:
                    return True
                token_base = token.split("-")[0] if "-" in token else token
                if token_base == lang_base:
                    return True
            return False

        if any(v.language for v in voices):
            voices = [v for v in voices if _matches_lang(v.language) or not v.language]

    return {
        "voices": [
            {
                "id": v.id,
                "name": v.name,
                "language": v.language,
                "gender": v.gender,
                "description": v.description,
                "sample_url": v.sample_url,
            }
            for v in voices
        ]
    }


@app.get("/api/tts/providers/for-language/{language}")
async def get_providers_for_language(language: str):
    """Get TTS providers that support a specific language"""
    from tts_providers.registry import get_providers_for_language, get_best_provider_for_language, get_provider_info

    providers = get_providers_for_language(language)
    best = get_best_provider_for_language(language)

    result = []
    for pid in providers:
        info = get_provider_info(pid)
        if info:
            result.append({
                "id": pid,
                "name": info.name,
                "recommended": pid == best,
                "voice_cloning": info.voice_cloning.value,
            })

    return {
        "language": language,
        "providers": result,
        "recommended": best,
    }


@app.post("/api/tts/providers/{provider_id}/load")
async def load_tts_provider(provider_id: str, model: Optional[str] = None):
    """Pre-load a TTS provider model"""
    from tts_providers import get_provider

    try:
        provider = get_provider(provider_id)
        provider.load(model)
        return {"provider": provider_id, "loaded": True, "device": provider.device}
    except Exception as e:
        raise HTTPException(400, f"Failed to load provider: {e}")


@app.post("/api/tts/providers/{provider_id}/unload")
async def unload_tts_provider(provider_id: str):
    """Unload a TTS provider to free memory"""
    from tts_providers.registry import unload_provider

    unloaded = unload_provider(provider_id)
    return {"provider": provider_id, "unloaded": unloaded}


@app.post("/api/tts/speak")
async def speak_text(request: GenerateRequest):
    """Generate audio and return it directly as a file response (for widget)"""
    # Reuse generation logic by calling the service directly or via internal call
    # Ideally we refactor 'generate_audio' to be reusable, but for now we can wrap it.
    # However, 'generate_audio' returns a JSON with URL.
    # We want to return the binary/file.
    
    # Let's call generate_audio logic.
    res = await generate_audio(request)
    if isinstance(res, dict) and res.get("success"):
        filename = res["filename"]
        file_path = OUTPUT_DIR / filename
        return FileResponse(file_path, media_type="audio/wav")
    
    raise HTTPException(500, "Generation failed")


@app.post("/api/generate")
async def generate_audio(request: GenerateRequest):
    """Generate audio from text using the selected TTS provider"""
    from tts_providers import get_provider
    from tts_providers.registry import list_providers

    # Determine provider
    provider_id = request.provider or "chatterbox"

    # Fallback to chatterbox if provider not available
    if provider_id not in list_providers():
        print(f"[Generate] Provider {provider_id} not available, falling back to chatterbox")
        provider_id = "chatterbox"

    # Pre-flight dependency check
    from tts_providers.registry import get_missing_dependencies
    deps = get_missing_dependencies(provider_id)
    if not deps["ready"]:
        raise HTTPException(400, f"Provider not ready: {deps['error_message']}")

    # Get provider instance
    try:
        provider = get_provider(provider_id, device=request.device)
    except Exception as e:
        raise HTTPException(400, f"Failed to initialize TTS provider: {e}")

    # Get voice reference path (for voice cloning providers)
    voice_path = None
    voice_text = None
    if request.voice_id:
        metadata_file = VOICES_DIR / "metadata.json"
        if metadata_file.exists():
            with open(metadata_file) as f:
                voices = json.load(f)
            voice = next((v for v in voices if v["id"] == request.voice_id), None)
            if voice:
                voice_path = str(VOICES_DIR / voice["filename"])
                # Some providers need reference text
                voice_text = voice.get("transcription")

    # Chunk the text
    chunks = chunk_text(request.text, max_chars=250)
    billing_info = build_tts_billing(provider_id, request.text, chunks)

    # Build provider-specific kwargs
    gen_kwargs = {
        "language": request.language,
        "speed": request.speed,
        "seed": request.seed,
    }

    # Provider-specific parameters
    if provider_id == "chatterbox":
        effective_cfg = 0.0 if request.fast_mode else request.cfg_weight
        gen_kwargs.update({
            "model": request.model,
            "temperature": request.temperature,
            "exaggeration": request.exaggeration,
            "cfg_weight": effective_cfg,
            "top_p": request.top_p,
            "top_k": request.top_k,
        })
    elif provider_id == "f5-tts":
        gen_kwargs.update({
            "model": request.model if request.model != "multilingual" else None,
            "nfe_step": request.nfe_step,
        })
    elif provider_id == "orpheus":
        gen_kwargs.update({
            "model": request.model if request.model not in ["multilingual", "original", "turbo"] else None,
            "temperature": request.temperature,
            "top_p": request.top_p,
        })
    elif provider_id == "kokoro":
        gen_kwargs.update({
            "voice_id": request.preset_voice_id,
        })
    elif provider_id == "zonos":
        gen_kwargs.update({
            "model": request.model if request.model not in ["multilingual", "original"] else None,
        })
    elif provider_id == "vibevoice":
        gen_kwargs.update({
            "model": request.model if request.model not in ["multilingual", "original"] else None,
            "temperature": request.temperature,
        })
    elif provider_id == "voxcpm":
        gen_kwargs.update({
            "model": request.model if request.model not in ["multilingual", "original"] else None,
            "temperature": request.temperature,
            "top_p": request.top_p,
        })
    elif provider_id == "dia":
        gen_kwargs.update({
            "model": request.model if request.model not in ["multilingual", "original"] else None,
            "voice_id": request.preset_voice_id,  # S1, S2, narrator
        })
    elif provider_id == "openvoice":
        gen_kwargs.update({
            "model": request.model if request.model not in ["multilingual", "original"] else None,
        })
    elif provider_id == "fish-speech":
        gen_kwargs.update({
            "model": request.model if request.model not in ["multilingual", "original"] else None,
            "temperature": request.temperature,
            "top_p": request.top_p,
        })
    # API Providers
    elif provider_id == "openai-tts":
        gen_kwargs.update({
            "model": request.model or "tts-1",
            "voice_id": request.preset_voice_id or "alloy",
        })
    elif provider_id == "elevenlabs":
        gen_kwargs.update({
            "model": request.model or "eleven_multilingual_v2",
            "voice_id": request.preset_voice_id,
        })
    elif provider_id == "fishaudio":
        gen_kwargs.update({
            "model": request.model or "default",
            "voice_id": request.preset_voice_id,
        })
    elif provider_id == "cartesia":
        gen_kwargs.update({
            "model": request.model or "sonic-2",
            "voice_id": request.preset_voice_id,
        })
    elif provider_id == "playht":
        gen_kwargs.update({
            "model": request.model or "PlayHT2.0-turbo",
            "voice_id": request.preset_voice_id,
        })
    elif provider_id == "siliconflow":
        gen_kwargs.update({
            "model": request.model or "CosyVoice-300M-SFT",
            "voice_id": request.preset_voice_id,
        })
    elif provider_id == "minimax":
        gen_kwargs.update({
            "model": request.model or "speech-01-turbo",
            "voice_id": request.preset_voice_id,
        })
    elif provider_id == "zyphra":
        gen_kwargs.update({
            "model": request.model or "zonos-v1",
            "voice_id": request.preset_voice_id,
        })
    elif provider_id == "narilabs":
        gen_kwargs.update({
            "model": request.model or "dia-1.6b",
            "voice_id": request.preset_voice_id,  # S1, S2, narrator
        })

    # Add extra params if provided (overrides defaults)
    if request.extra_params:
        gen_kwargs.update(request.extra_params)

    # Generate audio for each chunk
    audio_segments = []
    sample_rate = 24000

    for chunk in chunks:
        try:
            audio, sr = provider.generate(
                text=chunk,
                voice_audio_path=voice_path,
                voice_audio_text=voice_text,
                **gen_kwargs
            )
            audio_segments.append(audio)
            sample_rate = sr
        except ImportError as e:
            # Missing package - provide helpful error message
            from tts_providers.registry import get_missing_dependencies
            deps = get_missing_dependencies(provider_id)
            if deps.get("error_message"):
                raise HTTPException(500, f"Generation failed: {deps['error_message']}")
            raise HTTPException(500, f"Generation failed: {e}")
        except Exception as e:
            error_msg = str(e)
            # Check for common import-related errors in the message
            if "not installed" in error_msg.lower() or "no module" in error_msg.lower():
                from tts_providers.registry import get_missing_dependencies
                deps = get_missing_dependencies(provider_id)
                if deps.get("error_message"):
                    raise HTTPException(500, f"Generation failed: {deps['error_message']}")
            raise HTTPException(500, f"Generation failed: {e}")

    # Concatenate segments
    final_audio = concatenate_audio(audio_segments, sample_rate=sample_rate)

    # Apply speed change if needed (for providers that don't handle speed internally)
    # API providers and some local providers handle speed in their own API
    providers_with_internal_speed = [
        "f5-tts", "kokoro", "openai-tts", "elevenlabs", "fishaudio",
        "cartesia", "playht", "siliconflow", "minimax", "zyphra", "narilabs"
    ]
    if request.speed != 1.0 and provider_id not in providers_with_internal_speed:
        final_audio = change_speed(final_audio, sample_rate, request.speed)

    # Save output
    output_id = str(uuid.uuid4())[:8]
    output_path = OUTPUT_DIR / f"{output_id}.wav"

    # Use torchaudio to save
    import torchaudio
    import torch as torch_module
    audio_tensor = torch_module.from_numpy(final_audio).unsqueeze(0)
    torchaudio.save(str(output_path), audio_tensor, sample_rate)

    # Convert format if needed
    if request.output_format != "wav":
        converted_path = convert_format(
            str(output_path),
            str(OUTPUT_DIR / f"{output_id}.{request.output_format}"),
            request.output_format
        )
        output_path.unlink()  # Remove WAV
        output_path = Path(converted_path)

    # Save to history (legacy JSON system)
    from datetime import datetime
    history_entry = {
        "id": output_id,
        "text": request.text[:500],  # Truncate long texts
        "text_full": request.text,
        "provider": provider_id,
        "model": request.model,
        "language": request.language,
        "voice_id": request.voice_id,
        "preset_voice_id": request.preset_voice_id,
        "temperature": request.temperature,
        "exaggeration": request.exaggeration,
        "cfg_weight": request.cfg_weight,
        "speed": request.speed,
        "output_format": request.output_format,
        "filename": output_path.name,
        "output_url": f"/output/{output_path.name}",
        "created_at": datetime.now().isoformat(),
        "chunks_processed": len(chunks),
        "billing": billing_info,
    }
    save_history_entry("tts", history_entry)

    # Save to new history system (SQLite with file storage)
    try:
        from history_service import get_history_service
        import librosa
        # Get audio duration
        duration = librosa.get_duration(filename=str(output_path))
        # Get voice name if available
        voice_name = None
        if request.voice_id:
            metadata_file = VOICES_DIR / "metadata.json"
            if metadata_file.exists():
                with open(metadata_file) as f:
                    voices = json.load(f)
                voice = next((v for v in voices if v["id"] == request.voice_id), None)
                if voice:
                    voice_name = voice.get("name")

        history_svc = get_history_service()
        history_svc.save_tts_entry(
            text=request.text,
            audio_path=str(output_path),
            provider=provider_id,
            model=request.model,
            voice_id=request.voice_id or request.preset_voice_id,
            voice_name=voice_name,
            settings={
                "language": request.language,
                "temperature": request.temperature,
                "exaggeration": request.exaggeration,
                "cfg_weight": request.cfg_weight,
                "speed": request.speed,
                "output_format": request.output_format,
            },
            duration_seconds=duration,
            characters_count=len(request.text),
        )
    except Exception as e:
        print(f"[History] Failed to save TTS entry: {e}")

    return {
        "success": True,
        "output_url": f"/output/{output_path.name}",
        "filename": output_path.name,
        "chunks_processed": len(chunks),
    }


@app.post("/api/generate-preview")
async def generate_preview(request: GenerateRequest):
    """Generate preview (first chunk only) for quick testing"""
    service = get_tts_service(request.device)

    # Get voice reference path
    voice_path = None
    if request.voice_id:
        metadata_file = VOICES_DIR / "metadata.json"
        if metadata_file.exists():
            with open(metadata_file) as f:
                voices = json.load(f)
            voice = next((v for v in voices if v["id"] == request.voice_id), None)
            if voice:
                voice_path = str(VOICES_DIR / voice["filename"])

    # Only first chunk
    chunks = chunk_text(request.text, max_chars=250)
    first_chunk = chunks[0] if chunks else request.text[:250]

    # fast_mode disables CFG for ~50% faster generation
    effective_cfg = 0.0 if request.fast_mode else request.cfg_weight

    audio, sr = service.generate(
        text=first_chunk,
        model_type=request.model,
        language_id=request.language,
        audio_prompt_path=voice_path,
        temperature=request.temperature,
        exaggeration=request.exaggeration,
        cfg_weight=effective_cfg,
        seed=request.seed,
    )

    # Save preview
    preview_id = str(uuid.uuid4())[:8]
    preview_path = OUTPUT_DIR / f"preview_{preview_id}.wav"
    service.save_audio(audio, str(preview_path), sr)

    return {
        "success": True,
        "output_url": f"/output/{preview_path.name}",
        "filename": preview_path.name,
        "preview_text": first_chunk,
        "total_chunks": len(chunks),
    }


@app.post("/api/parse-document")
async def parse_doc(file: UploadFile = File(...)):
    """Parse a document (TXT, MD, PDF) into chapters"""
    # Save uploaded file temporarily
    temp_path = TEMP_DIR / file.filename
    content = await file.read()
    with open(temp_path, "wb") as f:
        f.write(content)

    try:
        chapters = parse_document(str(temp_path))
        stats = get_document_stats(chapters)

        return {
            "success": True,
            "chapters": [
                {
                    "number": c.number,
                    "title": c.title,
                    "content": c.content,
                    "preview": c.content[:200] + "..." if len(c.content) > 200 else c.content,
                }
                for c in chapters
            ],
            "stats": stats,
        }
    finally:
        temp_path.unlink()  # Clean up


@app.post("/api/generate-book")
async def generate_book(request: GenerateBookRequest, background_tasks: BackgroundTasks):
    """Start audiobook generation (runs in background)"""
    job_id = str(uuid.uuid4())[:8]

    # Initialize job status
    jobs[job_id] = {
        "status": "pending",
        "progress": 0,
        "total_chapters": len(request.chapters),
        "current_chapter": 0,
        "outputs": [],
        "error": None,
    }

    # Start background task
    background_tasks.add_task(
        generate_book_task,
        job_id,
        request,
    )

    return {
        "job_id": job_id,
        "message": "Audiobook generation started",
        "total_chapters": len(request.chapters),
    }


async def generate_book_task(job_id: str, request: GenerateBookRequest):
    """Background task for audiobook generation"""
    from tts_providers import get_provider
    from tts_providers.registry import list_providers

    provider_id = request.provider or "chatterbox"
    if provider_id not in list_providers():
        print(f"[Audiobook] Provider {provider_id} not available, falling back to chatterbox")
        provider_id = "chatterbox"

    try:
        provider = get_provider(provider_id, device=request.device)
    except Exception as exc:
        jobs[job_id]["status"] = "error"
        jobs[job_id]["error"] = f"Failed to initialize TTS provider: {exc}"
        return

    jobs[job_id]["status"] = "processing"

    async def check_job_control() -> bool:
        if job_id in book_cancelled_jobs:
            jobs[job_id]["status"] = "cancelled"
            jobs[job_id]["error"] = "Cancelled by user"
            return False
        while job_id in book_paused_jobs:
            jobs[job_id]["status"] = "paused"
            await asyncio.sleep(0.5)
            if job_id in book_cancelled_jobs:
                jobs[job_id]["status"] = "cancelled"
                jobs[job_id]["error"] = "Cancelled by user"
                return False
        if jobs[job_id].get("status") == "paused":
            jobs[job_id]["status"] = "processing"
        return True

    # Get voice reference path
    voice_path = None
    voice_text = None
    if request.voice_id:
        metadata_file = VOICES_DIR / "metadata.json"
        if metadata_file.exists():
            with open(metadata_file) as f:
                voices = json.load(f)
            voice = next((v for v in voices if v["id"] == request.voice_id), None)
            if voice:
                voice_path = str(VOICES_DIR / voice["filename"])
                voice_text = voice.get("transcription")

    # fast_mode disables CFG for ~50% faster generation
    effective_cfg = 0.0 if request.fast_mode else request.cfg_weight

    try:
        gen_kwargs = {
            "language": request.language,
            "speed": request.speed,
            "seed": request.seed,
        }

        if provider_id == "chatterbox":
            gen_kwargs.update({
                "model": request.model,
                "temperature": request.temperature,
                "exaggeration": request.exaggeration,
                "cfg_weight": effective_cfg,
                "top_p": request.top_p,
                "top_k": request.top_k,
            })
        elif provider_id == "f5-tts":
            gen_kwargs.update({
                "model": request.model if request.model != "multilingual" else None,
                "nfe_step": request.nfe_step,
            })
        elif provider_id == "orpheus":
            gen_kwargs.update({
                "model": request.model if request.model not in ["multilingual", "original", "turbo"] else None,
                "temperature": request.temperature,
                "top_p": request.top_p,
            })
        elif provider_id == "kokoro":
            gen_kwargs.update({
                "voice_id": request.preset_voice_id,
            })
        elif provider_id == "zonos":
            gen_kwargs.update({
                "model": request.model if request.model not in ["multilingual", "original"] else None,
            })
        elif provider_id == "vibevoice":
            gen_kwargs.update({
                "model": request.model if request.model not in ["multilingual", "original"] else None,
                "temperature": request.temperature,
            })
        elif provider_id == "voxcpm":
            gen_kwargs.update({
                "model": request.model if request.model not in ["multilingual", "original"] else None,
                "temperature": request.temperature,
                "top_p": request.top_p,
            })
        elif provider_id == "dia":
            gen_kwargs.update({
                "model": request.model if request.model not in ["multilingual", "original"] else None,
                "voice_id": request.preset_voice_id,
            })
        elif provider_id == "openvoice":
            gen_kwargs.update({
                "model": request.model if request.model not in ["multilingual", "original"] else None,
            })
        elif provider_id == "fish-speech":
            gen_kwargs.update({
                "model": request.model if request.model not in ["multilingual", "original"] else None,
                "temperature": request.temperature,
                "top_p": request.top_p,
            })
        # API Providers
        elif provider_id == "openai-tts":
            gen_kwargs.update({
                "model": request.model or "tts-1",
                "voice_id": request.preset_voice_id or "alloy",
            })
        elif provider_id == "elevenlabs":
            gen_kwargs.update({
                "model": request.model or "eleven_multilingual_v2",
                "voice_id": request.preset_voice_id,
            })
        elif provider_id == "fishaudio":
            gen_kwargs.update({
                "model": request.model or "default",
                "voice_id": request.preset_voice_id,
            })
        elif provider_id == "cartesia":
            gen_kwargs.update({
                "model": request.model or "sonic-2",
                "voice_id": request.preset_voice_id,
            })
        elif provider_id == "playht":
            gen_kwargs.update({
                "model": request.model or "PlayHT2.0-turbo",
                "voice_id": request.preset_voice_id,
            })
        elif provider_id == "siliconflow":
            gen_kwargs.update({
                "model": request.model or "CosyVoice-300M-SFT",
                "voice_id": request.preset_voice_id,
            })
        elif provider_id == "minimax":
            gen_kwargs.update({
                "model": request.model or "speech-01-turbo",
                "voice_id": request.preset_voice_id,
            })
        elif provider_id == "zyphra":
            gen_kwargs.update({
                "model": request.model or "zonos-v1",
                "voice_id": request.preset_voice_id,
            })
        elif provider_id == "narilabs":
            gen_kwargs.update({
                "model": request.model or "dia-1.6b",
                "voice_id": request.preset_voice_id,
            })

        if request.extra_params:
            gen_kwargs.update(request.extra_params)

        for i, chapter in enumerate(request.chapters):
            if not await check_job_control():
                return
            jobs[job_id]["current_chapter"] = i + 1

            # Chunk the chapter content
            chunks = chunk_text(chapter["content"], max_chars=250)

            # Generate audio for each chunk
            audio_segments = []
            sample_rate = 24000
            for j, chunk in enumerate(chunks):
                if not await check_job_control():
                    return
                audio, sr = provider.generate(
                    text=chunk,
                    voice_audio_path=voice_path,
                    voice_audio_text=voice_text,
                    **gen_kwargs,
                )
                audio_segments.append(audio)
                sample_rate = sr

                # Update progress
                chunk_progress = (j + 1) / len(chunks)
                chapter_progress = i / len(request.chapters)
                jobs[job_id]["progress"] = int((chapter_progress + chunk_progress / len(request.chapters)) * 100)

            # Concatenate chapter audio
            chapter_audio = concatenate_audio(audio_segments, sample_rate=sample_rate)

            # Apply speed change if needed
            providers_with_internal_speed = [
                "f5-tts", "kokoro", "openai-tts", "elevenlabs", "fishaudio",
                "cartesia", "playht", "siliconflow", "minimax", "zyphra", "narilabs"
            ]
            if request.speed != 1.0 and provider_id not in providers_with_internal_speed:
                chapter_audio = change_speed(chapter_audio, sample_rate, request.speed)

            # Save chapter
            chapter_filename = f"chapter_{chapter['number']:02d}_{job_id}.wav"
            chapter_path = OUTPUT_DIR / chapter_filename
            import torchaudio
            import torch as torch_module
            audio_tensor = torch_module.from_numpy(chapter_audio).unsqueeze(0)
            torchaudio.save(str(chapter_path), audio_tensor, sample_rate)

            # Convert format if needed
            if request.output_format != "wav":
                converted_path = convert_format(
                    str(chapter_path),
                    str(OUTPUT_DIR / f"chapter_{chapter['number']:02d}_{job_id}.{request.output_format}"),
                    request.output_format
                )
                chapter_path.unlink()
                chapter_filename = Path(converted_path).name

            jobs[job_id]["outputs"].append({
                "chapter": chapter["number"],
                "title": chapter["title"],
                "filename": chapter_filename,
                "url": f"/output/{chapter_filename}",
            })

        jobs[job_id]["status"] = "completed"
        jobs[job_id]["progress"] = 100

    except Exception as e:
        jobs[job_id]["status"] = "error"
        jobs[job_id]["error"] = str(e)


@app.get("/api/status/{job_id}")
async def get_job_status(job_id: str):
    """Get status of a background job"""
    if job_id not in jobs:
        raise HTTPException(404, "Job not found")

    return jobs[job_id]


@app.post("/api/generate-book/{job_id}/cancel")
async def cancel_book_job(job_id: str):
    if job_id not in jobs:
        raise HTTPException(404, "Job not found")
    book_cancelled_jobs.add(job_id)
    jobs[job_id]["status"] = "cancelled"
    jobs[job_id]["error"] = "Cancelled by user"
    return {"job_id": job_id, "status": "cancelled"}


@app.post("/api/generate-book/{job_id}/pause")
async def pause_book_job(job_id: str):
    if job_id not in jobs:
        raise HTTPException(404, "Job not found")
    if job_id in book_cancelled_jobs:
        raise HTTPException(400, "Job already cancelled")
    book_paused_jobs.add(job_id)
    jobs[job_id]["status"] = "paused"
    return {"job_id": job_id, "status": "paused"}


@app.post("/api/generate-book/{job_id}/resume")
async def resume_book_job(job_id: str):
    if job_id not in jobs:
        raise HTTPException(404, "Job not found")
    if job_id in book_cancelled_jobs:
        raise HTTPException(400, "Job already cancelled")
    book_paused_jobs.discard(job_id)
    if jobs[job_id].get("status") == "paused":
        jobs[job_id]["status"] = "processing"
    return {"job_id": job_id, "status": jobs[job_id]["status"]}


@app.get("/api/estimate")
async def estimate(text: str, model: str = "multilingual"):
    """Estimate generation time for given text"""
    chunks = chunk_text(text)
    estimated_seconds = estimate_generation_time(text, model)

    return {
        "num_chunks": len(chunks),
        "estimated_seconds": estimated_seconds,
        "estimated_minutes": estimated_seconds / 60,
    }


# =====================================================
# STT + SMART FORMATTING ENDPOINTS
# =====================================================

@app.post("/api/stt/start")
async def stt_start(request: STTStartRequest):
    session_id = str(uuid.uuid4())[:8]
    stt_sessions[session_id] = {
        "language": request.language,
        "prompt": request.prompt,
        "status": "recording",
        "partial_text": "",
    }
    return {"session_id": session_id, "status": "recording"}


@app.post("/api/stt/stop")
async def stt_stop(
    session_id: str = Form(...),
    audio: UploadFile = File(...),
    language: str = Form("auto"),
    prompt: Optional[str] = Form(None),
):
    if session_id not in stt_sessions:
        raise HTTPException(404, "STT session not found")

    content = await audio.read()
    suffix = Path(audio.filename).suffix if audio.filename else ".wav"
    temp_path = TEMP_DIR / f"stt_{session_id}_{uuid.uuid4().hex}{suffix}"
    with open(temp_path, "wb") as f:
        f.write(content)

    stt_service = get_stt_service()
    audio_duration = None
    try:
        raw_text, meta = stt_service.transcribe(temp_path, language=language, prompt=prompt)
        # Get audio duration for history
        try:
            import librosa
            audio_duration = librosa.get_duration(filename=str(temp_path))
        except Exception:
            pass
    except Exception as exc:
        detail = f"STT transcription failed: {exc}"
        raise HTTPException(400, detail) from exc

    stt_cfg = settings_service.settings.stt
    formatter = SmartFormatter(
        enable_punctuation=stt_cfg.auto_punctuation or stt_cfg.smart_formatting,
        enable_backtrack=stt_cfg.backtrack,
        enable_fillers=stt_cfg.filler_removal,
    )
    formatted_text = formatter.format_text(raw_text, list_dictionary_entries(), list_snippet_entries())

    stt_sessions.pop(session_id, None)

    history_entry = {
        "id": session_id,
        "text": formatted_text[:500],
        "text_full": formatted_text,
        "raw_text": raw_text,
        "language": language,
        "provider": meta.get("provider") if isinstance(meta, dict) else None,
        "meta": meta,
        "created_at": datetime.datetime.now().isoformat(),
    }
    save_history_entry("stt", history_entry)

    # Save to new history system (SQLite with file storage)
    try:
        from history_service import get_history_service
        history_svc = get_history_service()
        history_svc.save_stt_entry(
            audio_path=str(temp_path),
            transcription=formatted_text,
            provider=meta.get("provider") if isinstance(meta, dict) else "unknown",
            model=meta.get("model") if isinstance(meta, dict) else None,
            language=language,
            language_detected=meta.get("language") if isinstance(meta, dict) else None,
            duration_seconds=audio_duration,
        )
    except Exception as e:
        print(f"[History] Failed to save STT entry: {e}")
    finally:
        # Clean up temp file after saving to history
        if temp_path.exists():
            temp_path.unlink()

    return {
        "session_id": session_id,
        "text": formatted_text,
        "raw_text": raw_text,
        "meta": meta,
    }


@app.post("/api/stt/partial")
async def stt_partial(
    session_id: str = Form(...),
    audio: UploadFile = File(...),
    language: str = Form("auto"),
    prompt: Optional[str] = Form(None),
):
    if session_id not in stt_sessions:
        raise HTTPException(404, "STT session not found")

    content = await audio.read()
    suffix = Path(audio.filename).suffix if audio.filename else ".webm"
    temp_path = TEMP_DIR / f"stt_partial_{session_id}_{uuid.uuid4().hex}{suffix}"
    with open(temp_path, "wb") as f:
        f.write(content)

    stt_service = get_stt_service()
    try:
        raw_text, meta = stt_service.transcribe(temp_path, language=language, prompt=prompt)
    except Exception as exc:
        message = str(exc)
        if "Invalid data" in message or "Error opening" in message:
            return {
                "session_id": session_id,
                "text": "",
                "partial_text": stt_sessions[session_id].get("partial_text", ""),
                "meta": {"error": message},
            }
        detail = f"STT partial failed: {exc}"
        raise HTTPException(400, detail) from exc
    finally:
        if temp_path.exists():
            temp_path.unlink()

    if raw_text:
        existing = stt_sessions[session_id].get("partial_text", "")
        combined = f"{existing} {raw_text}".strip() if existing else raw_text.strip()
        stt_sessions[session_id]["partial_text"] = combined
    else:
        combined = stt_sessions[session_id].get("partial_text", "")
    if isinstance(meta, dict):
        stt_sessions[session_id]["meta"] = meta

    return {
        "session_id": session_id,
        "text": raw_text.strip(),
        "partial_text": combined,
        "meta": meta,
    }


@app.post("/api/stt/finalize")
async def stt_finalize(session_id: str = Form(...)):
    if session_id not in stt_sessions:
        raise HTTPException(404, "STT session not found")

    session = stt_sessions[session_id]
    raw_text = (session.get("partial_text") or "").strip()
    meta = session.get("meta") if isinstance(session.get("meta"), dict) else {}
    language = session.get("language", "auto")

    stt_cfg = settings_service.settings.stt
    formatter = SmartFormatter(
        enable_punctuation=stt_cfg.auto_punctuation or stt_cfg.smart_formatting,
        enable_backtrack=stt_cfg.backtrack,
        enable_fillers=stt_cfg.filler_removal,
    )
    formatted_text = formatter.format_text(raw_text, list_dictionary_entries(), list_snippet_entries()) if raw_text else ""

    stt_sessions.pop(session_id, None)

    history_entry = {
        "id": session_id,
        "text": formatted_text[:500],
        "text_full": formatted_text,
        "raw_text": raw_text,
        "language": language,
        "provider": meta.get("provider") if isinstance(meta, dict) else None,
        "meta": meta,
        "created_at": datetime.datetime.now().isoformat(),
    }
    save_history_entry("stt", history_entry)

    # Save to new history system (no audio for finalize - audio was processed in partials)
    try:
        from history_service import get_history_service
        history_svc = get_history_service()
        history_svc.save_stt_entry(
            audio_path="",  # No audio file for finalize (processed in partials)
            transcription=formatted_text,
            provider=meta.get("provider") if isinstance(meta, dict) else "unknown",
            model=meta.get("model") if isinstance(meta, dict) else None,
            language=language,
            language_detected=meta.get("language") if isinstance(meta, dict) else None,
            duration_seconds=meta.get("duration") if isinstance(meta, dict) else None,
        )
    except Exception as e:
        print(f"[History] Failed to save STT finalize entry: {e}")

    return {
        "session_id": session_id,
        "text": formatted_text,
        "raw_text": raw_text,
        "meta": meta,
    }


@app.post("/api/stt/cancel")
async def stt_cancel(session_id: str = Form(...)):
    stt_sessions.pop(session_id, None)
    return {"session_id": session_id, "status": "cancelled"}


@app.get("/api/stt/status")
async def stt_status():
    return {"active_sessions": list(stt_sessions.keys())}


# =====================================================
# DICTIONARY + SNIPPETS ENDPOINTS
# =====================================================

@app.get("/api/dictionary/list")
async def dictionary_list():
    return {"entries": list_dictionary_entries()}


@app.post("/api/dictionary/add")
async def dictionary_add(entry: DictionaryCreate):
    created = add_dictionary_entry(entry.source, entry.target, entry.enabled)
    return created


@app.delete("/api/dictionary/{entry_id}")
async def dictionary_delete(entry_id: str):
    if not delete_dictionary_entry(entry_id):
        raise HTTPException(404, "Entry not found")
    return {"deleted": True}


@app.get("/api/snippets/list")
async def snippets_list():
    return {"entries": list_snippet_entries()}


@app.post("/api/snippets/add")
async def snippets_add(entry: SnippetCreate):
    created = add_snippet_entry(entry.trigger, entry.expansion, entry.enabled)
    return created


@app.delete("/api/snippets/{entry_id}")
async def snippets_delete(entry_id: str):
    if not delete_snippet_entry(entry_id):
        raise HTTPException(404, "Entry not found")
    return {"deleted": True}


# =====================================================
# READER ENDPOINTS
# =====================================================

@app.post("/api/reader/speak")
async def reader_speak(request: ReaderRequest):
    reader = get_reader_service()
    output_id = str(uuid.uuid4())[:8]
    output_path = OUTPUT_DIR / f"reader_{output_id}.wav"
    try:
        reader.synthesize_to_file(
            text=request.text,
            output_path=output_path,
            language=request.language,
            voice=request.voice,
            speed=request.speed,
            fast_mode=request.fast_mode,
            device=request.device,
        )
    except Exception as exc:
        detail = str(exc) or "Reader synthesis failed"
        raise HTTPException(400, detail) from exc
    history_entry = {
        "id": output_id,
        "text": request.text[:500],
        "text_full": request.text,
        "language": request.language,
        "voice": request.voice,
        "speed": request.speed,
        "filename": output_path.name,
        "output_url": f"/output/{output_path.name}",
        "created_at": datetime.datetime.now().isoformat(),
    }
    save_history_entry("reader", history_entry)

    # Save to new history system (SQLite)
    try:
        from history_service import get_history_service
        import librosa
        duration = librosa.get_duration(filename=str(output_path))
        history_svc = get_history_service()
        history_svc.save_reader_entry(
            text=request.text,
            audio_path=str(output_path),
            provider="kokoro",
            voice_id=request.voice,
            voice_name=request.voice,
            duration_seconds=duration,
        )
    except Exception as e:
        print(f"[History] Failed to save Reader entry: {e}")

    return {
        "output_url": f"/output/{output_path.name}",
        "filename": output_path.name,
    }


# =====================================================
# AI EDIT ENDPOINTS
# =====================================================

@app.post("/api/ai-edit")
async def ai_edit(request: AIEditRequest):
    service = get_ai_edit_service()
    try:
        edited_text, meta = service.edit(request.text, request.command, provider=request.provider)
    except Exception as exc:
        detail = str(exc) or "AI edit failed"
        raise HTTPException(400, detail) from exc
    history_entry = {
        "id": str(uuid.uuid4())[:8],
        "text": edited_text[:500],
        "text_full": edited_text,
        "source_text": request.text,
        "command": request.command,
        "provider": meta.get("provider") if isinstance(meta, dict) else None,
        "meta": meta,
        "created_at": datetime.datetime.now().isoformat(),
    }
    save_history_entry("ai_edit", history_entry)

    # Save to new history system (SQLite)
    try:
        from history_service import get_history_service
        history_svc = get_history_service()
        provider_id = meta.get("provider") if isinstance(meta, dict) else request.provider or "unknown"
        model_id = meta.get("model") if isinstance(meta, dict) else None
        history_svc.save_ai_edit_entry(
            original_text=request.text,
            edited_text=edited_text,
            instruction=request.command,
            provider=provider_id,
            model=model_id,
        )
    except Exception as e:
        print(f"[History] Failed to save AI Edit entry: {e}")

    return {"text": edited_text, "meta": meta}


# =====================================================
# TRANSLATION ENDPOINTS
# =====================================================

@app.post("/api/translate")
async def translate_text(request: TranslateRequest):
    service = get_translation_service()
    try:
        translated, meta = service.translate(
            request.text,
            source_lang=request.source_lang,
            target_lang=request.target_lang,
            provider=request.provider
        )
    except Exception as exc:
        detail = str(exc) or "Translation failed"
        raise HTTPException(400, detail) from exc
    history_entry = {
        "id": str(uuid.uuid4())[:8],
        "text": translated[:500],
        "text_full": translated,
        "source_text": request.text,
        "source_lang": request.source_lang,
        "target_lang": request.target_lang,
        "provider": meta.get("provider") if isinstance(meta, dict) else None,
        "meta": meta,
        "created_at": datetime.datetime.now().isoformat(),
    }
    save_history_entry("translation", history_entry)

    # Save to new history system (SQLite)
    try:
        from history_service import get_history_service
        history_svc = get_history_service()
        provider_id = meta.get("provider") if isinstance(meta, dict) else request.provider or "argos"
        model_id = meta.get("model") if isinstance(meta, dict) else None
        history_svc.save_translate_entry(
            original_text=request.text,
            translated_text=translated,
            source_language=request.source_lang or "auto",
            target_language=request.target_lang or "en",
            provider=provider_id,
            model=model_id,
        )
    except Exception as e:
        print(f"[History] Failed to save Translate entry: {e}")

    return {"text": translated, "meta": meta}


# =====================================================
# TRANSCRIPTION ENDPOINTS (Long-form with Diarization)
# =====================================================

class TranscriptSegment(BaseModel):
    id: str
    speaker: str = "Speaker 1"
    speaker_id: int = 0
    start_time: float
    end_time: float
    text: str
    confidence: float = 1.0


class TranscriptUpdateRequest(BaseModel):
    segments: list[dict]


class TranscriptExportRequest(BaseModel):
    format: str  # txt, srt, vtt
    include_speakers: bool = True
    include_timestamps: bool = True


class TranscriptionPathRequest(BaseModel):
    path: str
    filename: Optional[str] = None
    job_id: Optional[str] = None  # Client can provide job_id (for Electron)
    language: str = "auto"
    enable_diarization: bool = True
    diarization_mode: str = "auto"  # auto | pyannote | basic
    min_speakers: int = 1
    max_speakers: int = 10
    whisper_model: str = "base"
    enable_ai_cleanup: bool = False
    engine: str = "fast"  # "fast" (faster-whisper) or "accurate" (whisperx)


class TranscriptionLinkRequest(BaseModel):
    url: str
    filename: Optional[str] = None
    job_id: Optional[str] = None  # Client can provide job_id (for Electron)
    language: str = "auto"
    enable_diarization: bool = True
    diarization_mode: str = "auto"  # auto | pyannote | basic
    min_speakers: int = 1
    max_speakers: int = 10
    whisper_model: str = "base"
    enable_ai_cleanup: bool = False
    engine: str = "fast"  # "fast" (faster-whisper) or "accurate" (whisperx)


def _save_transcription_job(job_id: str, job_data: dict):
    """Save transcription job to disk for persistence."""
    job_path = TRANSCRIPTIONS_DIR / f"{job_id}.json"
    with open(job_path, "w", encoding="utf-8") as f:
        json.dump(job_data, f, ensure_ascii=False, indent=2)


def _load_transcription_job(job_id: str) -> Optional[dict]:
    """Load transcription job from disk."""
    job_path = TRANSCRIPTIONS_DIR / f"{job_id}.json"
    if job_path.exists():
        with open(job_path, "r", encoding="utf-8") as f:
            return json.load(f)
    return None


def _parse_iso_timestamp(value: Optional[str]) -> Optional[datetime.datetime]:
    if not value:
        return None
    try:
        return datetime.datetime.fromisoformat(value)
    except Exception:
        return None


def _start_job_timer(job_id: str) -> None:
    job = transcription_jobs.get(job_id)
    if not job:
        return
    now_iso = datetime.datetime.now().isoformat()
    if not job.get("started_at"):
        job["started_at"] = now_iso
    if job.get("elapsed_seconds") is None:
        job["elapsed_seconds"] = 0.0
    job["active_started_at"] = now_iso


def _tick_job_elapsed(job_id: str) -> None:
    job = transcription_jobs.get(job_id)
    if not job:
        return
    active = job.get("active_started_at")
    started = _parse_iso_timestamp(active)
    if not started:
        return
    now = datetime.datetime.now()
    delta = (now - started).total_seconds()
    if delta < 0:
        return
    elapsed = float(job.get("elapsed_seconds") or 0.0)
    job["elapsed_seconds"] = round(elapsed + delta, 1)
    job["active_started_at"] = now.isoformat()


def _stop_job_timer(job_id: str) -> None:
    job = transcription_jobs.get(job_id)
    if not job:
        return
    _tick_job_elapsed(job_id)
    job["active_started_at"] = None


def _stage_transcription_upload(source_path: Path, job_id: str) -> Path:
    suffix = source_path.suffix or ""
    dest_path = TEMP_DIR / f"upload_{job_id}{suffix}"
    if dest_path.exists():
        dest_path.unlink()
    try:
        os.link(source_path, dest_path)
        return dest_path
    except Exception:
        try:
            shutil.copy2(source_path, dest_path)
        except Exception:
            if dest_path.exists():
                dest_path.unlink()
            raise
        return dest_path


async def transcription_task(
    job_id: str,
    file_path: Path,
    language: str,
    enable_diarization: bool,
    diarization_mode: str,
    min_speakers: int,
    max_speakers: int,
    whisper_model: str,
    enable_ai_cleanup: bool = False,
    engine: str = "fast"
):
    """Background task for transcription processing."""
    import datetime

    class CancelledException(Exception):
        """Raised when job is cancelled by user."""
        pass

    def check_cancelled():
        """Check if job was cancelled, raise exception if so."""
        if job_id in cancelled_jobs:
            raise CancelledException("Cancelled by user")

    def _count_speakers(seg_list: list) -> int:
        speaker_ids = {
            seg.get("speaker_id")
            for seg in seg_list
            if isinstance(seg.get("speaker_id"), int)
        }
        speaker_labels = {seg.get("speaker") for seg in seg_list if seg.get("speaker")}
        return max(len(speaker_ids), len(speaker_labels), 0)

    def update_progress(pct: float, msg: str, segments: list = None):
        """Update progress, check cancellation, optionally save segments for live preview."""
        check_cancelled()
        _tick_job_elapsed(job_id)
        # Use float with 1 decimal for granular progress (like Windows file copy)
        transcription_jobs[job_id]["progress"] = round(pct, 1)
        transcription_jobs[job_id]["current_step"] = msg
        if segments is not None:
            transcription_jobs[job_id]["segments"] = segments
            speaker_count = _count_speakers(segments)
            if speaker_count:
                transcription_jobs[job_id]["speakers_detected"] = speaker_count
        _save_transcription_job(job_id, transcription_jobs[job_id])

    try:
        _start_job_timer(job_id)
        # Extract audio if video
        update_progress(2, "Checking file format...")

        audio_path = file_path
        suffix = file_path.suffix.lower()

        if suffix in [".mp4", ".mkv", ".avi", ".mov", ".webm", ".flv", ".wmv"]:
            update_progress(2, "Analyzing video file...")
            audio_path = TEMP_DIR / f"transcribe_{job_id}.wav"

            # Verify file exists and has content
            if not file_path.exists():
                raise RuntimeError(f"Video file not found: {file_path}")
            actual_size = file_path.stat().st_size
            if actual_size == 0:
                raise RuntimeError("Video file is empty (0 bytes)")

            ffmpeg_path = get_ffmpeg_path()
            file_size_mb = actual_size / (1024 * 1024)
            print(f"[Transcription] Extracting audio from {file_path.name}")
            print(f"[Transcription] File size: {file_size_mb:.1f} MB")
            print(f"[Transcription] File path: {file_path}")
            print(f"[Transcription] Using ffmpeg: {ffmpeg_path}")

            # First get video duration using ffprobe
            video_duration = None
            try:
                probe_result = subprocess.run([
                    ffmpeg_path, "-i", str(file_path)
                ], capture_output=True, timeout=60)
                # FFmpeg outputs duration in stderr
                stderr_text = probe_result.stderr.decode(errors='ignore')
                import re
                duration_match = re.search(r'Duration:\s*(\d+):(\d+):(\d+)\.(\d+)', stderr_text)
                if duration_match:
                    hours, mins, secs, frac = duration_match.groups()
                    video_duration = int(hours) * 3600 + int(mins) * 60 + int(secs) + float(f"0.{frac}")
                    print(f"[Transcription] Video duration: {video_duration:.1f} seconds")
            except Exception as e:
                print(f"[Transcription] Could not get video duration: {e}")

            import time
            import threading

            update_progress(3, f"Extracting audio ({file_size_mb:.0f} MB video)...")
            print(f"[Transcription] Starting FFmpeg extraction...")

            extraction_start_time = time.time()
            extraction_complete = threading.Event()

            # Progress updater thread - estimates progress based on time
            def update_extraction_progress():
                # Estimate: ~1 second of extraction per 10 seconds of video for fast machines
                # For slower machines, just show elapsed time
                estimated_duration = max(video_duration / 100, 30) if video_duration else 60
                while not extraction_complete.wait(timeout=2.0):
                    elapsed = time.time() - extraction_start_time
                    mins, secs = divmod(int(elapsed), 60)
                    time_str = f"{mins}:{secs:02d}" if mins > 0 else f"{secs}s"
                    # Progress 3-9% range
                    pct = min(3 + (elapsed / estimated_duration) * 6, 9)
                    update_progress(int(pct), f"Extracting audio... ({time_str} elapsed)")

            progress_thread = threading.Thread(target=update_extraction_progress, daemon=True)
            progress_thread.start()

            try:
                # Use subprocess.run - simpler and more reliable on Windows
                # stderr to DEVNULL to avoid buffer deadlock
                proc = subprocess.run([
                    ffmpeg_path, "-y",
                    "-i", str(file_path),
                    "-ar", "16000",
                    "-ac", "1",
                    "-acodec", "pcm_s16le",
                    str(audio_path)
                ], capture_output=True, timeout=3600)  # 1 hour timeout

                if proc.returncode != 0:
                    stderr_msg = proc.stderr.decode(errors='ignore') if proc.stderr else "Unknown error"
                    print(f"[Transcription] FFmpeg stderr:\n{stderr_msg}")
                    error_lines = [line for line in stderr_msg.split('\n') if line.strip() and not line.startswith('  lib')]
                    actual_error = '\n'.join(error_lines[-5:]) if error_lines else stderr_msg[-500:]
                    raise RuntimeError(f"Failed to extract audio: {actual_error}")

            finally:
                extraction_complete.set()
                progress_thread.join(timeout=1)

            elapsed = time.time() - extraction_start_time
            print(f"[Transcription] Audio extraction completed in {elapsed:.1f} seconds")

        # Get audio duration
        import wave
        try:
            with wave.open(str(audio_path), "rb") as wf:
                duration = wf.getnframes() / wf.getframerate()
        except Exception:
            # Fallback: use librosa
            import librosa
            y, sr = librosa.load(str(audio_path), sr=None, duration=10)
            duration = librosa.get_duration(path=str(audio_path))

        transcription_jobs[job_id]["total_duration"] = duration
        cache_info = ensure_audio_cached(
            audio_path,
            source_path=file_path,
            filename=transcription_jobs[job_id].get("filename"),
            duration=duration,
        )
        if cache_info:
            transcription_jobs[job_id]["audio_cache"] = {
                "hash": cache_info.get("hash"),
                "path": cache_info.get("path"),
                "size_bytes": cache_info.get("size_bytes"),
            }

        # Transcribe
        transcription_jobs[job_id]["status"] = "transcribing"
        update_progress(10, "Starting transcription...")
        normalized_mode = (diarization_mode or "auto").strip().lower()
        if normalized_mode not in ("auto", "pyannote", "basic"):
            normalized_mode = "auto"
        if engine == "accurate" and normalized_mode == "basic":
            normalized_mode = "auto"
        transcription_jobs[job_id]["diarization_mode"] = normalized_mode
        print(f"[Transcription] Job {job_id}: Engine={engine}, getting service...")
        import sys
        sys.stdout.flush()

        # Run blocking transcription in thread pool to avoid blocking event loop
        import asyncio
        import functools
        loop = asyncio.get_event_loop()

        def segment_callback(segment: dict, all_segments: list) -> bool:
            """Called for each segment - updates live preview and checks cancellation."""
            # Check if cancelled
            if job_id in cancelled_jobs:
                return False  # Stop transcription
            # Update segments for live preview (every 5 segments to reduce overhead)
            if len(all_segments) % 5 == 0 or len(all_segments) <= 3:
                transcription_jobs[job_id]["segments"] = all_segments
                _save_transcription_job(job_id, transcription_jobs[job_id])
            return True  # Continue

        if engine == "accurate":
            # Use WhisperX for integrated transcription + alignment + diarization
            from whisperx_service import get_whisperx_service
            whisperx_service = get_whisperx_service()
            print(f"[Transcription] Job {job_id}: Using WhisperX (accurate mode)...")
            sys.stdout.flush()

            segments, metadata = await loop.run_in_executor(
                None,
                functools.partial(
                    whisperx_service.transcribe,
                    audio_path,
                    language=language,
                    model_size=whisper_model,
                    enable_diarization=enable_diarization,
                    min_speakers=min_speakers,
                    max_speakers=max_speakers,
                    progress_callback=update_progress,
                    segment_callback=segment_callback,
                    check_cancelled=check_cancelled
                )
            )

            # WhisperX does diarization internally, track outcome
            transcription_jobs[job_id]["speakers_detected"] = metadata.get("speakers_detected", 1)
            diarization_performed = metadata.get("diarization_performed", False)
            transcription_jobs[job_id]["diarization_method"] = "pyannote" if diarization_performed else "none"
            diarization_error = metadata.get("diarization_error")
            if diarization_error:
                transcription_jobs[job_id]["diarization_error"] = diarization_error
            else:
                transcription_jobs[job_id]["diarization_error"] = None

        else:
            # Use faster-whisper (fast mode) - separate transcription + diarization
            transcription_service = get_transcription_service()
            print(f"[Transcription] Job {job_id}: Using faster-whisper (fast mode)...")
            sys.stdout.flush()

            segments, metadata = await loop.run_in_executor(
                None,
                functools.partial(
                    transcription_service.transcribe,
                    audio_path,
                    language=language,
                    model_size=whisper_model,
                    progress_callback=update_progress,
                    segment_callback=segment_callback
                )
            )

            # Check if cancelled during transcription
            if job_id in cancelled_jobs:
                raise CancelledException("Cancelled by user")

            transcription_jobs[job_id]["segments"] = segments

            # Diarization (also run in thread pool to avoid blocking)
            if enable_diarization and len(segments) > 1:
                # Update status to diarizing so frontend shows correct state
                transcription_jobs[job_id]["status"] = "diarizing"
                if normalized_mode == "pyannote":
                    update_progress(82, "Identifying speakers (AI)...")
                elif normalized_mode == "basic":
                    update_progress(82, "Identifying speakers (basic)...")
                else:
                    update_progress(82, "Identifying speakers (auto)...")
                diarization_service = get_diarization_service()
                prefer_pyannote = normalized_mode != "basic"
                force_pyannote = normalized_mode == "pyannote"
                attempted_method = "clustering"
                if prefer_pyannote and diarization_service.is_pyannote_available():
                    attempted_method = "pyannote"

                def diarization_progress(pct, msg):
                    save_segments = "Assigning speakers" in msg
                    update_progress(pct, msg, segments if save_segments else None)

                try:
                    diarization_result = await loop.run_in_executor(
                        None,
                        functools.partial(
                            diarization_service.diarize_segments,
                            audio_path,
                            segments,
                            min_speakers=min_speakers,
                            max_speakers=max_speakers,
                            progress_callback=diarization_progress,
                            force_pyannote=force_pyannote,
                            prefer_pyannote=prefer_pyannote,
                            cache_info=transcription_jobs[job_id].get("audio_cache"),
                        )
                    )

                    # Extract from DiarizationResult
                    segments = diarization_result["segments"]
                    transcription_jobs[job_id]["speakers_detected"] = diarization_result["num_speakers"]
                    transcription_jobs[job_id]["diarization_method"] = diarization_result["method"]
                    transcription_jobs[job_id]["diarization_error"] = None
                except Exception as diarization_exc:
                    reason = str(diarization_exc)
                    if isinstance(diarization_exc, ThermalGuardTriggered):
                        reason = f"Thermal guard paused diarization: {reason}"
                        transcription_jobs[job_id]["thermal_guard"] = {
                            "paused": True,
                            "reason": str(diarization_exc),
                            "snapshot": getattr(diarization_exc, "snapshot", None),
                        }
                        for seg in segments:
                            if not seg.get("speaker"):
                                seg["speaker"] = "Speaker 1"
                            if seg.get("speaker_id") is None:
                                seg["speaker_id"] = 0
                        transcription_jobs[job_id]["segments"] = segments
                        speaker_count = _count_speakers(segments)
                        transcription_jobs[job_id]["speakers_detected"] = speaker_count or 1
                        transcription_jobs[job_id]["diarization_method"] = attempted_method
                        transcription_jobs[job_id]["diarization_error"] = reason
                        print(f"[Transcription] Job {job_id}: Diarization paused: {reason}")
                        update_progress(95, f"Diarization paused: {reason}", segments)
                    else:
                        print(f"[Transcription] Job {job_id}: Diarization failed: {reason}")
                        transcription_jobs[job_id]["diarization_error"] = reason
                        transcription_jobs[job_id]["diarization_method"] = "none"
                        for seg in segments:
                            seg["speaker"] = "Speaker 1"
                            seg["speaker_id"] = 0
                        transcription_jobs[job_id]["speakers_detected"] = 1
                        update_progress(95, f"Diarization failed: {reason}")
            else:
                # No diarization - assign all to Speaker 1
                for seg in segments:
                    seg["speaker"] = "Speaker 1"
                    seg["speaker_id"] = 0
                transcription_jobs[job_id]["speakers_detected"] = 1
                transcription_jobs[job_id]["diarization_method"] = "none"

        # Check if cancelled
        if job_id in cancelled_jobs:
            raise CancelledException("Cancelled by user")

        transcription_jobs[job_id]["segments"] = segments

        # AI Cleanup - improve grammar and punctuation
        if enable_ai_cleanup and segments:
            transcription_jobs[job_id]["status"] = "cleaning"
            update_progress(96, "Cleaning up with AI...")

            try:
                ai_service = get_ai_edit_service()

                # Combine all segments into one text for better context
                full_text = "\n\n".join(seg["text"] for seg in segments)

                # Use AI to clean up the text
                cleanup_command = (
                    "Fix punctuation, grammar, and paragraph structure. "
                    "Make the text read naturally while preserving the exact meaning. "
                    "Keep the same language. Do not add or remove content."
                )

                cleaned_text, _ = ai_service.edit(full_text, cleanup_command)

                # Split cleaned text back into segments (by double newline)
                cleaned_parts = [p.strip() for p in cleaned_text.split("\n\n") if p.strip()]

                # Update segment texts if counts match
                if len(cleaned_parts) == len(segments):
                    for i, seg in enumerate(segments):
                        seg["text"] = cleaned_parts[i]
                else:
                    # Fallback: just use the cleaned text for all segments proportionally
                    # Or keep original if mismatch is too big
                    pass

                transcription_jobs[job_id]["segments"] = segments

            except Exception as cleanup_err:
                # If cleanup fails, keep original text and continue
                print(f"AI cleanup failed: {cleanup_err}")

        transcription_jobs[job_id]["status"] = "completed"
        transcription_jobs[job_id]["progress"] = 100
        transcription_jobs[job_id]["current_step"] = "Complete"
        transcription_jobs[job_id]["completed_at"] = datetime.datetime.now().isoformat()
        transcription_jobs[job_id]["processed_duration"] = duration

        update_progress(100, "Transcription complete")

    except CancelledException:
        # Don't overwrite status if already set to "paused" by pause endpoint
        current_status = transcription_jobs[job_id].get("status", "")
        if current_status != "paused":
            print(f"[Transcription] Job {job_id}: Cancelled by user")
            transcription_jobs[job_id]["status"] = "cancelled"
            transcription_jobs[job_id]["current_step"] = "Cancelled by user"
            _save_transcription_job(job_id, transcription_jobs[job_id])
        else:
            print(f"[Transcription] Job {job_id}: Paused by user")

    except Exception as exc:
        import traceback
        print(f"[Transcription] Job {job_id}: EXCEPTION: {exc}")
        traceback.print_exc()
        sys.stdout.flush()
        sys.stderr.flush()
        transcription_jobs[job_id]["status"] = "error"
        transcription_jobs[job_id]["error"] = str(exc)
        _save_transcription_job(job_id, transcription_jobs[job_id])

    finally:
        if job_id in transcription_jobs:
            _stop_job_timer(job_id)
            _save_transcription_job(job_id, transcription_jobs[job_id])
        # Clean up cancellation tracking
        cancelled_jobs.discard(job_id)
        # Clean up temp audio if extracted from video
        if audio_path != file_path and audio_path.exists():
            try:
                audio_path.unlink()
            except Exception:
                pass


async def import_link_task(
    job_id: str,
    payload: TranscriptionLinkRequest,
):
    def _update_download_progress(pct: float, msg: str) -> None:
        job = transcription_jobs.get(job_id)
        if not job:
            return
        _tick_job_elapsed(job_id)
        job["status"] = "downloading"
        scaled = max(0.0, min(2.0, (pct / 100.0) * 2.0))
        job["progress"] = round(scaled, 1)
        job["current_step"] = msg
        _save_transcription_job(job_id, job)

    def _is_cancelled() -> bool:
        job = transcription_jobs.get(job_id, {})
        return job_id in cancelled_jobs or job.get("status") == "cancelled"

    try:
        _start_job_timer(job_id)
        _update_download_progress(0.0, "Preparing download...")
        download_info = download_media_from_url(
            payload.url,
            TEMP_DIR,
            job_id,
            progress_callback=_update_download_progress,
            should_cancel=_is_cancelled,
        )

        if _is_cancelled():
            return

        file_path = Path(download_info["path"])
        if not file_path.exists():
            raise RuntimeError("Downloaded media file not found")

        title = sanitize_filename(download_info.get("title"))
        if title == "imported_media":
            title = None
        ext = download_info.get("ext")
        filename = payload.filename or title or file_path.name
        if ext and filename and not filename.lower().endswith(f".{ext}"):
            filename = f"{filename}.{ext}"

        job = transcription_jobs.get(job_id)
        if not job:
            return
        job.update(
            {
                "status": "pending",
                "progress": 2,
                "current_step": "Download complete",
                "filename": filename,
                "file_size_bytes": file_path.stat().st_size,
                "file_path": str(file_path),
                "source_url": download_info.get("source_url") or payload.url,
            }
        )
        _save_transcription_job(job_id, job)

        await transcription_task(
            job_id,
            file_path,
            payload.language,
            payload.enable_diarization,
            payload.diarization_mode,
            payload.min_speakers,
            payload.max_speakers,
            payload.whisper_model,
            payload.enable_ai_cleanup,
            payload.engine,
        )
    except DownloadCancelled:
        job = transcription_jobs.get(job_id)
        if job and job.get("status") != "cancelled":
            job["status"] = "cancelled"
            job["current_step"] = "Cancelled by user"
            _save_transcription_job(job_id, job)
    except Exception as exc:
        job = transcription_jobs.get(job_id)
        if not job:
            return
        job["status"] = "error"
        job["error"] = str(exc)
        job["current_step"] = "Failed to import media"
        _save_transcription_job(job_id, job)

    finally:
        if job_id in transcription_jobs:
            _stop_job_timer(job_id)
            _save_transcription_job(job_id, transcription_jobs[job_id])


async def resume_transcription_task(
    job_id: str,
    file_path: Path,
    resume_from_time: float,
    language: str,
    enable_diarization: bool,
    diarization_mode: str,
    min_speakers: int,
    max_speakers: int,
    whisper_model: str,
    existing_segments: list,
    engine: str = "fast"
):
    """Resume transcription from a specific timestamp."""

    class CancelledException(Exception):
        pass

    def check_cancelled():
        if job_id in cancelled_jobs:
            raise CancelledException("Cancelled by user")

    def update_progress(pct: float, msg: str):
        check_cancelled()
        _tick_job_elapsed(job_id)
        transcription_jobs[job_id]["progress"] = round(pct, 1)
        transcription_jobs[job_id]["current_step"] = msg
        _save_transcription_job(job_id, transcription_jobs[job_id])

    temp_audio_path = None

    try:
        _start_job_timer(job_id)
        normalized_mode = (diarization_mode or "auto").strip().lower()
        if normalized_mode not in ("auto", "pyannote", "basic"):
            normalized_mode = "auto"
        if engine == "accurate" and normalized_mode == "basic":
            normalized_mode = "auto"
        transcription_jobs[job_id]["diarization_mode"] = normalized_mode

        total_duration = transcription_jobs[job_id].get("total_duration", 0)
        remaining_duration = total_duration - resume_from_time if total_duration > 0 else 0

        update_progress(
            transcription_jobs[job_id].get("progress", 0),
            f"Extracting audio from {resume_from_time:.0f}s..."
        )

        # Extract remaining audio using ffmpeg
        temp_audio_path = file_path.parent / f"{job_id}_resume_{int(resume_from_time)}.wav"

        ffmpeg_cmd = [
            "ffmpeg", "-y",
            "-ss", str(resume_from_time),  # Start time
            "-i", str(file_path),
            "-vn",  # No video
            "-acodec", "pcm_s16le",
            "-ar", "16000",  # 16kHz for Whisper
            "-ac", "1",  # Mono
            str(temp_audio_path)
        ]

        print(f"[Resume] Extracting audio from {resume_from_time:.1f}s: {' '.join(ffmpeg_cmd)}")
        result = subprocess.run(ffmpeg_cmd, capture_output=True, text=True)

        if result.returncode != 0:
            raise Exception(f"FFmpeg failed: {result.stderr}")

        if not temp_audio_path.exists():
            raise Exception("Failed to extract audio segment")

        check_cancelled()

        # Calculate progress offset (where we left off)
        progress_offset = (resume_from_time / total_duration * 70) + 10 if total_duration > 0 else 10

        update_progress(progress_offset, f"Resuming transcription from {resume_from_time:.0f}s...")

        # Segment callback for live preview and cancellation
        def segment_callback(segment: dict, all_new_segments: list) -> bool:
            if job_id in cancelled_jobs:
                return False
            # Adjust timestamp and merge
            adjusted_segment = segment.copy()
            adjusted_segment["start_time"] += resume_from_time
            adjusted_segment["end_time"] += resume_from_time

            # Update segments with existing + new adjusted segments
            merged = existing_segments + [
                {**s, "start_time": s["start_time"] + resume_from_time, "end_time": s["end_time"] + resume_from_time}
                for s in all_new_segments
            ]
            transcription_jobs[job_id]["segments"] = merged
            if len(all_new_segments) % 5 == 0:
                _save_transcription_job(job_id, transcription_jobs[job_id])
            return True

        # Transcribe remaining audio
        import asyncio
        import functools
        loop = asyncio.get_event_loop()

        if engine == "accurate":
            # WhisperX handles extraction internally via transcribe_partial
            from whisperx_service import get_whisperx_service
            whisperx_service = get_whisperx_service()

            print(f"[Resume] Using WhisperX (accurate mode) from {resume_from_time:.1f}s")

            new_segments, metadata = await loop.run_in_executor(
                None,
                functools.partial(
                    whisperx_service.transcribe_partial,
                    file_path,  # Original file - WhisperX extracts internally
                    start_time=resume_from_time,
                    language=language,
                    model_size=whisper_model,
                    enable_diarization=enable_diarization,
                    min_speakers=min_speakers,
                    max_speakers=max_speakers,
                    progress_callback=lambda pct, msg: update_progress(
                        progress_offset + (pct - 10) * (100 - progress_offset) / 70,
                        msg
                    ),
                    check_cancelled=check_cancelled
                )
            )

            # WhisperX already adjusts timestamps, merge directly
            all_segments = existing_segments + new_segments

        else:
            # Fast mode - use faster-whisper with pre-extracted audio
            from transcription_service import get_transcription_service
            transcription_service = get_transcription_service()

            print(f"[Resume] Using faster-whisper (fast mode) from {resume_from_time:.1f}s")

            new_segments, metadata = await loop.run_in_executor(
                None,
                functools.partial(
                    transcription_service.transcribe,
                    temp_audio_path,
                    language=language,
                    model_size=whisper_model,
                    progress_callback=lambda pct, msg: update_progress(
                        progress_offset + (pct - 10) * (100 - progress_offset) / 70,
                        msg
                    ),
                    segment_callback=segment_callback
                )
            )

            check_cancelled()

            # Adjust timestamps for new segments and merge
            adjusted_segments = []
            for seg in new_segments:
                adjusted = seg.copy()
                adjusted["start_time"] += resume_from_time
                adjusted["end_time"] += resume_from_time
                adjusted_segments.append(adjusted)

            all_segments = existing_segments + adjusted_segments

        # Run diarization if enabled (on full audio file)
        if enable_diarization and len(all_segments) > 1:
            if normalized_mode == "pyannote":
                update_progress(85, "Running speaker diarization (AI) on full audio...")
            elif normalized_mode == "basic":
                update_progress(85, "Running speaker diarization (basic) on full audio...")
            else:
                update_progress(85, "Running speaker diarization (auto) on full audio...")
            diarization_service = get_diarization_service()
            prefer_pyannote = normalized_mode != "basic"
            force_pyannote = normalized_mode == "pyannote"
            attempted_method = "clustering"
            if prefer_pyannote and diarization_service.is_pyannote_available():
                attempted_method = "pyannote"

            # Get original audio path (extract if video)
            audio_for_diarization = file_path
            suffix = file_path.suffix.lower()
            if suffix in [".mp4", ".mkv", ".avi", ".mov", ".webm", ".flv", ".wmv"]:
                # Need to extract audio for diarization
                audio_for_diarization = TEMP_DIR / f"diarize_{job_id}.wav"
                if not audio_for_diarization.exists():
                    extract_cmd = [
                        "ffmpeg", "-y", "-i", str(file_path),
                        "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1",
                        str(audio_for_diarization)
                    ]
                    subprocess.run(extract_cmd, capture_output=True, check=True)

            cache_info = ensure_audio_cached(
                audio_for_diarization,
                source_path=file_path,
                filename=transcription_jobs[job_id].get("filename"),
                duration=transcription_jobs[job_id].get("total_duration"),
            )
            if cache_info:
                transcription_jobs[job_id]["audio_cache"] = {
                    "hash": cache_info.get("hash"),
                    "path": cache_info.get("path"),
                    "size_bytes": cache_info.get("size_bytes"),
                }
                audio_for_diarization = Path(cache_info.get("path"))

            try:
                diarization_result = await loop.run_in_executor(
                    None,
                    functools.partial(
                        diarization_service.diarize_segments,
                        audio_for_diarization,
                        all_segments,
                        min_speakers=min_speakers,
                        max_speakers=max_speakers,
                        progress_callback=lambda pct, msg: update_progress(85 + pct * 0.1, msg),
                        force_pyannote=force_pyannote,
                        prefer_pyannote=prefer_pyannote,
                        cache_info=transcription_jobs[job_id].get("audio_cache"),
                    )
                )

                # Extract from DiarizationResult
                all_segments = diarization_result["segments"]
                transcription_jobs[job_id]["speakers_detected"] = diarization_result["num_speakers"]
                transcription_jobs[job_id]["diarization_method"] = diarization_result["method"]
                transcription_jobs[job_id]["diarization_error"] = None
                print(f"[Resume] Diarization complete: {diarization_result['num_speakers']} speakers using {diarization_result['method']}")
            except Exception as diarization_exc:
                reason = str(diarization_exc)
                if isinstance(diarization_exc, ThermalGuardTriggered):
                    reason = f"Thermal guard paused diarization: {reason}"
                    transcription_jobs[job_id]["thermal_guard"] = {
                        "paused": True,
                        "reason": str(diarization_exc),
                        "snapshot": getattr(diarization_exc, "snapshot", None),
                    }
                print(f"[Resume] Diarization failed: {reason}")
                transcription_jobs[job_id]["diarization_error"] = reason
                transcription_jobs[job_id]["diarization_method"] = "none"
                for seg in all_segments:
                    if "speaker" not in seg:
                        seg["speaker"] = "Speaker 1"
                        seg["speaker_id"] = 0
                transcription_jobs[job_id]["speakers_detected"] = 1
                update_progress(95, f"Diarization failed: {reason}")
        else:
            # No diarization - assign all to Speaker 1
            for seg in all_segments:
                if "speaker" not in seg:
                    seg["speaker"] = "Speaker 1"
                    seg["speaker_id"] = 0
            transcription_jobs[job_id]["speakers_detected"] = 1
            transcription_jobs[job_id]["diarization_method"] = "none"

        transcription_jobs[job_id]["segments"] = all_segments

        transcription_jobs[job_id]["status"] = "completed"
        transcription_jobs[job_id]["completed_at"] = datetime.datetime.now().isoformat()
        update_progress(100, "Transcription complete")

        print(f"[Resume] Job {job_id} completed with {len(all_segments)} total segments")

    except CancelledException:
        print(f"[Resume] Job {job_id}: Cancelled/Paused by user")
        # Status already set by pause/cancel endpoint

    except Exception as exc:
        import traceback
        print(f"[Resume] Job {job_id}: EXCEPTION: {exc}")
        traceback.print_exc()
        transcription_jobs[job_id]["status"] = "error"
        transcription_jobs[job_id]["error"] = str(exc)
        _save_transcription_job(job_id, transcription_jobs[job_id])

    finally:
        if job_id in transcription_jobs:
            _stop_job_timer(job_id)
            _save_transcription_job(job_id, transcription_jobs[job_id])
        cancelled_jobs.discard(job_id)
        # Clean up temp audio
        if temp_audio_path and temp_audio_path.exists():
            try:
                temp_audio_path.unlink()
            except Exception:
                pass


def _get_hf_token() -> Optional[str]:
    return (
        os.environ.get("HF_TOKEN")
        or os.environ.get("HUGGING_FACE_HUB_TOKEN")
        or settings_service.get("api_keys.huggingface")
    )


def _get_pyannote_models() -> list[dict]:
    return [
        {
            "id": "pyannote/speaker-diarization-3.1",
            "name": "Speaker Diarization 3.1",
            "required": True,
            "check_path": "config.yaml",
        },
        {
            "id": "pyannote/segmentation-3.0",
            "name": "Segmentation 3.0",
            "required": True,
            "check_path": "config.yaml",
        },
        {
            "id": "pyannote/speaker-diarization-community-1",
            "name": "Community Diarization 1 (PLDA)",
            "required": True,
            "check_path": "plda/xvec_transform.npz",
        },
        {
            "id": "pyannote/embedding",
            "name": "Speaker Embedding",
            "required": False,
            "check_path": "config.yaml",
        },
    ]


def _check_hf_model_access(hf_token: str, model: dict) -> int:
    import requests

    headers = {"Authorization": f"Bearer {hf_token}"}
    check_path = model.get("check_path") or "config.yaml"
    url = f"https://huggingface.co/{model['id']}/resolve/main/{check_path}"
    response = requests.head(url, headers=headers, timeout=10, allow_redirects=True)
    return response.status_code


def _check_pyannote_models_access(hf_token: str, required_only: bool = False) -> tuple[bool, list[str]]:
    errors: list[str] = []
    all_accessible = True
    for model in _get_pyannote_models():
        if required_only and not model.get("required"):
            continue
        try:
            status_code = _check_hf_model_access(hf_token, model)
        except Exception as exc:
            all_accessible = False
            errors.append(f"{model['id']}: {exc}")
            continue
        if status_code == 200:
            continue
        all_accessible = False
        if status_code == 403:
            errors.append(f"{model['id']}: terms_not_accepted")
        else:
            errors.append(f"{model['id']}: http_{status_code}")
    return all_accessible, errors


@app.get("/api/transcribe/diarization-status")
async def get_diarization_status():
    """Check if AI diarization (pyannote) is available."""
    from diarization_service import get_diarization_service

    diarization = get_diarization_service()

    # Check if pyannote package is installed
    pyannote_installed = False
    try:
        import pyannote.audio
        pyannote_installed = True
    except ImportError:
        pass

    # Check if HF token is configured
    hf_token = _get_hf_token()
    hf_token_configured = bool(hf_token)

    models_accessible = False
    model_errors: list[str] = []
    if pyannote_installed and hf_token_configured:
        models_accessible, model_errors = _check_pyannote_models_access(hf_token, required_only=True)

    pyannote_available = bool(pyannote_installed and hf_token_configured and models_accessible)
    pyannote_error = None

    if pyannote_available:
        if diarization._pyannote_available is False:
            diarization._pyannote_available = None
            diarization._pyannote_pipeline = None
            diarization._pyannote_error = None
            diarization._torchcodec_available = None
            diarization._torchcodec_error = None

        if not diarization.is_pyannote_available():
            pyannote_available = False
            pyannote_error = diarization._pyannote_error

    # Debug logging
    print(
        "[Diarization Status] installed=%s, token_configured=%s, available=%s, cached=%s, model_errors=%s"
        % (pyannote_installed, hf_token_configured, pyannote_available, diarization._pyannote_available, model_errors)
    )

    return {
        "pyannote_available": pyannote_available,
        "pyannote_installed": pyannote_installed,
        "hf_token_configured": hf_token_configured,
        "fallback_available": True,  # Clustering is always available
        "pyannote_error": pyannote_error,
        "message": (
            pyannote_error if pyannote_error
            else "AI speaker detection ready" if pyannote_available
            else "HuggingFace token required for AI detection" if not hf_token_configured
            else "Accept required model terms on HuggingFace" if model_errors
            else "Using fallback clustering" if not pyannote_installed
            else "Fallback clustering active"
        )
    }


@app.get("/api/transcribe/engine-status")
async def get_engine_status():
    """Check which transcription engines are available."""
    from whisperx_service import is_whisperx_available

    whisperx_available = is_whisperx_available()

    return {
        "engines": {
            "fast": {
                "name": "Fast (faster-whisper)",
                "available": True,  # Always available
                "description": "Quick transcription, segment-level diarization"
            },
            "accurate": {
                "name": "Accurate (WhisperX)",
                "available": whisperx_available,
                "description": "Word-level timestamps & speaker assignment"
            }
        },
        "default": "fast"
    }


@app.post("/api/transcribe/setup-huggingface")
async def setup_huggingface_token(request: Request):
    """Save HuggingFace token for pyannote."""
    data = await request.json()
    token = data.get("token", "").strip()

    if not token:
        raise HTTPException(status_code=400, detail="Token is required")

    # Validate token format (HF tokens start with "hf_")
    if not token.startswith("hf_"):
        raise HTTPException(status_code=400, detail="Invalid token format. HuggingFace tokens start with 'hf_'")

    # Save to settings
    settings_service.set("api_keys.huggingface", token)

    # Reset diarization service to pick up new token
    from diarization_service import get_diarization_service
    diarization = get_diarization_service()
    diarization._pyannote_available = None  # Force recheck
    diarization._pyannote_pipeline = None  # Reset pipeline too
    diarization._pyannote_error = None
    diarization._torchcodec_available = None
    diarization._torchcodec_error = None

    # Verify the token was saved correctly
    saved_token = settings_service.get("api_keys.huggingface")
    print(f"[HuggingFace Token] Saved: {'Yes' if saved_token else 'No'}, Length: {len(saved_token) if saved_token else 0}")

    return {"success": True, "message": "HuggingFace token saved"}


@app.post("/api/transcribe/upload-path")
async def upload_for_transcription_path(
    payload: TranscriptionPathRequest,
    background_tasks: BackgroundTasks,
    request: Request,
):
    """Upload local file path for transcription (Electron-only).
    Uses the original file directly - no copying for instant response.
    """
    import datetime

    if request.client and request.client.host not in ("127.0.0.1", "::1"):
        raise HTTPException(status_code=403, detail="Local requests only")

    source_path = Path(payload.path)
    if not source_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    if not source_path.is_file():
        raise HTTPException(status_code=400, detail="Path must be a file")

    file_size = source_path.stat().st_size
    if file_size == 0:
        raise HTTPException(status_code=400, detail="File is empty")

    # Use client-provided job_id if available (for Electron where response body can't be read)
    job_id = payload.job_id if payload.job_id else str(uuid.uuid4())[:8]
    job_filename = payload.filename or source_path.name or "uploaded_file"

    print(f"[Upload-Path] Job {job_id}: Using local file directly (client_provided={bool(payload.job_id)})")
    print(f"[Upload-Path] Path: {source_path}")
    print(f"[Upload-Path] Size: {file_size / (1024*1024):.1f} MB")

    # Use original file directly - no staging/copying needed
    transcription_jobs[job_id] = {
        "job_id": job_id,
        "status": "pending",
        "progress": 0,
        "current_step": "Queued",
        "total_duration": 0.0,
        "processed_duration": 0.0,
        "segments": [],
        "speakers_detected": 0,
        "elapsed_seconds": 0.0,
        "active_started_at": None,
        "error": None,
        "created_at": datetime.datetime.now().isoformat(),
        "completed_at": None,
        "filename": job_filename,
        "file_size_bytes": file_size,
        "file_path": str(source_path),
        "language": payload.language,
        "whisper_model": payload.whisper_model,
        "enable_diarization": payload.enable_diarization,
        "diarization_mode": payload.diarization_mode,
        "enable_ai_cleanup": payload.enable_ai_cleanup,
        "engine": payload.engine
    }

    _save_transcription_job(job_id, transcription_jobs[job_id])

    # Start transcription immediately with original file
    background_tasks.add_task(
        transcription_task,
        job_id,
        source_path,  # Use original file directly
        payload.language,
        payload.enable_diarization,
        payload.diarization_mode,
        payload.min_speakers,
        payload.max_speakers,
        payload.whisper_model,
        payload.enable_ai_cleanup,
        payload.engine
    )

    print(f"[Upload-Path] Job {job_id}: Returning immediately")
    # Use explicit JSONResponse to ensure proper headers and body flush
    from starlette.responses import JSONResponse
    return JSONResponse(
        content={"job_id": job_id},
        headers={"Connection": "close"}
    )


@app.post("/api/transcribe/import-link")
async def import_transcription_link(
    payload: TranscriptionLinkRequest,
    background_tasks: BackgroundTasks,
    request: Request,
):
    """Import audio/video from a public URL for transcription."""
    if not is_http_url(payload.url):
        raise HTTPException(status_code=400, detail="URL must start with http:// or https://")

    job_id = payload.job_id if payload.job_id else str(uuid.uuid4())[:8]
    url_label = sanitize_filename(payload.filename) if payload.filename else None

    transcription_jobs[job_id] = {
        "job_id": job_id,
        "status": "downloading",
        "progress": 0,
        "current_step": "Preparing download...",
        "total_duration": 0.0,
        "processed_duration": 0.0,
        "segments": [],
        "speakers_detected": 0,
        "elapsed_seconds": 0.0,
        "active_started_at": None,
        "error": None,
        "created_at": datetime.datetime.now().isoformat(),
        "completed_at": None,
        "filename": url_label or "Imported link",
        "file_size_bytes": 0,
        "file_path": "",
        "source_url": payload.url,
        "language": payload.language,
        "whisper_model": payload.whisper_model,
        "enable_diarization": payload.enable_diarization,
        "diarization_mode": payload.diarization_mode,
        "enable_ai_cleanup": payload.enable_ai_cleanup,
        "engine": payload.engine,
    }

    _save_transcription_job(job_id, transcription_jobs[job_id])

    background_tasks.add_task(import_link_task, job_id, payload)

    return {"job_id": job_id}


@app.post("/api/transcribe/upload")
async def upload_for_transcription(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    language: str = Form("auto"),
    enable_diarization: bool = Form(True),
    diarization_mode: str = Form("auto"),
    min_speakers: int = Form(1),
    max_speakers: int = Form(10),
    whisper_model: str = Form("base"),
    enable_ai_cleanup: bool = Form(False),
    engine: str = Form("fast")
):
    """Upload audio/video for transcription with speaker diarization."""
    import datetime

    job_id = str(uuid.uuid4())[:8]

    # Save uploaded file with streaming (supports files up to 5GB)
    suffix = Path(file.filename).suffix if file.filename else ".mp4"
    file_path = TEMP_DIR / f"upload_{job_id}{suffix}"

    # Stream file to disk in chunks (avoids loading entire file in memory)
    file_size = 0
    CHUNK_SIZE = 1024 * 1024  # 1MB chunks
    print(f"[Upload] Starting upload for: {file.filename}")
    with open(file_path, "wb") as f:
        while chunk := await file.read(CHUNK_SIZE):
            f.write(chunk)
            file_size += len(chunk)
            # Log progress every 100MB
            if file_size % (100 * 1024 * 1024) == 0:
                print(f"[Upload] Progress: {file_size / (1024*1024):.0f} MB received")

    print(f"[Upload] Completed: {file_size / (1024*1024):.1f} MB saved to {file_path}")

    # Initialize job
    transcription_jobs[job_id] = {
        "job_id": job_id,
        "status": "pending",
        "progress": 0,
        "current_step": "Queued",
        "total_duration": 0.0,
        "processed_duration": 0.0,
        "segments": [],
        "speakers_detected": 0,
        "elapsed_seconds": 0.0,
        "active_started_at": None,
        "error": None,
        "created_at": datetime.datetime.now().isoformat(),
        "completed_at": None,
        "filename": file.filename or "uploaded_file",
        "file_size_bytes": file_size,
        "file_path": str(file_path),
        "language": language,
        "whisper_model": whisper_model,
        "enable_diarization": enable_diarization,
        "diarization_mode": diarization_mode,
        "enable_ai_cleanup": enable_ai_cleanup,
        "engine": engine
    }

    _save_transcription_job(job_id, transcription_jobs[job_id])

    # Start background task
    background_tasks.add_task(
        transcription_task,
        job_id,
        file_path,
        language,
        enable_diarization,
        diarization_mode,
        min_speakers,
        max_speakers,
        whisper_model,
        enable_ai_cleanup,
        engine
    )

    return {"job_id": job_id}


@app.get("/api/transcribe/status/{job_id}")
async def get_transcription_status(job_id: str):
    """Get current status and segments for a transcription job."""
    # Check in-memory first
    if job_id in transcription_jobs:
        return transcription_jobs[job_id]

    # Try loading from disk
    job_data = _load_transcription_job(job_id)
    if job_data:
        transcription_jobs[job_id] = job_data
        return job_data

    raise HTTPException(404, "Transcription job not found")


@app.post("/api/transcribe/{job_id}/cancel")
async def cancel_transcription_job(job_id: str):
    """Cancel a running transcription job."""
    if job_id not in transcription_jobs:
        job_data = _load_transcription_job(job_id)
        if not job_data:
            raise HTTPException(404, "Transcription job not found")
        transcription_jobs[job_id] = job_data

    job = transcription_jobs[job_id]
    status = job.get("status", "")

    if status in ("completed", "error", "cancelled"):
        return {"cancelled": False, "reason": f"Job already {status}"}

    # Mark as cancelled
    cancelled_jobs.add(job_id)
    _stop_job_timer(job_id)
    transcription_jobs[job_id]["status"] = "cancelled"
    transcription_jobs[job_id]["current_step"] = "Cancelled by user"
    _save_transcription_job(job_id, transcription_jobs[job_id])

    print(f"[Transcription] Job {job_id} cancelled by user")
    return {"cancelled": True, "job_id": job_id}


@app.post("/api/transcribe/{job_id}/pause")
async def pause_transcription_job(job_id: str):
    """Pause a running transcription job (can be resumed later)."""
    if job_id not in transcription_jobs:
        job_data = _load_transcription_job(job_id)
        if not job_data:
            raise HTTPException(404, "Transcription job not found")
        transcription_jobs[job_id] = job_data

    job = transcription_jobs[job_id]
    status = job.get("status", "")

    if status in ("completed", "error", "cancelled", "paused", "interrupted", "downloading"):
        return {"paused": False, "reason": f"Job already {status}"}

    # Mark as paused (uses same cancellation mechanism internally)
    cancelled_jobs.add(job_id)
    _stop_job_timer(job_id)
    segments = job.get("segments", [])
    last_time = segments[-1]["end_time"] if segments else 0

    transcription_jobs[job_id]["status"] = "paused"
    transcription_jobs[job_id]["paused_at"] = datetime.datetime.now().isoformat()
    transcription_jobs[job_id]["resume_from_time"] = last_time
    transcription_jobs[job_id]["current_step"] = f"Paused at {job.get('progress', 0):.1f}% - {len(segments)} segments saved"
    _save_transcription_job(job_id, transcription_jobs[job_id])

    print(f"[Transcription] Job {job_id} paused at {last_time:.1f}s ({len(segments)} segments)")
    return {"paused": True, "job_id": job_id, "segments_saved": len(segments), "resume_from_time": last_time}


@app.post("/api/transcribe/{job_id}/resume")
async def resume_transcription_job(job_id: str, background_tasks: BackgroundTasks):
    """Resume a paused or interrupted transcription job."""
    if job_id not in transcription_jobs:
        job_data = _load_transcription_job(job_id)
        if not job_data:
            raise HTTPException(404, "Transcription job not found")
        transcription_jobs[job_id] = job_data

    job = transcription_jobs[job_id]
    status = job.get("status", "")

    if status not in ("paused", "interrupted"):
        return {"resumed": False, "reason": f"Job status is {status}, can only resume paused or interrupted jobs"}

    # Check we have the original file
    file_path = job.get("file_path")
    if not file_path or not Path(file_path).exists():
        return {"resumed": False, "reason": "Original media file not found"}

    # Get resume point
    segments = job.get("segments", [])
    resume_from_time = job.get("resume_from_time", 0)
    if segments and not resume_from_time:
        resume_from_time = segments[-1]["end_time"]

    # Update job status
    cancelled_jobs.discard(job_id)  # Remove from cancelled set
    transcription_jobs[job_id]["status"] = "transcribing"
    transcription_jobs[job_id]["current_step"] = f"Resuming from {resume_from_time:.1f}s..."
    _save_transcription_job(job_id, transcription_jobs[job_id])

    # Start resume task
    background_tasks.add_task(
        resume_transcription_task,
        job_id,
        Path(file_path),
        resume_from_time,
        job.get("language", "auto"),
        job.get("enable_diarization", True),
        job.get("diarization_mode", "auto"),
        job.get("min_speakers", 1),
        job.get("max_speakers", 10),
        job.get("whisper_model", "base"),
        segments,  # Existing segments to merge with
        job.get("engine", "fast")  # Use same engine as original job
    )

    print(f"[Transcription] Job {job_id} resuming from {resume_from_time:.1f}s")
    return {"resumed": True, "job_id": job_id, "resume_from_time": resume_from_time}


@app.put("/api/transcribe/{job_id}/segments")
async def update_transcript_segments(job_id: str, request: TranscriptUpdateRequest):
    """Save user edits to transcript segments."""
    if job_id not in transcription_jobs:
        job_data = _load_transcription_job(job_id)
        if not job_data:
            raise HTTPException(404, "Transcription job not found")
        transcription_jobs[job_id] = job_data

    transcription_jobs[job_id]["segments"] = request.segments
    _save_transcription_job(job_id, transcription_jobs[job_id])

    return {"updated": True, "num_segments": len(request.segments)}


@app.post("/api/transcribe/{job_id}/export")
async def export_transcription(job_id: str, request: TranscriptExportRequest):
    """Generate and download export file."""
    from fastapi.responses import Response

    if job_id not in transcription_jobs:
        job_data = _load_transcription_job(job_id)
        if not job_data:
            raise HTTPException(404, "Transcription job not found")
        transcription_jobs[job_id] = job_data

    job = transcription_jobs[job_id]
    segments = job.get("segments", [])

    if not segments:
        raise HTTPException(400, "No segments to export")

    content, mime_type = export_transcript(
        segments,
        request.format,
        request.include_speakers,
        request.include_timestamps
    )

    # Generate filename
    base_name = Path(job.get("filename", "transcript")).stem
    ext = request.format
    filename = f"{base_name}.{ext}"

    return Response(
        content=content,
        media_type=mime_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


class RediarizeRequest(BaseModel):
    min_speakers: int = 1
    max_speakers: int = 10
    diarization_mode: str = "auto"  # auto | pyannote | basic


@app.post("/api/transcribe/{job_id}/rediarize")
async def rediarize_transcription(job_id: str, request: RediarizeRequest, background_tasks: BackgroundTasks):
    """Re-run speaker diarization on an existing transcription."""
    if job_id not in transcription_jobs:
        job_data = _load_transcription_job(job_id)
        if not job_data:
            raise HTTPException(404, "Transcription job not found")
        transcription_jobs[job_id] = job_data

    job = transcription_jobs[job_id]
    segments = job.get("segments", [])

    if not segments:
        raise HTTPException(400, "No segments to diarize")

    file_path = job.get("file_path")
    cache_hash = (job.get("audio_cache") or {}).get("hash")
    cached_audio = get_cached_audio_path(cache_hash) if cache_hash else None
    if not cached_audio and (not file_path or not Path(file_path).exists()):
        raise HTTPException(400, "Original audio file not found and no cached audio available")

    normalized_mode = (request.diarization_mode or "auto").strip().lower()
    if normalized_mode not in ("auto", "pyannote", "basic"):
        normalized_mode = "auto"
    job["diarization_mode"] = normalized_mode

    # Check if diarization is available (only required for forced pyannote)
    diarization_service = get_diarization_service()
    if normalized_mode == "pyannote":
        diarization_service._pyannote_available = None
        diarization_service._pyannote_pipeline = None
        diarization_service._pyannote_error = None
        diarization_service._torchcodec_available = None
        diarization_service._torchcodec_error = None
        if not diarization_service.is_pyannote_available():
            detail = diarization_service._pyannote_error or "Pyannote diarization not available."
            raise HTTPException(400, detail)

    # Mark as processing
    job["status"] = "diarizing"
    job["progress"] = 0
    job["diarization_error"] = None
    if normalized_mode == "pyannote":
        job["current_step"] = "Starting speaker diarization (AI)..."
    elif normalized_mode == "basic":
        job["current_step"] = "Starting speaker diarization (basic)..."
    else:
        job["current_step"] = "Starting speaker diarization (auto)..."
    _save_transcription_job(job_id, job)

    async def rediarize_task():
        attempted_method = "clustering"
        try:
            import functools
            loop = asyncio.get_event_loop()
            audio_path = Path(cached_audio) if cached_audio else Path(file_path)

            # Extract audio if it's a video file
            suffix = audio_path.suffix.lower()
            if suffix in [".mp4", ".mkv", ".avi", ".mov", ".webm", ".flv", ".wmv"]:
                audio_for_diarization = TEMP_DIR / f"diarize_{job_id}.wav"
                if not audio_for_diarization.exists():
                    extract_cmd = [
                        "ffmpeg", "-y", "-i", str(audio_path),
                        "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1",
                        str(audio_for_diarization)
                    ]
                    subprocess.run(extract_cmd, capture_output=True, check=True)
                audio_path = audio_for_diarization
            elif suffix != ".wav":
                audio_for_diarization = TEMP_DIR / f"diarize_{job_id}.wav"
                if not audio_for_diarization.exists():
                    extract_cmd = [
                        "ffmpeg", "-y", "-i", str(audio_path),
                        "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1",
                        str(audio_for_diarization)
                    ]
                    subprocess.run(extract_cmd, capture_output=True, check=True)
                audio_path = audio_for_diarization

            cache_info = ensure_audio_cached(
                audio_path,
                source_path=Path(file_path) if file_path else None,
                filename=job.get("filename"),
                duration=job.get("total_duration"),
            )
            if cache_info:
                job["audio_cache"] = {
                    "hash": cache_info.get("hash"),
                    "path": cache_info.get("path"),
                    "size_bytes": cache_info.get("size_bytes"),
                }
                cached_audio = cache_info.get("path")
                audio_path = Path(cached_audio)

            import time
            last_save = {"time": 0.0, "progress": -1.0, "speakers": job.get("speakers_detected", 0)}

            def _count_speakers(seg_list: list) -> int:
                speaker_ids = {seg.get("speaker_id") for seg in seg_list if isinstance(seg.get("speaker_id"), int)}
                speaker_labels = {seg.get("speaker") for seg in seg_list if seg.get("speaker")}
                return max(len(speaker_ids), len(speaker_labels), 0)

            def update_progress(pct, msg, save_segments: bool = False):
                job["progress"] = round(pct, 1)
                job["current_step"] = msg
                if save_segments and segments:
                    job["segments"] = segments
                    speaker_count = _count_speakers(segments)
                    if speaker_count and speaker_count != last_save["speakers"]:
                        job["speakers_detected"] = speaker_count
                        last_save["speakers"] = speaker_count
                now = time.time()
                if pct >= 100 or now - last_save["time"] > 1.5 or abs(job["progress"] - last_save["progress"]) >= 0.5:
                    _save_transcription_job(job_id, job)
                    last_save["time"] = now
                    last_save["progress"] = job["progress"]

            if normalized_mode == "pyannote":
                update_progress(10, "Running speaker diarization (pyannote)...")
            elif normalized_mode == "basic":
                update_progress(10, "Running speaker diarization (basic)...")
            else:
                update_progress(10, "Running speaker diarization (auto)...")

            prefer_pyannote = normalized_mode != "basic"
            force_pyannote = normalized_mode == "pyannote"
            if prefer_pyannote and diarization_service.is_pyannote_available():
                attempted_method = "pyannote"

            # Use requested diarization mode
            def diarization_progress(pct, msg):
                save_segments = "Assigning speakers" in msg
                update_progress(10 + pct * 0.85, msg, save_segments=save_segments)

            diarization_result = await loop.run_in_executor(
                None,
                functools.partial(
                    diarization_service.diarize_segments,
                    audio_path,
                    segments,
                    min_speakers=request.min_speakers,
                    max_speakers=request.max_speakers,
                    progress_callback=diarization_progress,
                    force_pyannote=force_pyannote,
                    prefer_pyannote=prefer_pyannote,
                    cache_info=job.get("audio_cache"),
                )
            )

            # Extract results from DiarizationResult
            diarized_segments = diarization_result["segments"]
            diarization_method = diarization_result["method"]
            num_speakers = diarization_result["num_speakers"]

            job["speakers_detected"] = num_speakers
            job["segments"] = diarized_segments
            job["diarization_method"] = diarization_method
            job["diarization_error"] = None
            job["status"] = "completed"
            job["progress"] = 100
            job["current_step"] = f"Diarization complete - {num_speakers} speakers detected ({diarization_method})"

            _save_transcription_job(job_id, job)
            print(f"[Rediarize] Job {job_id}: {num_speakers} speakers detected using {diarization_method}")

        except Exception as exc:
            import traceback
            reason = str(exc)
            if isinstance(exc, ThermalGuardTriggered):
                print(f"[Rediarize] Job {job_id}: Thermal guard triggered: {reason}")
                job["status"] = "completed"
                job["current_step"] = f"Thermal guard paused diarization at {job.get('progress', 0):.1f}%"
                job["diarization_error"] = f"Thermal guard paused diarization: {reason}"
                job["diarization_method"] = attempted_method
                job["thermal_guard"] = {
                    "paused": True,
                    "reason": reason,
                    "snapshot": getattr(exc, "snapshot", None),
                }
                _save_transcription_job(job_id, job)
                return

            print(f"[Rediarize] Job {job_id}: EXCEPTION: {exc}")
            traceback.print_exc()
            # Don't set status to error - restore to completed so we don't lose the transcription
            job["status"] = "completed"
            job["current_step"] = f"Diarization failed: {reason}"
            job["diarization_error"] = reason
            _save_transcription_job(job_id, job)
            print(f"[Rediarize] Job {job_id}: Restored to completed status (transcription preserved)")

    background_tasks.add_task(rediarize_task)

    return {
        "job_id": job_id,
        "status": "diarizing",
        "message": "Re-running speaker diarization"
    }


@app.delete("/api/transcribe/{job_id}")
async def delete_transcription_job(job_id: str):
    """Clean up job and temporary files."""
    # Remove from memory
    job_data = transcription_jobs.pop(job_id, None)

    # Load from disk if not in memory
    if not job_data:
        job_data = _load_transcription_job(job_id)

    if not job_data:
        raise HTTPException(404, "Transcription job not found")

    # Delete temp file
    file_path = job_data.get("file_path")
    if file_path and Path(file_path).exists():
        try:
            Path(file_path).unlink()
        except Exception:
            pass

    # Delete job file
    job_path = TRANSCRIPTIONS_DIR / f"{job_id}.json"
    if job_path.exists():
        job_path.unlink()

    return {"deleted": True, "job_id": job_id}


@app.delete("/api/transcribe")
async def clear_all_transcriptions():
    """Delete all transcription jobs and their files."""
    deleted_count = 0
    freed_bytes = 0

    # Get all job files
    for job_file in TRANSCRIPTIONS_DIR.glob("*.json"):
        try:
            with open(job_file, "r", encoding="utf-8") as f:
                job_data = json.load(f)

            # Delete associated media file if exists
            file_path = job_data.get("file_path")
            if file_path and Path(file_path).exists():
                try:
                    freed_bytes += Path(file_path).stat().st_size
                    Path(file_path).unlink()
                except Exception:
                    pass

            # Delete job file
            job_file.unlink()
            deleted_count += 1

            # Remove from memory
            job_id = job_file.stem
            transcription_jobs.pop(job_id, None)

        except Exception as e:
            print(f"[Clear] Error deleting {job_file}: {e}")
            continue

    print(f"[Clear] Deleted {deleted_count} transcription jobs, freed {freed_bytes / (1024*1024):.2f} MB")
    return {
        "deleted_count": deleted_count,
        "freed_bytes": freed_bytes
    }


@app.get("/api/transcribe/history")
async def list_transcription_history(limit: int = 20):
    """List recent transcription jobs."""
    jobs_list = []

    # Get jobs from disk
    for job_file in sorted(TRANSCRIPTIONS_DIR.glob("*.json"), reverse=True)[:limit]:
        try:
            with open(job_file, "r", encoding="utf-8") as f:
                job_data = json.load(f)
                # Don't include full segments in list view
                job_summary = {k: v for k, v in job_data.items() if k != "segments"}
                job_summary["num_segments"] = len(job_data.get("segments", []))
                jobs_list.append(job_summary)
        except Exception:
            continue

    return {"jobs": jobs_list, "total": len(jobs_list)}


# --- Model Management Endpoints ---

@app.get("/api/model-manager/status")
async def get_models_status():
    """Get download status for all models"""
    manager = get_model_manager()
    statuses = manager.get_model_status()

    return {
        "models": [
            {
                "id": s.id,
                "name": s.name,
                "description": s.description,
                "size_gb": s.size_gb,
                "downloaded": s.downloaded,
                "downloaded_size_gb": s.downloaded_size_gb,
                "repo_id": s.repo_id,
            }
            for s in statuses
        ],
        "total_cache_size_gb": round(manager.get_total_cache_size(), 2),
    }


# Track download progress
download_progress: dict[str, dict] = {}

@app.post("/api/model-manager/download/{model_id}")
async def download_model(model_id: str, background_tasks: BackgroundTasks):
    """Start downloading a model"""
    manager = get_model_manager()

    # Check if model exists
    statuses = manager.get_model_status()
    model = next((s for s in statuses if s.id == model_id), None)
    if not model:
        raise HTTPException(404, f"Model not found: {model_id}")

    if model.downloaded:
        return {"message": f"Model {model_id} is already downloaded", "already_downloaded": True}

    # Initialize progress tracking
    download_progress[model_id] = {"status": "downloading", "progress": 0, "error": None}

    # Start background download
    background_tasks.add_task(download_model_task, model_id, manager)

    return {
        "message": f"Started downloading {model.name}",
        "model_id": model_id,
        "estimated_size_gb": model.size_gb,
    }


def download_model_task(model_id: str, manager):
    """Background task for model download (sync function for BackgroundTasks)"""
    def progress_callback(progress: float):
        pct = int(progress)
        download_progress[model_id]["progress"] = pct
        print(f"[Download] {model_id}: {pct}%")

    try:
        print(f"[Download] Starting download for {model_id}")
        manager.download_model(model_id, progress_callback)
        download_progress[model_id]["status"] = "completed"
        download_progress[model_id]["progress"] = 100
        print(f"[Download] Completed: {model_id}")
    except Exception as e:
        download_progress[model_id]["status"] = "error"
        download_progress[model_id]["error"] = str(e)
        print(f"[Download] Error for {model_id}: {e}")


@app.get("/api/model-manager/download/{model_id}/progress")
async def get_download_progress(model_id: str):
    """Get download progress for a model"""
    if model_id not in download_progress:
        return {"status": "not_started", "progress": 0}
    return download_progress[model_id]


@app.delete("/api/model-manager/{model_id}")
async def delete_model(model_id: str):
    """Delete a downloaded model to free disk space"""
    manager = get_model_manager()

    # Check if model exists and is downloaded
    statuses = manager.get_model_status()
    model = next((s for s in statuses if s.id == model_id), None)
    if not model:
        raise HTTPException(404, f"Model not found: {model_id}")

    if not model.downloaded:
        return {"message": f"Model {model_id} is not downloaded", "already_deleted": True}

    try:
        # Unload from memory first if loaded
        service = get_tts_service()
        service.unload_model(model_id)

        # Delete from disk
        manager.delete_model(model_id)

        return {
            "message": f"Model {model.name} deleted successfully",
            "freed_space_gb": model.downloaded_size_gb,
        }
    except RuntimeError as e:
        raise HTTPException(400, str(e))


# =====================================================
# SETTINGS & CONFIGURATION ENDPOINTS
# =====================================================

@app.get("/api/settings")
async def get_all_settings():
    """Get all application settings"""
    return settings_service.get_all()


@app.post("/api/settings/reset")
async def reset_settings(section: Optional[str] = None):
    """Reset settings to defaults (optionally just one section)"""
    settings_service.reset_to_defaults(section)
    return {"message": f"Settings reset {'for ' + section if section else 'completely'}"}


# =====================================================
# WIDGET OVERLAY SETTINGS ENDPOINTS
# =====================================================

class WidgetReaderSettingsModel(BaseModel):
    speed: float = 1.0
    voice: Optional[str] = None
    language: str = "en"


class WidgetTTSSettingsModel(BaseModel):
    speed: float = 1.0
    voice: Optional[str] = None
    language: str = "en"


class WidgetSTTSettingsModel(BaseModel):
    language: str = "auto"
    autoPaste: bool = False


class WidgetSettingsUpdate(BaseModel):
    currentModule: str = "reader"
    reader: Optional[WidgetReaderSettingsModel] = None
    tts: Optional[WidgetTTSSettingsModel] = None
    stt: Optional[WidgetSTTSettingsModel] = None


@app.get("/api/widget/settings")
async def get_widget_settings():
    """Get widget overlay settings"""
    widget = settings_service.get("widget", {})
    return {
        "currentModule": widget.get("currentModule", "reader"),
        "reader": widget.get("reader", {"speed": 1.0, "voice": None, "language": "en"}),
        "tts": widget.get("tts", {"speed": 1.0, "voice": None, "language": "en"}),
        "stt": widget.get("stt", {"language": "auto", "autoPaste": False}),
    }


@app.put("/api/widget/settings")
async def update_widget_settings(settings: WidgetSettingsUpdate):
    """Update widget overlay settings"""
    settings_service.set("widget.currentModule", settings.currentModule)
    if settings.reader:
        settings_service.set("widget.reader", settings.reader.model_dump())
    if settings.tts:
        settings_service.set("widget.tts", settings.tts.model_dump())
    if settings.stt:
        settings_service.set("widget.stt", settings.stt.model_dump())
    return {"updated": True}


class SettingUpdate(BaseModel):
    value: Any


# =====================================================
# API KEYS ENDPOINTS
# =====================================================

class APIKeyUpdate(BaseModel):
    provider: str
    key: str


class ProviderEnsureRequest(BaseModel):
    model_id: Optional[str] = None
    auto_install: bool = True


def _extract_api_error(resp) -> Optional[str]:
    try:
        data = resp.json()
    except ValueError:
        data = None

    detail = None
    if isinstance(data, dict):
        for key in ("error", "message", "detail", "msg"):
            if data.get(key):
                detail = data.get(key)
                break
        if isinstance(detail, dict):
            detail = detail.get("message") or detail.get("detail") or str(detail)
        if not detail and data.get("code"):
            detail = str(data.get("code"))

    if not detail:
        text = (resp.text or "").strip()
        if text:
            detail = text[:200] + ("..." if len(text) > 200 else "")

    if detail:
        detail = " ".join(str(detail).split())
    return detail


_PROVIDER_ERROR_HINTS = {
    "openai": "Check that the key was created in the OpenAI dashboard and billing is enabled.",
    "elevenlabs": "Use the XI API key from ElevenLabs settings.",
    "claude": "Use a Claude API key from the Anthropic console.",
    "gemini": "Create the key in Google AI Studio (Gemini API).",
    "deepseek": "Use a DeepSeek API key from the DeepSeek console.",
    "moonshot": "Use a Moonshot API key from the Moonshot console.",
    "minimax": "Use a MiniMax API key from the MiniMax console.",
    "groq": "Use a Groq API key from the Groq console.",
    "deepgram": "Use a Deepgram project API key.",
    "dashscope": "Use a DashScope API key (not Alibaba Cloud AccessKey/Secret).",
    "fishaudio": "Use an API key from Fish Audio.",
    "siliconflow": "Use an API key from the SiliconFlow account page.",
    "assemblyai": "Use an API key from the AssemblyAI dashboard.",
    "gladia": "Use an API key from the Gladia app.",
    "deepl": "Ensure you are using the correct DeepL API key (Free vs Pro).",
    "google": "Enable Cloud Translation API in your Google Cloud project.",
}


def _format_api_error(provider_id: str, resp) -> str:
    status = resp.status_code
    detail = _extract_api_error(resp)

    if status == 401:
        base = "Unauthorized: API key invalid or missing permission."
    elif status == 403:
        base = "Forbidden: key lacks access or terms not accepted."
    elif status == 402:
        base = "Payment required or quota exhausted."
    elif status == 429:
        base = "Rate limit or quota exceeded."
    elif status == 404:
        base = "Endpoint not found (provider API may have changed)."
    elif status >= 500:
        base = "Provider error (server)."
    else:
        base = f"HTTP {status}"

    hint = _PROVIDER_ERROR_HINTS.get(provider_id)
    if hint and status in (401, 402, 403):
        base = f"{base} {hint}"

    if detail:
        return f"{base} ({detail})"
    return base


def _result_from_response(provider_id: str, resp, extra: Optional[dict] = None) -> dict:
    if resp.status_code == 200:
        result = {"provider": provider_id, "valid": True}
        if extra:
            result.update(extra)
        return result
    return {"provider": provider_id, "valid": False, "error": _format_api_error(provider_id, resp)}


@app.get("/api/providers/catalog")
async def list_provider_catalog():
    """Return the provider catalog for UI descriptions and links."""
    catalog = get_supported_provider_catalog()
    providers = sorted(catalog.values(), key=lambda p: p.get("name", p.get("id", "")))
    return {"providers": providers}


@app.get("/api/providers/{service}")
async def get_service_providers(service: str):
    """
    Get available providers for a service type.

    Args:
        service: One of 'tts', 'stt', 'ai_edit', 'translation'

    Returns:
        List of providers with availability status
    """
    valid_services = ["tts", "stt", "ai_edit", "translation"]
    if service not in valid_services:
        raise HTTPException(400, f"Invalid service. Valid options: {valid_services}")

    providers = get_providers_for_service(service)
    return {"service": service, "providers": providers}


@app.get("/api/providers/{service}/available")
async def get_available_service_providers(service: str):
    """Get only providers that are ready to use (API key set or model installed)."""
    valid_services = ["tts", "stt", "ai_edit", "translation"]
    if service not in valid_services:
        raise HTTPException(400, f"Invalid service. Valid options: {valid_services}")

    providers = get_available_providers(service)
    return {"service": service, "providers": providers}


@app.get("/api/providers/{service}/options")
async def get_service_provider_options(service: str):
    """Get providers formatted for frontend select menu."""
    valid_services = ["tts", "stt", "ai_edit", "translation"]
    if service not in valid_services:
        raise HTTPException(400, f"Invalid service. Valid options: {valid_services}")

    options = get_provider_options_for_frontend(service)
    return {"service": service, "options": options}


# Track provider auto-install status
provider_install_status: dict[str, dict] = {}


def _install_python_packages(packages: list[str]) -> dict:
    if not packages:
        return {"success": True, "output": ""}

    from providers.readiness import resolve_pip_package

    pip_packages = []
    for pkg in packages:
        pip_packages.append(resolve_pip_package(pkg))

    cmd = [sys.executable, "-m", "pip", "install", *sorted(set(pip_packages))]
    result = subprocess.run(cmd, capture_output=True, text=True, shell=False)
    output = (result.stdout or "") + ("\n" + result.stderr if result.stderr else "")
    return {"success": result.returncode == 0, "output": output.strip()}


def _ensure_provider_install_task(task_key: str, packages: list[str], model_id: Optional[str]):
    provider_install_status[task_key] = {
        "status": "installing",
        "packages": packages,
        "model_id": model_id,
        "error": None,
    }
    try:
        install_result = _install_python_packages(packages)
        if not install_result["success"]:
            provider_install_status[task_key]["status"] = "error"
            provider_install_status[task_key]["error"] = install_result["output"] or "Package install failed"
            return

        if model_id:
            from model_manager import get_model_manager
            manager = get_model_manager()
            download_progress.setdefault(model_id, {"status": "downloading", "progress": 0, "error": None})
            download_model_task(model_id, manager)

        provider_install_status[task_key]["status"] = "completed"
    except Exception as exc:
        provider_install_status[task_key]["status"] = "error"
        provider_install_status[task_key]["error"] = str(exc)


@app.post("/api/providers/{service}/{provider_id}/ensure")
async def ensure_provider_ready(
    service: str,
    provider_id: str,
    request: ProviderEnsureRequest,
    background_tasks: BackgroundTasks,
):
    """Ensure provider dependencies/models are installed (auto-install when possible)."""
    valid_services = ["tts", "stt", "ai_edit", "translation", "music", "sfx", "voice_changer", "voice_isolator"]
    if service not in valid_services:
        raise HTTPException(400, f"Invalid service. Valid options: {valid_services}")

    if service == "tts":
        from tts_providers.registry import get_provider_info
        provider_info = get_provider_info(provider_id)
        if not provider_info:
            raise HTTPException(404, f"TTS provider not found: {provider_id}")

        api_provider_ids = {
            "openai-tts", "elevenlabs", "fishaudio", "cartesia", "playht",
            "siliconflow", "minimax", "zyphra", "narilabs"
        }
        provider = {"id": provider_id, "type": "api" if provider_id in api_provider_ids else "local"}
    else:
        provider = next((p for p in get_providers_for_service(service) if p.get("id") == provider_id), None)
        if not provider:
            raise HTTPException(404, f"Provider not found: {provider_id}")

    from providers.readiness import get_provider_readiness
    readiness = get_provider_readiness(service, provider, preferred_model_id=request.model_id)
    if readiness["ready"] or not request.auto_install:
        return {"ready": readiness["ready"], "readiness": readiness}

    task_key = f"{service}:{provider_id}"
    if provider_install_status.get(task_key, {}).get("status") == "installing":
        return {"ready": False, "readiness": readiness, "install_status": "installing"}

    packages = readiness.get("missing_packages") or []
    model_id = readiness.get("install_model_id") if readiness.get("missing_model") else None
    if packages or model_id:
        background_tasks.add_task(_ensure_provider_install_task, task_key, packages, model_id)
        return {"ready": False, "readiness": readiness, "install_started": True}

    return {"ready": False, "readiness": readiness}


@app.get("/api/providers/tts/{provider_id}/usage")
async def get_provider_tts_usage(provider_id: str):
    """Return usage/quota info for API-based TTS providers via the legacy /api/providers path."""
    try:
        usage = resolve_tts_provider_usage(provider_id)
    except ProviderUsageError as exc:
        raise HTTPException(exc.status_code, str(exc))

    if usage is None:
        raise HTTPException(404, f"Usage data not available for provider: {provider_id}")

    return {"provider": provider_id, "usage": usage}


@app.get("/api/providers/all")
async def get_all_service_providers():
    """Get all providers for all services."""
    return get_all_providers()


@app.get("/api/settings/api-keys")
async def get_api_keys():
    """Get API keys (masked for security)"""
    keys = settings_service.settings.api_keys.model_dump()
    masked = {}
    for provider, key in keys.items():
        if key:
            masked[provider] = f"{key[:8]}...{key[-4:]}" if len(key) > 12 else "****"
        else:
            masked[provider] = None
    return {"api_keys": masked}


@app.put("/api/settings/api-keys/{provider}")
async def set_api_key_legacy(provider: str, data: APIKeyUpdate):
    """Set API key for a provider (legacy endpoint - use POST /api/settings/api-key/{provider} instead)"""
    provider_id = normalize_provider_id(provider)
    catalog = get_supported_provider_catalog()
    if provider_id not in catalog and provider_id != "huggingface":
        raise HTTPException(400, f"Unknown provider: {provider_id}")
    success = settings_service.set_api_key(provider_id, data.key)
    if not success:
        raise HTTPException(400, f"Could not set API key for: {provider_id}")
    return {"provider": provider_id, "updated": True}


@app.post("/api/settings/api-keys/{provider}/test")
async def test_api_key(provider: str):
    """Test if an API key is valid"""
    provider_id = normalize_provider_id(provider)
    key = settings_service.get_api_key(provider_id)
    if not key:
        return {"provider": provider_id, "valid": False, "error": "No API key configured"}

    # Test the key based on provider
    try:
        if provider_id == "openai":
            import requests
            resp = requests.get(
                "https://api.openai.com/v1/models",
                headers={"Authorization": f"Bearer {key}"},
                timeout=30
            )
            return _result_from_response(provider_id, resp)

        elif provider_id == "elevenlabs":
            import requests
            resp = requests.get(
                "https://api.elevenlabs.io/v1/user",
                headers={"xi-api-key": key}
            )
            return _result_from_response(
                provider_id,
                resp,
                extra={"user": resp.json().get("first_name")} if resp.status_code == 200 else None,
            )

        elif provider_id == "gemini":
            import requests
            resp = requests.get(
                f"https://generativelanguage.googleapis.com/v1beta/models?key={key}"
            )
            return _result_from_response(provider_id, resp)

        elif provider_id == "claude":
            import requests
            resp = requests.get(
                "https://api.anthropic.com/v1/models",
                headers={
                    "x-api-key": key,
                    "anthropic-version": "2023-06-01",
                },
                timeout=30
            )
            return _result_from_response(provider_id, resp)

        elif provider_id == "deepl":
            import requests
            resp = requests.get(
                "https://api-free.deepl.com/v2/usage",
                headers={"Authorization": f"DeepL-Auth-Key {key}"}
            )
            return _result_from_response(provider_id, resp)

        elif provider_id == "google":
            import requests
            resp = requests.get(
                "https://translation.googleapis.com/language/translate/v2/languages",
                params={"key": key, "target": "en"},
                timeout=30
            )
            return _result_from_response(provider_id, resp)

        elif provider_id == "deepgram":
            import requests
            resp = requests.get(
                "https://api.deepgram.com/v1/projects",
                headers={"Authorization": f"Token {key}"},
                timeout=30
            )
            return _result_from_response(provider_id, resp)

        elif provider_id == "groq":
            import requests
            resp = requests.get(
                "https://api.groq.com/openai/v1/models",
                headers={"Authorization": f"Bearer {key}"},
                timeout=30
            )
            return _result_from_response(provider_id, resp)

        elif provider_id == "deepseek":
            import requests
            resp = requests.get(
                "https://api.deepseek.com/v1/models",
                headers={"Authorization": f"Bearer {key}"},
                timeout=30
            )
            return _result_from_response(provider_id, resp)

        elif provider_id == "moonshot":
            import requests
            resp = requests.get(
                "https://api.moonshot.ai/v1/models",
                headers={"Authorization": f"Bearer {key}"},
                timeout=30
            )
            return _result_from_response(provider_id, resp)

        elif provider_id == "minimax":
            import requests
            base_url = settings_service.get("providers.ai_edit.minimax.base_url", "https://api.minimax.chat")
            resp = requests.get(
                f"{base_url.rstrip('/')}/v1/models",
                headers={"Authorization": f"Bearer {key}"},
                timeout=30
            )
            return _result_from_response(provider_id, resp)

        elif provider_id == "assemblyai":
            import requests
            resp = requests.get(
                "https://api.assemblyai.com/v2/me",
                headers={"authorization": key},
                timeout=30
            )
            return _result_from_response(provider_id, resp)

        elif provider_id == "dashscope":
            import requests
            resp = requests.get(
                "https://dashscope.aliyuncs.com/api/v1/models",
                headers={"Authorization": f"Bearer {key}"},
                timeout=30
            )
            return _result_from_response(provider_id, resp)

        elif provider_id == "fishaudio":
            import requests
            resp = requests.get(
                "https://api.fish.audio/model",
                headers={"Authorization": f"Bearer {key}"},
                timeout=30
            )
            return _result_from_response(provider_id, resp)

        elif provider_id == "siliconflow":
            import requests
            resp = requests.get(
                "https://api.siliconflow.cn/v1/audio/voice/list",
                headers={"Authorization": f"Bearer {key}"},
                timeout=30
            )
            return _result_from_response(provider_id, resp)

        elif provider_id == "gladia":
            import requests
            resp = requests.get(
                "https://api.gladia.io/v1/history",
                headers={"x-gladia-key": key},
                timeout=30
            )
            return _result_from_response(provider_id, resp)

        else:
            return {"provider": provider_id, "valid": False, "error": "Unknown or unsupported provider"}

    except ImportError as e:
        return {"provider": provider_id, "valid": False, "error": f"Missing library: {str(e)}"}
    except Exception as e:
        return {"provider": provider_id, "valid": False, "error": str(e)}


# =====================================================
# PROVIDER SELECTION ENDPOINTS
# =====================================================

@app.get("/api/settings/providers")
async def get_providers():
    """Get all provider settings"""
    return settings_service.settings.providers.model_dump()


@app.get("/api/settings/providers/{function}")
async def get_function_provider(function: str):
    """Get provider for a specific function (tts, stt, ai_edit, translation)"""
    selected = settings_service.get_selected_provider(function)
    if not selected:
        raise HTTPException(404, f"Unknown function: {function}")

    # Get provider-specific config
    config = settings_service.get(f"providers.{function}.{selected.replace('-', '_')}", {})

    return {
        "function": function,
        "selected": selected,
        "config": config
    }


@app.put("/api/settings/providers/{function}")
async def set_function_provider(function: str, data: dict):
    """Set provider for a specific function"""
    provider = data.get("provider")
    if not provider:
        raise HTTPException(400, "Provider is required")

    success = settings_service.set_selected_provider(function, provider)
    if not success:
        raise HTTPException(400, f"Could not set provider for: {function}")

    # Merge new config with existing config (preserves fields not sent by frontend)
    if "config" in data and data["config"]:
        config_path = f"providers.{function}.{provider.replace('-', '_')}"
        existing_config = settings_service.get(config_path, {})
        if isinstance(existing_config, dict):
            merged_config = {**existing_config, **data["config"]}
        else:
            merged_config = data["config"]
        settings_service.set(config_path, merged_config)

    return {"function": function, "provider": provider, "updated": True}


# =====================================================
# EXTENDED MODEL MANAGEMENT ENDPOINTS
# =====================================================

@app.get("/api/models/all")
async def list_all_models(category: Optional[str] = None):
    """List all available models (TTS, STT, Translation, etc.)"""
    manager = get_model_manager()

    cat = ModelCategory(category) if category else None
    models = manager.list_available_models(cat)

    return {
        "models": [
            {
                "id": m.id,
                "name": m.name,
                "category": m.category.value,
                "description": m.description,
                "size_mb": m.size_mb,
                "languages": m.languages,
                "requires_gpu": m.requires_gpu,
                "is_default": m.is_default,
                "status": manager.get_model_status(m.id).value,
                "installed": manager.is_installed(m.id),
            }
            for m in models
        ]
    }


@app.get("/api/models/installed")
async def list_installed_models(category: Optional[str] = None):
    """List only installed models"""
    manager = get_model_manager()
    cat = ModelCategory(category) if category else None
    models = manager.list_installed_models(cat)
    return {"models": models, "total_size_gb": manager.get_total_size_installed()}


@app.get("/api/models/recommended")
async def list_recommended_models():
    """List recommended models for first-time setup"""
    manager = get_model_manager()
    models = manager.get_recommended_models()

    total_size = sum(m.size_mb for m in models)

    return {
        "models": [
            {
                "id": m.id,
                "name": m.name,
                "category": m.category.value,
                "description": m.description,
                "size_mb": m.size_mb,
                "installed": manager.is_installed(m.id),
            }
            for m in models
        ],
        "total_size_mb": total_size
    }


@app.post("/api/models/{model_id}/download")
async def download_new_model(model_id: str, background_tasks: BackgroundTasks):
    """Download a model (starts background download)"""
    manager = get_model_manager()

    model = AVAILABLE_MODELS.get(model_id)
    if not model:
        raise HTTPException(404, f"Model not found: {model_id}")

    if manager.is_installed(model_id):
        return {"message": f"Model {model_id} is already installed", "already_installed": True}

    # Track progress
    download_progress[model_id] = {
        "status": "downloading",
        "progress": 0,
        "model_id": model_id,
        "model_name": model.name,
        "size_mb": model.size_mb,
    }

    # Start download in background
    background_tasks.add_task(download_model_task, model_id, manager)

    return {
        "message": f"Started downloading {model.name}",
        "model_id": model_id,
        "size_mb": model.size_mb,
    }


@app.delete("/api/models/{model_id}")
async def delete_any_model(model_id: str):
    """Delete any installed model"""
    manager = get_model_manager()

    model = AVAILABLE_MODELS.get(model_id)
    if not model:
        raise HTTPException(404, f"Model not found: {model_id}")

    if not manager.is_installed(model_id):
        return {"message": f"Model {model_id} is not installed", "already_deleted": True}

    try:
        # Unload from memory if it's a Chatterbox model
        if model.is_chatterbox:
            service = get_tts_service()
            service.unload_model(model_id.replace("chatterbox-", ""))

        manager.delete_model(model_id)

        return {
            "message": f"Model {model.name} deleted successfully",
            "freed_space_mb": model.size_mb,
        }
    except RuntimeError as e:
        raise HTTPException(400, str(e))


# =====================================================
# HOTKEYS ENDPOINTS
# =====================================================

@app.get("/api/settings/hotkeys")
async def get_hotkeys():
    """Get all hotkey configurations"""
    return settings_service.settings.hotkeys.model_dump()


@app.put("/api/settings/hotkeys/{action}")
async def set_hotkey(action: str, data: dict):
    """Set hotkey for a specific action"""
    hotkey = data.get("hotkey")
    if not hotkey:
        raise HTTPException(400, "Hotkey is required")

    success = settings_service.set_hotkey(action, hotkey)
    if not success:
        raise HTTPException(400, f"Could not set hotkey for: {action}")

    return {"action": action, "hotkey": hotkey, "updated": True}


# =====================================================
# COMPREHENSIVE MODEL & PROVIDER STATUS
# =====================================================

@app.get("/api/models/status")
async def get_comprehensive_model_status():
    """Get status of all models and API providers with verification."""
    result = {
        "diarization": {
            "name": "Speaker Diarization (Pyannote)",
            "type": "huggingface",
            "status": "unknown",
            "message": "",
            "models": [],
            "token_configured": False,
            "action": None,
        },
        "api_providers": {},
        "local_models": {
            "tts": [],
            "stt": [],
            "translation": [],
        }
    }
    result["local_providers"] = []

    # === Check Pyannote/HuggingFace ===
    hf_token = _get_hf_token()
    result["diarization"]["token_configured"] = bool(hf_token)

    pyannote_models = _get_pyannote_models()

    all_accessible = True
    for model in pyannote_models:
        model_status = {
            "id": model["id"],
            "name": model["name"],
            "required": model["required"],
            "accessible": False,
            "error": None,
            "accept_url": f"https://huggingface.co/{model['id']}",
        }

        if hf_token:
            try:
                # Try to access a real model file (not just metadata)
                status_code = _check_hf_model_access(hf_token, model)
                if status_code == 200:
                    model_status["accessible"] = True
                elif status_code == 403:
                    model_status["error"] = "Terms not accepted"
                    if model["required"]:
                        all_accessible = False
                else:
                    model_status["error"] = f"HTTP {status_code}"
                    if model["required"]:
                        all_accessible = False
            except Exception as e:
                model_status["error"] = str(e)
                if model["required"]:
                    all_accessible = False
        else:
            model_status["error"] = "No HuggingFace token"
            if model["required"]:
                all_accessible = False

        result["diarization"]["models"].append(model_status)

    runtime_error = None
    if all_accessible:
        diarization = get_diarization_service()
        if diarization._pyannote_available is False:
            diarization._pyannote_available = None
            diarization._pyannote_pipeline = None
            diarization._pyannote_error = None
            diarization._torchcodec_available = None
            diarization._torchcodec_error = None
        if not diarization.is_pyannote_available():
            runtime_error = diarization._pyannote_error or "Pyannote runtime not available."

    result["diarization"]["runtime_error"] = runtime_error

    # Set overall diarization status
    if not hf_token:
        result["diarization"]["status"] = "not_configured"
        result["diarization"]["message"] = "HuggingFace token not configured"
        result["diarization"]["action"] = "configure_token"
    elif all_accessible and runtime_error:
        result["diarization"]["status"] = "runtime_error"
        result["diarization"]["message"] = runtime_error
    elif all_accessible:
        result["diarization"]["status"] = "ready"
        result["diarization"]["message"] = "All models accessible"
    else:
        result["diarization"]["status"] = "terms_required"
        result["diarization"]["message"] = "Some models require accepting terms on HuggingFace"
        result["diarization"]["action"] = "accept_terms"

    # === Check API Providers ===
    catalog = get_supported_provider_catalog()
    for provider_id, provider in catalog.items():
        if provider.get("type") != "api":
            continue
        key_id = normalize_provider_id(provider_id)
        api_key = settings_service.get_api_key(key_id)
        result["api_providers"][provider_id] = {
            "name": provider.get("name", provider_id),
            "configured": bool(api_key),
            "key_preview": f"{api_key[:8]}..." if api_key and len(api_key) > 8 else None,
            "features": provider.get("features", []),
            "description": provider.get("description"),
            "pricing_unit": provider.get("pricing_unit"),
            "pricing_note": provider.get("pricing_note"),
            "pricing_url": provider.get("pricing_url"),
            "docs_url": provider.get("docs_url"),
            "console_url": provider.get("console_url"),
            "key_label": provider.get("key_label"),
            "key_instructions": provider.get("key_instructions"),
            "supported": provider.get("supported", {}),
        }

    # === Check Local Providers (non-downloadable services like Ollama) ===
    for service in ["ai_edit", "translation", "tts", "stt"]:
        for provider in get_providers_for_service(service):
            if provider.get("type") != "local":
                continue
            # Skip providers that are represented as downloadable models
            if provider.get("requires_model_download"):
                continue
            provider_id = provider.get("id")
            if not provider_id:
                continue
            entry = {
                "id": provider_id,
                "name": provider.get("name", provider_id),
                "service": service,
                "description": provider.get("description"),
                "is_available": provider.get("is_available", False),
                "is_installed": provider.get("is_installed", False),
                "docs_url": provider.get("docs_url"),
                "models": provider.get("models", []),
                "default_model": provider.get("default_model"),
            }
            if provider_id == "ollama":
                entry["base_url"] = settings_service.get(
                    "providers.ai_edit.ollama.base_url", "http://localhost:11434"
                )
            result["local_providers"].append(entry)

    # === Check Local Models ===
    try:
        manager = get_model_manager()
        for model in manager.list_available_models():
            model_info = {
                "id": model.id,
                "name": model.name,
                "installed": manager.is_installed(model.id),
                "size_mb": model.size_mb,
            }
            if model.category.value == "tts":
                result["local_models"]["tts"].append(model_info)
            elif model.category.value == "stt":
                result["local_models"]["stt"].append(model_info)
            elif model.category.value == "translation":
                result["local_models"]["translation"].append(model_info)
    except Exception as e:
        print(f"[Models Status] Error loading local models: {e}")

    return result


@app.post("/api/models/verify-huggingface")
async def verify_huggingface_access():
    """Verify HuggingFace token can access all required pyannote models."""
    hf_token = _get_hf_token()

    if not hf_token:
        raise HTTPException(400, "HuggingFace token not configured")

    models_to_check = _get_pyannote_models()

    results = []
    all_ok = True

    for model in models_to_check:
        try:
            status_code = _check_hf_model_access(hf_token, model)
            if status_code == 200:
                results.append({
                    "model": model["id"],
                    "name": model["name"],
                    "required": model["required"],
                    "status": "ok",
                    "accept_url": f"https://huggingface.co/{model['id']}",
                })
            elif status_code == 403:
                results.append({
                    "model": model["id"],
                    "name": model["name"],
                    "required": model["required"],
                    "status": "forbidden",
                    "message": "Accept terms required",
                    "url": f"https://huggingface.co/{model['id']}",
                    "accept_url": f"https://huggingface.co/{model['id']}",
                })
                if model["required"]:
                    all_ok = False
            else:
                results.append({
                    "model": model["id"],
                    "name": model["name"],
                    "required": model["required"],
                    "status": "error",
                    "code": status_code,
                    "accept_url": f"https://huggingface.co/{model['id']}",
                })
                if model["required"]:
                    all_ok = False
        except Exception as e:
            results.append({
                "model": model["id"],
                "name": model["name"],
                "required": model["required"],
                "status": "error",
                "message": str(e),
                "accept_url": f"https://huggingface.co/{model['id']}",
            })
            if model["required"]:
                all_ok = False

    if all_ok:
        diarization = get_diarization_service()
        if diarization._pyannote_available is False:
            diarization._pyannote_available = None
            diarization._pyannote_pipeline = None
            diarization._pyannote_error = None
            diarization._torchcodec_available = None
            diarization._torchcodec_error = None

    return {
        "all_accessible": all_ok,
        "models": results,
        "message": "All models accessible" if all_ok else "Some models need terms acceptance"
    }


@app.post("/api/settings/api-key/{provider}")
async def set_api_key(provider: str, request: Request):
    """Set API key for a provider."""
    data = await request.json()
    api_key = data.get("api_key", "").strip()
    provider_id = normalize_provider_id(provider)
    valid_providers = sorted(list(get_supported_provider_catalog().keys()) + ["huggingface"])
    if provider_id not in valid_providers:
        raise HTTPException(400, f"Invalid provider. Valid: {valid_providers}")

    key_path = f"api_keys.{provider_id}"

    if api_key:
        settings_service.set(key_path, api_key)
        # For HuggingFace, also reset diarization service
        if provider_id == "huggingface":
            diarization = get_diarization_service()
            diarization._pyannote_available = None
            diarization._pyannote_pipeline = None
            diarization._pyannote_error = None
            diarization._torchcodec_available = None
            diarization._torchcodec_error = None
    else:
        # Clear the key
        settings_service.set(key_path, None)

    return {"provider": provider_id, "configured": bool(api_key)}


@app.delete("/api/settings/api-key/{provider}")
async def delete_api_key(provider: str):
    """Remove API key for a provider."""
    provider_id = normalize_provider_id(provider)
    valid_providers = sorted(list(get_supported_provider_catalog().keys()) + ["huggingface"])
    if provider_id not in valid_providers:
        raise HTTPException(400, f"Invalid provider. Valid: {valid_providers}")

    settings_service.set(f"api_keys.{provider_id}", None)
    return {"provider": provider_id, "removed": True}


@app.get("/api/settings/{path:path}")
async def get_setting(path: str):
    """Get a specific setting by path (e.g., 'providers.tts.selected')."""
    value = settings_service.get(path)
    if value is None:
        raise HTTPException(404, f"Setting not found: {path}")
    return {"path": path, "value": value}


@app.put("/api/settings/{path:path}")
async def update_setting(path: str, data: SettingUpdate):
    """Update a specific setting by path."""
    success = settings_service.set(path, data.value)
    if not success:
        raise HTTPException(400, f"Could not update setting: {path}")
    return {"path": path, "value": data.value, "updated": True}


# =====================================================
# ONBOARDING ENDPOINTS
# =====================================================

@app.get("/api/onboarding/status")
async def get_onboarding_status():
    """Check if onboarding is completed"""
    return {
        "completed": settings_service.is_onboarding_completed(),
        "models_installed": len(settings_service.settings.models_installed),
    }


@app.post("/api/onboarding/complete")
async def complete_onboarding():
    """Mark onboarding as completed"""
    settings_service.complete_onboarding()
    return {"message": "Onboarding completed", "completed": True}


# =====================================================
# MUSIC GENERATION ENDPOINTS
# =====================================================

class MusicGenerateRequest(BaseModel):
    lyrics: str = ""
    style_prompt: str
    duration_seconds: int = 180
    provider: str = "diffrhythm"
    model: Optional[str] = None
    guidance_scale: float = 3.5
    num_inference_steps: int = 50
    seed: int = -1


@app.get("/api/music/providers")
async def get_music_providers():
    """Get list of available music generation providers"""
    try:
        from music_service import get_music_service
        service = get_music_service()
        return {"providers": service.get_providers()}
    except ImportError:
        return {"providers": [], "error": "Music module not available"}


@app.post("/api/music/generate")
async def generate_music(request: MusicGenerateRequest):
    """Start a music generation job"""
    from music_service import get_music_service

    service = get_music_service()
    job_id = service.create_job(
        lyrics=request.lyrics,
        style_prompt=request.style_prompt,
        duration_seconds=request.duration_seconds,
        provider=request.provider,
        model=request.model,
        guidance_scale=request.guidance_scale,
        num_inference_steps=request.num_inference_steps,
        seed=request.seed,
    )

    return {"job_id": job_id, "status": "pending"}


@app.get("/api/music/jobs/{job_id}")
async def get_music_job(job_id: str):
    """Get status of a music generation job"""
    from music_service import get_music_service

    service = get_music_service()
    job = service.get_job(job_id)

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    return job


@app.get("/api/music/jobs/{job_id}/download")
async def download_music(job_id: str):
    """Download generated music file"""
    from music_service import get_music_service

    service = get_music_service()
    job = service.get_job(job_id)

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job["status"] != "completed":
        raise HTTPException(status_code=400, detail="Job not completed")

    if not job["output_path"]:
        raise HTTPException(status_code=404, detail="Output file not found")

    output_path = Path(job["output_path"])
    if not output_path.exists():
        raise HTTPException(status_code=404, detail="Output file not found")

    return FileResponse(
        str(output_path),
        media_type="audio/wav",
        filename=output_path.name
    )


@app.post("/api/music/jobs/{job_id}/cancel")
async def cancel_music_job(job_id: str):
    """Cancel a music generation job"""
    from music_service import get_music_service

    service = get_music_service()
    success = service.cancel_job(job_id)

    if not success:
        raise HTTPException(status_code=400, detail="Could not cancel job")

    return {"cancelled": True}


@app.get("/api/music/jobs")
async def list_music_jobs(limit: int = 20):
    """List recent music generation jobs"""
    from music_service import get_music_service

    service = get_music_service()
    return {"jobs": service.list_jobs(limit=limit)}


# =====================================================
# SOUND EFFECTS (SFX) ENDPOINTS
# =====================================================

class SFXGenerateRequest(BaseModel):
    video_path: str
    prompt: str = ""
    provider: str = "mmaudio"
    model: Optional[str] = None
    merge_with_video: bool = True
    mix_original: bool = False
    original_volume: float = 0.3
    num_inference_steps: int = 25
    guidance_scale: float = 4.5
    seed: int = -1


@app.get("/api/sfx/providers")
async def get_sfx_providers():
    """Get list of available SFX providers"""
    try:
        from sfx_service import get_sfx_service
        service = get_sfx_service()
        return {"providers": service.get_providers()}
    except ImportError:
        return {"providers": [], "error": "SFX module not available"}


@app.post("/api/sfx/generate")
async def generate_sfx(request: SFXGenerateRequest):
    """Start a sound effects generation job"""
    from sfx_service import get_sfx_service

    service = get_sfx_service()
    try:
        job_id = service.create_job(
            video_path=request.video_path,
            prompt=request.prompt,
            provider=request.provider,
            model=request.model,
            merge_with_video=request.merge_with_video,
            mix_original=request.mix_original,
            original_volume=request.original_volume,
            num_inference_steps=request.num_inference_steps,
            guidance_scale=request.guidance_scale,
            seed=request.seed,
        )
        return {"job_id": job_id, "status": "pending"}
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.post("/api/sfx/upload")
async def upload_sfx_video(file: UploadFile = File(...)):
    """Upload a video file for SFX generation"""
    from sfx_service import get_sfx_service

    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Empty file")

    service = get_sfx_service()
    file_path = service.upload_video(content, file.filename)

    return {"file_path": file_path, "filename": file.filename}


@app.get("/api/sfx/jobs/{job_id}")
async def get_sfx_job(job_id: str):
    """Get status of a SFX generation job"""
    from sfx_service import get_sfx_service

    service = get_sfx_service()
    job = service.get_job(job_id)

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    return job


@app.get("/api/sfx/jobs/{job_id}/download/audio")
async def download_sfx_audio(job_id: str):
    """Download generated audio file"""
    from sfx_service import get_sfx_service

    service = get_sfx_service()
    job = service.get_job(job_id)

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job["status"] != "completed":
        raise HTTPException(status_code=400, detail="Job not completed")

    if not job["output_audio_path"]:
        raise HTTPException(status_code=404, detail="Audio file not found")

    output_path = Path(job["output_audio_path"])
    if not output_path.exists():
        raise HTTPException(status_code=404, detail="Audio file not found")

    return FileResponse(
        str(output_path),
        media_type="audio/wav",
        filename=output_path.name
    )


@app.get("/api/sfx/jobs/{job_id}/download/video")
async def download_sfx_video(job_id: str):
    """Download video with generated audio"""
    from sfx_service import get_sfx_service

    service = get_sfx_service()
    job = service.get_job(job_id)

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job["status"] != "completed":
        raise HTTPException(status_code=400, detail="Job not completed")

    if not job["output_video_path"]:
        raise HTTPException(status_code=404, detail="Video file not found")

    output_path = Path(job["output_video_path"])
    if not output_path.exists():
        raise HTTPException(status_code=404, detail="Video file not found")

    return FileResponse(
        str(output_path),
        media_type="video/mp4",
        filename=output_path.name
    )


@app.post("/api/sfx/jobs/{job_id}/cancel")
async def cancel_sfx_job(job_id: str):
    """Cancel a SFX generation job"""
    from sfx_service import get_sfx_service

    service = get_sfx_service()
    success = service.cancel_job(job_id)

    if not success:
        raise HTTPException(status_code=400, detail="Could not cancel job")

    return {"cancelled": True}


@app.get("/api/sfx/jobs")
async def list_sfx_jobs(limit: int = 20):
    """List recent SFX generation jobs"""
    from sfx_service import get_sfx_service

    service = get_sfx_service()
    return {"jobs": service.list_jobs(limit=limit)}


# =====================================================
# STEM SEPARATION (Demucs)
# =====================================================


@app.get("/api/stems/status")
async def get_stem_separation_status():
    """Check if Demucs stem separation is available"""
    from stem_separation_service import get_stem_separation_service

    service = get_stem_separation_service()
    return {
        "available": service.is_available(),
        "message": "Demucs is ready" if service.is_available() else "Install demucs: pip install demucs",
    }


@app.get("/api/stems/models")
async def get_stem_separation_models():
    """Get available stem separation models"""
    from stem_separation_service import get_stem_separation_service

    service = get_stem_separation_service()
    return {"models": service.get_models()}


class StemSeparationRequest(BaseModel):
    audio_path: str
    model: str = "htdemucs"
    stems: Optional[list] = None


@app.post("/api/stems/separate")
async def start_stem_separation(request: StemSeparationRequest):
    """Start a stem separation job"""
    from stem_separation_service import get_stem_separation_service

    service = get_stem_separation_service()

    if not service.is_available():
        raise HTTPException(
            status_code=503,
            detail="Demucs is not installed. Install with: pip install demucs"
        )

    try:
        job_id = service.create_job(
            audio_path=request.audio_path,
            model=request.model,
            stems=request.stems,
        )
        return {"job_id": job_id}
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/stems/upload")
async def upload_audio_for_stems(file: UploadFile = File(...)):
    """Upload an audio file for stem separation"""
    from stem_separation_service import get_stem_separation_service

    service = get_stem_separation_service()

    # Save uploaded file
    ext = Path(file.filename).suffix or ".wav"
    unique_filename = f"stem_upload_{uuid.uuid4().hex[:8]}{ext}"
    file_path = TEMP_DIR / unique_filename

    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)

    return {"audio_path": str(file_path)}


@app.get("/api/stems/jobs/{job_id}")
async def get_stem_separation_job(job_id: str):
    """Get stem separation job status"""
    from stem_separation_service import get_stem_separation_service

    service = get_stem_separation_service()
    job = service.get_job(job_id)

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    return job


@app.get("/api/stems/jobs/{job_id}/download/{stem_name}")
async def download_stem(job_id: str, stem_name: str):
    """Download a separated stem"""
    from stem_separation_service import get_stem_separation_service

    service = get_stem_separation_service()
    job = service.get_job(job_id)

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job["status"] != "completed":
        raise HTTPException(status_code=400, detail="Job not completed")

    output_stems = job.get("output_stems", {})
    if stem_name not in output_stems:
        raise HTTPException(status_code=404, detail=f"Stem '{stem_name}' not found")

    file_path = Path(output_stems[stem_name])
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Stem file not found")

    return FileResponse(
        path=str(file_path),
        filename=file_path.name,
        media_type="audio/wav",
    )


@app.post("/api/stems/jobs/{job_id}/cancel")
async def cancel_stem_separation_job(job_id: str):
    """Cancel a stem separation job"""
    from stem_separation_service import get_stem_separation_service

    service = get_stem_separation_service()
    success = service.cancel_job(job_id)

    if not success:
        raise HTTPException(status_code=400, detail="Could not cancel job")

    return {"cancelled": True}


@app.get("/api/stems/jobs")
async def list_stem_separation_jobs(limit: int = 20):
    """List recent stem separation jobs"""
    from stem_separation_service import get_stem_separation_service

    service = get_stem_separation_service()
    return {"jobs": service.list_jobs(limit=limit)}


@app.post("/api/stems/unload")
async def unload_stem_model():
    """Unload Demucs model to free memory"""
    from stem_separation_service import get_stem_separation_service

    service = get_stem_separation_service()
    service.unload_model()
    return {"unloaded": True}


# =====================================================
# VOICE CHANGER (ElevenLabs Speech-to-Speech)
# =====================================================


class VoiceChangerRequest(BaseModel):
    input_path: str
    voice_id: str
    model_id: str = "eleven_english_sts_v2"
    stability: float = 0.5
    similarity_boost: float = 0.75
    style: float = 0.0
    remove_background_noise: bool = False


@app.get("/api/voice-changer/providers")
async def get_voice_changer_providers():
    """Get available voice changer providers and their models"""
    from settings_service import settings_service

    # Check if ElevenLabs API key is configured
    has_elevenlabs_key = bool(settings_service.get_api_key("elevenlabs"))

    providers = [
        {
            "id": "elevenlabs",
            "name": "ElevenLabs",
            "description": "Transform any voice while preserving emotion. 30 min/month in Starter plan.",
            "type": "api",
            "ready": has_elevenlabs_key,
            "requires_api_key": "elevenlabs",
            "quota_minutes": 30,
            "models": [
                {
                    "id": "eleven_english_sts_v2",
                    "name": "English V2",
                    "description": "Optimized for English, best quality",
                    "languages": ["en"],
                },
                {
                    "id": "eleven_multilingual_sts_v2",
                    "name": "Multilingual V2",
                    "description": "Supports 29 languages",
                    "languages": ["en", "es", "fr", "de", "it", "pt", "pl", "zh", "ja", "ko", "ar", "hi", "ru"],
                },
            ],
            "default_model": "eleven_english_sts_v2",
        }
    ]

    return {"providers": providers}


@app.get("/api/voice-changer/voices")
async def get_voice_changer_voices():
    """Get available voices for voice changing"""
    from voice_changer import get_voice_changer_service

    service = get_voice_changer_service()
    voices = service.get_available_voices()
    return {"voices": voices}


@app.post("/api/voice-changer/upload")
async def upload_voice_changer_audio(file: UploadFile = File(...)):
    """Upload audio file for voice changing"""
    ext = Path(file.filename).suffix or ".wav"
    unique_filename = f"vc_upload_{uuid.uuid4().hex[:8]}{ext}"
    file_path = TEMP_DIR / unique_filename

    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)

    return {"input_path": str(file_path), "filename": file.filename}


@app.post("/api/voice-changer/convert")
async def start_voice_changer(request: VoiceChangerRequest):
    """Start a voice changing job"""
    from voice_changer import get_voice_changer_service

    service = get_voice_changer_service()

    try:
        job_id = service.create_job(
            input_path=request.input_path,
            voice_id=request.voice_id,
            model_id=request.model_id,
            stability=request.stability,
            similarity_boost=request.similarity_boost,
            style=request.style,
            remove_background_noise=request.remove_background_noise,
        )
        return {"job_id": job_id}
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/voice-changer/jobs/{job_id}")
async def get_voice_changer_job(job_id: str):
    """Get voice changer job status"""
    from voice_changer import get_voice_changer_service

    service = get_voice_changer_service()
    status = service.get_job_status(job_id)

    if "error" in status and status.get("error") == "Job not found":
        raise HTTPException(status_code=404, detail="Job not found")

    return status


@app.get("/api/voice-changer/jobs/{job_id}/download")
async def download_voice_changer_result(job_id: str):
    """Download voice changer result"""
    from voice_changer import get_voice_changer_service

    service = get_voice_changer_service()
    job = service.get_job(job_id)

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job.status != "completed":
        raise HTTPException(status_code=400, detail=f"Job not completed: {job.status}")

    if not job.output_path or not Path(job.output_path).exists():
        raise HTTPException(status_code=404, detail="Output file not found")

    return FileResponse(
        job.output_path,
        media_type="audio/mpeg",
        filename=f"voice_changed_{job_id}.mp3"
    )


# =====================================================
# VOICE ISOLATOR (ElevenLabs Audio Isolation)
# =====================================================


@app.get("/api/voice-isolator/providers")
async def get_voice_isolator_providers():
    """Get available voice isolator providers"""
    from settings_service import settings_service

    has_elevenlabs_key = bool(settings_service.get_api_key("elevenlabs"))

    # Check if Demucs is available for local stem separation
    demucs_available = False
    try:
        import demucs
        demucs_available = True
    except ImportError:
        pass

    providers = [
        {
            "id": "elevenlabs",
            "name": "ElevenLabs",
            "description": "AI-powered noise removal. Isolates speech from music and ambient sounds. 30 min/month in Starter.",
            "type": "api",
            "ready": has_elevenlabs_key,
            "requires_api_key": "elevenlabs",
            "quota_minutes": 30,
            "features": ["noise_removal", "music_removal", "ambient_removal"],
            "supports_fast_mode": False,
        },
        {
            "id": "demucs",
            "name": "Demucs (Local)",
            "description": "Local stem separation. Separates vocals, drums, bass, and other instruments.",
            "type": "local",
            "ready": demucs_available,
            "vram_gb": 4,
            "features": ["vocals", "drums", "bass", "other"],
            "install_command": "pip install demucs",
            "supports_fast_mode": False,
        },
    ]

    return {"providers": providers}


@app.post("/api/voice-isolator/upload")
async def upload_voice_isolator_audio(file: UploadFile = File(...)):
    """Upload audio file for voice isolation"""
    ext = Path(file.filename).suffix or ".wav"
    unique_filename = f"iso_upload_{uuid.uuid4().hex[:8]}{ext}"
    file_path = TEMP_DIR / unique_filename

    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)

    return {"input_path": str(file_path), "filename": file.filename}


@app.post("/api/voice-isolator/isolate")
async def start_voice_isolation(input_path: str = Form(...), provider: str = Form("elevenlabs")):
    """Start a voice isolation job"""
    from voice_isolator import get_voice_isolator_service

    service = get_voice_isolator_service()

    try:
        job_id = service.create_job(input_path=input_path, provider=provider)
        return {"job_id": job_id}
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/voice-isolator/jobs/{job_id}")
async def get_voice_isolator_job(job_id: str):
    """Get voice isolation job status"""
    from voice_isolator import get_voice_isolator_service

    service = get_voice_isolator_service()
    status = service.get_job_status(job_id)

    if "error" in status and status.get("error") == "Job not found":
        raise HTTPException(status_code=404, detail="Job not found")

    return status


@app.get("/api/voice-isolator/jobs/{job_id}/download")
async def download_voice_isolator_result(job_id: str):
    """Download isolated audio"""
    from voice_isolator import get_voice_isolator_service

    service = get_voice_isolator_service()
    job = service.get_job(job_id)

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job.status != "completed":
        raise HTTPException(status_code=400, detail=f"Job not completed: {job.status}")

    if not job.output_path or not Path(job.output_path).exists():
        raise HTTPException(status_code=404, detail="Output file not found")

    return FileResponse(
        job.output_path,
        media_type="audio/mpeg",
        filename=f"isolated_{job_id}.mp3"
    )


# =====================================================
# DUBBING (ElevenLabs Automatic Dubbing)
# =====================================================


class DubbingRequest(BaseModel):
    input_path: str
    target_language: str
    source_language: str = "auto"
    name: Optional[str] = None
    num_speakers: int = 0
    watermark: bool = True
    drop_background_audio: bool = False
    use_profanity_filter: bool = False


@app.get("/api/dubbing/providers")
async def get_dubbing_providers():
    """Get available dubbing providers"""
    from settings_service import settings_service

    has_elevenlabs_key = bool(settings_service.get_api_key("elevenlabs"))

    providers = [
        {
            "id": "elevenlabs",
            "name": "ElevenLabs",
            "description": "AI dubbing with voice cloning. Translates and re-voices in 32+ languages. 6 min video/month in Starter (with watermark).",
            "type": "api",
            "ready": has_elevenlabs_key,
            "requires_api_key": "elevenlabs",
            "quota_minutes": 6,
            "quota_type": "video",
            "watermark_in_starter": True,
            "supported_languages": 32,
            "features": [
                "auto_transcription",
                "translation",
                "voice_cloning",
                "speaker_detection",
                "lip_sync_preservation",
            ],
        }
    ]

    return {"providers": providers}


@app.get("/api/dubbing/languages")
async def get_dubbing_languages():
    """Get supported languages for dubbing"""
    from dubbing import get_dubbing_service

    service = get_dubbing_service()
    return {"languages": service.get_supported_languages()}


@app.post("/api/dubbing/upload")
async def upload_dubbing_file(file: UploadFile = File(...)):
    """Upload video/audio file for dubbing"""
    ext = Path(file.filename).suffix or ".mp4"
    unique_filename = f"dub_upload_{uuid.uuid4().hex[:8]}{ext}"
    file_path = TEMP_DIR / unique_filename

    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)

    return {"input_path": str(file_path), "filename": file.filename}


@app.post("/api/dubbing/start")
async def start_dubbing(request: DubbingRequest):
    """Start a dubbing job"""
    from dubbing import get_dubbing_service

    service = get_dubbing_service()

    try:
        job_id = service.create_job(
            input_path=request.input_path,
            target_language=request.target_language,
            source_language=request.source_language,
            name=request.name,
            num_speakers=request.num_speakers,
            watermark=request.watermark,
            drop_background_audio=request.drop_background_audio,
            use_profanity_filter=request.use_profanity_filter,
        )
        return {"job_id": job_id}
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/dubbing/jobs/{job_id}")
async def get_dubbing_job(job_id: str):
    """Get dubbing job status"""
    from dubbing import get_dubbing_service

    service = get_dubbing_service()
    status = service.get_job_status(job_id)

    if "error" in status and status.get("error") == "Job not found":
        raise HTTPException(status_code=404, detail="Job not found")

    return status


@app.get("/api/dubbing/jobs/{job_id}/download")
async def download_dubbing_result(job_id: str):
    """Download dubbed video/audio"""
    from dubbing import get_dubbing_service

    service = get_dubbing_service()
    job = service.get_job(job_id)

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job.status != "completed":
        raise HTTPException(status_code=400, detail=f"Job not completed: {job.status}")

    if not job.output_path or not Path(job.output_path).exists():
        raise HTTPException(status_code=404, detail="Output file not found")

    # Determine media type
    ext = Path(job.output_path).suffix.lower()
    media_type = "video/mp4" if ext == ".mp4" else "audio/mpeg"

    return FileResponse(
        job.output_path,
        media_type=media_type,
        filename=f"dubbed_{job_id}_{job.target_language}{ext}"
    )


@app.get("/api/dubbing/jobs")
async def list_dubbing_jobs():
    """List all dubbing jobs"""
    from dubbing import get_dubbing_service

    service = get_dubbing_service()
    return {"jobs": service.list_jobs()}


@app.delete("/api/dubbing/jobs/{job_id}")
async def delete_dubbing_job(job_id: str):
    """Delete a dubbing job"""
    from dubbing import get_dubbing_service

    service = get_dubbing_service()
    success = service.delete_job(job_id)

    if not success:
        raise HTTPException(status_code=404, detail="Job not found")

    return {"deleted": True}


# =====================================================
# VOICE TRAINING
# =====================================================


@app.get("/api/voice-training/engines")
async def get_training_engines():
    """Get available voice training engines"""
    from voice_training_service import get_voice_training_service

    service = get_voice_training_service()
    return {"engines": service.get_training_engines()}


@app.post("/api/voice-training/datasets")
async def create_training_dataset(name: str = Form("untitled")):
    """Create a new training dataset"""
    from voice_training_service import get_voice_training_service

    service = get_voice_training_service()
    dataset_id = service.create_dataset(name)
    return {"dataset_id": dataset_id}


@app.post("/api/voice-training/datasets/{dataset_id}/upload")
async def upload_audio_to_dataset(
    dataset_id: str,
    file: UploadFile = File(...),
    transcription: str = Form("")
):
    """Upload audio file to training dataset"""
    from voice_training_service import get_voice_training_service

    service = get_voice_training_service()

    # Save uploaded file to temp
    ext = Path(file.filename).suffix or ".wav"
    temp_path = TEMP_DIR / f"train_upload_{uuid.uuid4().hex[:8]}{ext}"

    with open(temp_path, "wb") as f:
        content = await file.read()
        f.write(content)

    try:
        entry = service.add_audio_to_dataset(
            dataset_id,
            str(temp_path),
            transcription,
            file.filename
        )
        return entry
    finally:
        # Clean up temp file
        temp_path.unlink(missing_ok=True)


@app.get("/api/voice-training/datasets/{dataset_id}/entries")
async def get_dataset_entries(dataset_id: str):
    """Get all entries in a training dataset"""
    from voice_training_service import get_voice_training_service

    service = get_voice_training_service()
    try:
        entries = service.get_dataset_entries(dataset_id)
        return {"entries": entries}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.get("/api/voice-training/datasets/{dataset_id}/stats")
async def get_dataset_stats(dataset_id: str):
    """Get training dataset statistics"""
    from voice_training_service import get_voice_training_service

    service = get_voice_training_service()
    try:
        stats = service.get_dataset_stats(dataset_id)
        return stats
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.put("/api/voice-training/datasets/{dataset_id}/entries/{entry_id}")
async def update_dataset_entry(dataset_id: str, entry_id: str, transcription: str = Form(...)):
    """Update transcription for a dataset entry"""
    from voice_training_service import get_voice_training_service

    service = get_voice_training_service()
    try:
        entry = service.update_transcription(dataset_id, entry_id, transcription)
        return entry
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.delete("/api/voice-training/datasets/{dataset_id}/entries/{entry_id}")
async def delete_dataset_entry(dataset_id: str, entry_id: str):
    """Remove entry from training dataset"""
    from voice_training_service import get_voice_training_service

    service = get_voice_training_service()
    try:
        success = service.remove_from_dataset(dataset_id, entry_id)
        return {"deleted": success}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.post("/api/voice-training/datasets/{dataset_id}/transcribe")
async def transcribe_dataset(
    dataset_id: str,
    entry_id: Optional[str] = None,
    model: str = "base",
    language: str = "auto"
):
    """Transcribe audio files in dataset using Whisper"""
    from voice_training_service import get_voice_training_service

    service = get_voice_training_service()
    try:
        results = service.transcribe_dataset(dataset_id, entry_id, model, language)
        return {"transcriptions": results}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


class StartTrainingRequest(BaseModel):
    dataset_id: str
    voice_name: str
    engine: str = "styletts2"
    epochs: int = 100
    batch_size: int = 4
    learning_rate: float = 1e-4
    language: str = "en"


@app.post("/api/voice-training/start")
async def start_voice_training(request: StartTrainingRequest):
    """Start training a new custom voice"""
    from voice_training_service import get_voice_training_service

    service = get_voice_training_service()
    try:
        job_id = service.start_training(
            dataset_id=request.dataset_id,
            voice_name=request.voice_name,
            engine=request.engine,
            epochs=request.epochs,
            batch_size=request.batch_size,
            learning_rate=request.learning_rate,
            language=request.language,
        )
        return {"job_id": job_id}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=409, detail=str(e))


@app.get("/api/voice-training/status")
async def get_training_status():
    """Get current training job status"""
    from voice_training_service import get_voice_training_service

    service = get_voice_training_service()
    status = service.get_training_status()
    return status if status else {"status": "idle"}


@app.post("/api/voice-training/cancel")
async def cancel_voice_training():
    """Cancel current training job"""
    from voice_training_service import get_voice_training_service

    service = get_voice_training_service()
    success = service.cancel_training()
    return {"cancelled": success}


@app.get("/api/voices/custom")
async def list_custom_voices(engine: Optional[str] = None):
    """List all custom trained voices"""
    from voice_training_service import get_voice_training_service

    service = get_voice_training_service()
    voices = service.get_custom_voices(engine)
    return {"voices": voices}


@app.get("/api/voices/custom/{voice_id}")
async def get_custom_voice(voice_id: str):
    """Get a specific custom trained voice"""
    from voice_training_service import get_voice_training_service

    service = get_voice_training_service()
    voice = service.get_custom_voice(voice_id)
    if not voice:
        raise HTTPException(status_code=404, detail="Voice not found")
    return voice


@app.delete("/api/voices/custom/{voice_id}")
async def delete_custom_voice(voice_id: str):
    """Delete a custom trained voice"""
    from voice_training_service import get_voice_training_service

    service = get_voice_training_service()
    success = service.delete_custom_voice(voice_id)
    if not success:
        raise HTTPException(status_code=404, detail="Voice not found")
    return {"deleted": True}


class UpdateVoiceRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[List[str]] = None


@app.put("/api/voices/custom/{voice_id}")
async def update_custom_voice(voice_id: str, request: UpdateVoiceRequest):
    """Update custom voice metadata"""
    from voice_training_service import get_voice_training_service

    service = get_voice_training_service()
    voice = service.update_custom_voice(
        voice_id,
        name=request.name,
        description=request.description,
        tags=request.tags
    )
    if not voice:
        raise HTTPException(status_code=404, detail="Voice not found")
    return voice


@app.get("/api/voices/custom/{voice_id}/sample")
async def get_custom_voice_sample(voice_id: str):
    """Get sample audio for a custom voice"""
    from voice_training_service import get_voice_training_service

    service = get_voice_training_service()
    voice = service.get_custom_voice(voice_id)

    if not voice or not voice.get("sample_audio_path"):
        raise HTTPException(status_code=404, detail="Sample not found")

    sample_path = Path(voice["sample_audio_path"])
    if not sample_path.exists():
        raise HTTPException(status_code=404, detail="Sample file not found")

    return FileResponse(
        path=str(sample_path),
        media_type="audio/wav",
        filename=f"{voice['name']}_sample.wav"
    )


# =====================================================
# HISTORY API
# =====================================================


@app.get("/api/history")
async def list_history(
    module: Optional[str] = None,
    provider: Optional[str] = None,
    model: Optional[str] = None,
    status: Optional[str] = None,
    favorite: Optional[bool] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
):
    """List history entries with optional filters"""
    from history_service import get_history_service

    service = get_history_service()
    entries = service.list_entries(
        module=module,
        provider=provider,
        model=model,
        status=status,
        favorite=favorite,
        from_date=from_date,
        to_date=to_date,
        search=search,
        limit=limit,
        offset=offset,
    )
    total = service.count_entries(
        module=module,
        provider=provider,
        from_date=from_date,
        to_date=to_date,
    )

    return {
        "entries": [e.to_dict() for e in entries],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@app.get("/api/history/stats")
async def get_history_stats(
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
):
    """Get usage statistics"""
    try:
        from history_service import get_history_service
        from history_db import get_history_db

        service = get_history_service()
        raw_stats = service.get_stats(from_date=from_date, to_date=to_date)
        db = get_history_db()

        # Transform to expected frontend format
        entries_by_module = {
            module: data['count']
            for module, data in raw_stats.get('by_module', {}).items()
        }
        entries_by_provider = {
            provider: data['count']
            for provider, data in raw_stats.get('by_provider', {}).items()
        }

        # Calculate totals from by_module data
        total_duration = sum(
            data.get('total_duration', 0) or 0
            for data in raw_stats.get('by_module', {}).values()
        )
        total_characters = sum(
            data.get('total_characters', 0) or 0
            for data in raw_stats.get('by_module', {}).values()
        )

        # Count favorites
        favorites_count = db.count_entries(status='completed') if hasattr(db, 'count_entries') else 0
        try:
            with db._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT COUNT(*) FROM history_entries WHERE favorite = 1")
                favorites_count = cursor.fetchone()[0]
        except Exception:
            favorites_count = 0

        # Estimate storage (we don't track this in DB, return 0 for now)
        storage_bytes = 0

        return {
            "total_entries": raw_stats.get('total_entries', 0),
            "entries_by_module": entries_by_module,
            "entries_by_provider": entries_by_provider,
            "total_duration_seconds": total_duration,
            "total_characters": total_characters,
            "favorites_count": favorites_count,
            "storage_bytes": storage_bytes,
        }
    except Exception as e:
        print(f"[History] Error in get_history_stats: {e}")
        import traceback
        traceback.print_exc()
        # Return empty stats on error
        return {
            "total_entries": 0,
            "entries_by_module": {},
            "entries_by_provider": {},
            "total_duration_seconds": 0,
            "total_characters": 0,
            "favorites_count": 0,
            "storage_bytes": 0,
        }


@app.get("/api/history/stats/monthly")
async def get_monthly_history_stats(year: int, month: int):
    """Get usage statistics for a specific month"""
    from history_service import get_history_service

    service = get_history_service()
    return service.get_monthly_stats(year, month)


@app.get("/api/history/{entry_id}")
async def get_history_entry(entry_id: str):
    """Get a single history entry"""
    from history_service import get_history_service

    service = get_history_service()
    entry = service.get_entry(entry_id)

    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    return entry.to_dict()


@app.patch("/api/history/{entry_id}")
async def update_history_entry(entry_id: str, updates: dict):
    """Update a history entry (favorite, tags, notes)"""
    from history_service import get_history_service

    service = get_history_service()

    if not service.get_entry(entry_id):
        raise HTTPException(status_code=404, detail="Entry not found")

    success = service.update_entry(entry_id, updates)
    if not success:
        raise HTTPException(status_code=400, detail="Update failed")

    return {"success": True}


@app.delete("/api/history/{entry_id}")
async def delete_history_entry(entry_id: str):
    """Delete a history entry and its files"""
    from history_service import get_history_service

    service = get_history_service()
    success = service.delete_entry(entry_id)

    if not success:
        raise HTTPException(status_code=404, detail="Entry not found")

    return {"success": True}


class BulkDeleteRequest(BaseModel):
    entry_ids: List[str]


@app.post("/api/history/bulk-delete")
async def bulk_delete_history_entries(request: BulkDeleteRequest):
    """Delete multiple history entries at once"""
    from history_service import get_history_service

    service = get_history_service()
    deleted_count = 0
    failed_ids = []

    for entry_id in request.entry_ids:
        try:
            if service.delete_entry(entry_id):
                deleted_count += 1
            else:
                failed_ids.append(entry_id)
        except Exception:
            failed_ids.append(entry_id)

    return {
        "deleted_count": deleted_count,
        "failed_count": len(failed_ids),
        "failed_ids": failed_ids,
    }


@app.post("/api/history/{entry_id}/favorite")
async def toggle_history_favorite(entry_id: str):
    """Toggle favorite status of a history entry"""
    from history_service import get_history_service

    service = get_history_service()
    success = service.toggle_favorite(entry_id)

    if not success:
        raise HTTPException(status_code=404, detail="Entry not found")

    entry = service.get_entry(entry_id)
    return {"success": True, "favorite": entry.favorite if entry else False}


@app.get("/api/history/{entry_id}/download/{file_type}")
async def download_history_file(entry_id: str, file_type: str):
    """Download a file from a history entry

    file_type can be: input_audio, output_audio, input_video, output_video
    """
    from history_service import get_history_service

    service = get_history_service()
    entry = service.get_entry(entry_id)

    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    path_map = {
        "input_audio": entry.input_audio_path,
        "output_audio": entry.output_audio_path,
        "input_video": entry.input_video_path,
        "output_video": entry.output_video_path,
    }

    file_path = path_map.get(file_type)
    if not file_path:
        raise HTTPException(status_code=404, detail=f"No {file_type} file for this entry")

    file_path = Path(file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")

    # Determine media type
    suffix = file_path.suffix.lower()
    media_types = {
        ".mp3": "audio/mpeg",
        ".wav": "audio/wav",
        ".webm": "audio/webm",
        ".ogg": "audio/ogg",
        ".m4a": "audio/m4a",
        ".mp4": "video/mp4",
        ".mov": "video/quicktime",
    }
    media_type = media_types.get(suffix, "application/octet-stream")

    return FileResponse(
        path=str(file_path),
        media_type=media_type,
        filename=file_path.name,
    )


@app.get("/api/history/modules/list")
async def get_history_modules():
    """Get list of modules with history entries"""
    try:
        from history_db import get_history_db

        db = get_history_db()

        with db._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT DISTINCT module, COUNT(*) as count
                FROM history_entries
                GROUP BY module
                ORDER BY count DESC
            """)
            modules = [{"module": row[0], "count": row[1]} for row in cursor.fetchall()]

        return {"modules": modules}
    except Exception as e:
        print(f"[History] Error in get_history_modules: {e}")
        import traceback
        traceback.print_exc()
        # Return empty list on error instead of 500
        return {"modules": []}


# --- System Audio Loopback & Live Transcription ---

# Active loopback sessions
_loopback_sessions: dict = {}


@app.get("/api/loopback/status")
async def get_loopback_status():
    """Get loopback capture availability and status."""
    from loopback_service import get_loopback_service, is_loopback_available

    available, message = is_loopback_available()
    service = get_loopback_service()

    return {
        "available": available,
        "message": message,
        "state": service.state.value,
        "error": service.error_message,
    }


@app.get("/api/loopback/devices")
async def get_loopback_devices():
    """Get list of available audio output devices for loopback capture."""
    from loopback_service import get_loopback_service

    service = get_loopback_service()
    devices = service.get_loopback_devices()

    return {
        "devices": [
            {
                "index": d.index,
                "name": d.name,
                "host_api": d.host_api,
                "channels": d.channels,
                "sample_rate": d.sample_rate,
                "is_loopback": d.is_loopback,
                "is_default": d.is_default,
            }
            for d in devices
        ]
    }


class LoopbackStartRequest(BaseModel):
    device_index: Optional[int] = None
    enable_diarization: bool = True
    enable_translation: bool = False
    source_language: str = "auto"
    target_language: str = "en"


@app.post("/api/loopback/start")
async def start_loopback_capture(request: LoopbackStartRequest):
    """Start capturing system audio."""
    from loopback_service import get_loopback_service

    service = get_loopback_service()

    if service.state.value in ("capturing", "starting"):
        return {"success": True, "message": "Already capturing", "state": service.state.value}

    success = service.start(device_index=request.device_index)

    if not success:
        raise HTTPException(400, service.error_message or "Failed to start loopback capture")

    return {
        "success": True,
        "message": "Loopback capture started",
        "state": service.state.value,
    }


@app.post("/api/loopback/stop")
async def stop_loopback_capture():
    """Stop capturing system audio."""
    from loopback_service import get_loopback_service

    service = get_loopback_service()
    service.stop()

    return {"success": True, "message": "Loopback capture stopped", "state": service.state.value}


@app.post("/api/loopback/pause")
async def pause_loopback_capture():
    """Pause loopback capture."""
    from loopback_service import get_loopback_service

    service = get_loopback_service()
    service.pause()

    return {"success": True, "state": service.state.value}


@app.post("/api/loopback/resume")
async def resume_loopback_capture():
    """Resume loopback capture."""
    from loopback_service import get_loopback_service

    service = get_loopback_service()
    success = service.resume()

    return {"success": success, "state": service.state.value}


@app.websocket("/ws/loopback")
async def loopback_websocket(websocket: WebSocket):
    """
    WebSocket endpoint for real-time loopback transcription.

    Messages from server:
    - {"type": "state", "state": "capturing|paused|stopped|error"}
    - {"type": "transcript", "text": "...", "speaker_id": 1, "speaker_name": "Speaker 1", "is_final": true}
    - {"type": "translation", "original": "...", "translated": "...", "source_lang": "es", "target_lang": "en"}
    - {"type": "error", "message": "..."}

    Messages from client:
    - {"action": "start", "device_index": null, "enable_diarization": true, "enable_translation": false, "source_language": "auto", "target_language": "en"}
    - {"action": "stop"}
    - {"action": "pause"}
    - {"action": "resume"}
    - {"action": "set_translation", "enabled": true, "target_language": "es"}
    """
    await websocket.accept()

    session_id = id(websocket)
    _loopback_sessions[session_id] = {
        "websocket": websocket,
        "enable_diarization": True,
        "enable_translation": False,
        "source_language": "auto",
        "target_language": "en",
        "running": True,
    }

    from loopback_service import get_loopback_service, LoopbackState
    from realtime_diarization import get_realtime_diarization_service

    loopback_service = get_loopback_service()
    diarization_service = get_realtime_diarization_service()

    # Get STT provider for transcription
    stt_provider = None
    try:
        from stt_provider_factory import get_stt_provider
        stt_settings = settings_service.get("stt", {})
        provider_name = stt_settings.get("provider", "faster-whisper")
        stt_provider = get_stt_provider(provider_name)
    except Exception as e:
        print(f"[Loopback WS] Failed to get STT provider: {e}")

    async def send_message(msg: dict):
        """Send message to websocket."""
        try:
            await websocket.send_json(msg)
        except Exception:
            pass

    async def process_audio_chunk(chunk):
        """Process an audio chunk: transcribe and optionally diarize/translate."""
        session = _loopback_sessions.get(session_id)
        if not session or not session.get("running"):
            return

        try:
            # Save chunk to temp file for transcription
            temp_path = loopback_service.chunk_to_temp_file(chunk)

            try:
                # Transcribe
                if stt_provider:
                    result = await asyncio.get_event_loop().run_in_executor(
                        None,
                        lambda: stt_provider.transcribe(
                            str(temp_path),
                            language=session.get("source_language", "auto") if session.get("source_language") != "auto" else None
                        )
                    )
                    text = result.get("text", "").strip()
                    detected_language = result.get("language", "en")
                else:
                    text = ""
                    detected_language = "en"

                if not text:
                    return

                # Diarization
                speaker_id = 0
                speaker_name = "Speaker"
                confidence = 0.0

                if session.get("enable_diarization"):
                    try:
                        speaker_id, speaker_name, confidence = diarization_service.identify_speaker(
                            chunk.data,
                            sample_rate=chunk.sample_rate,
                            channels=chunk.channels,
                            sample_width=chunk.sample_width
                        )
                    except Exception as e:
                        print(f"[Loopback WS] Diarization error: {e}")

                # Send transcript
                await send_message({
                    "type": "transcript",
                    "text": text,
                    "speaker_id": speaker_id,
                    "speaker_name": speaker_name,
                    "confidence": confidence,
                    "timestamp": chunk.timestamp,
                    "duration": chunk.duration_seconds,
                    "language": detected_language,
                    "is_final": True,
                })

                # Translation
                if session.get("enable_translation"):
                    target_lang = session.get("target_language", "en")
                    if detected_language != target_lang:
                        try:
                            from translation_service import get_translation_service
                            translation_svc = get_translation_service()
                            translated = await asyncio.get_event_loop().run_in_executor(
                                None,
                                lambda: translation_svc.translate(text, detected_language, target_lang)
                            )
                            await send_message({
                                "type": "translation",
                                "original": text,
                                "translated": translated,
                                "source_lang": detected_language,
                                "target_lang": target_lang,
                                "speaker_id": speaker_id,
                                "speaker_name": speaker_name,
                            })
                        except Exception as e:
                            print(f"[Loopback WS] Translation error: {e}")

            finally:
                # Cleanup temp file
                try:
                    temp_path.unlink(missing_ok=True)
                except Exception:
                    pass

        except Exception as e:
            print(f"[Loopback WS] Process chunk error: {e}")
            await send_message({"type": "error", "message": str(e)})

    # Background task to process audio chunks
    async def chunk_processor():
        session = _loopback_sessions.get(session_id)
        while session and session.get("running"):
            if loopback_service.state == LoopbackState.CAPTURING:
                chunk = loopback_service.get_chunk(timeout=0.5)
                if chunk:
                    await process_audio_chunk(chunk)
            else:
                await asyncio.sleep(0.1)
            session = _loopback_sessions.get(session_id)

    # Start chunk processor
    processor_task = asyncio.create_task(chunk_processor())

    try:
        # Send initial state
        await send_message({"type": "state", "state": loopback_service.state.value})

        while True:
            try:
                data = await websocket.receive_json()
                action = data.get("action")

                if action == "start":
                    device_index = data.get("device_index")
                    session = _loopback_sessions.get(session_id, {})
                    session["enable_diarization"] = data.get("enable_diarization", True)
                    session["enable_translation"] = data.get("enable_translation", False)
                    session["source_language"] = data.get("source_language", "auto")
                    session["target_language"] = data.get("target_language", "en")

                    # Reset diarization for new session
                    diarization_service.reset()

                    success = loopback_service.start(device_index=device_index)
                    await send_message({
                        "type": "state",
                        "state": loopback_service.state.value,
                        "error": loopback_service.error_message if not success else None
                    })

                elif action == "stop":
                    loopback_service.stop()
                    await send_message({"type": "state", "state": loopback_service.state.value})

                elif action == "pause":
                    loopback_service.pause()
                    await send_message({"type": "state", "state": loopback_service.state.value})

                elif action == "resume":
                    loopback_service.resume()
                    await send_message({"type": "state", "state": loopback_service.state.value})

                elif action == "set_translation":
                    session = _loopback_sessions.get(session_id, {})
                    session["enable_translation"] = data.get("enabled", False)
                    session["target_language"] = data.get("target_language", session.get("target_language", "en"))
                    await send_message({
                        "type": "translation_config",
                        "enabled": session["enable_translation"],
                        "target_language": session["target_language"]
                    })

                elif action == "get_speakers":
                    speakers = diarization_service.get_speakers()
                    await send_message({
                        "type": "speakers",
                        "speakers": [
                            {"id": s.id, "name": s.name, "segment_count": s.segment_count}
                            for s in speakers
                        ]
                    })

                elif action == "rename_speaker":
                    speaker_id = data.get("speaker_id")
                    new_name = data.get("name")
                    if speaker_id and new_name:
                        diarization_service.rename_speaker(speaker_id, new_name)
                        await send_message({"type": "speaker_renamed", "speaker_id": speaker_id, "name": new_name})

            except WebSocketDisconnect:
                break
            except Exception as e:
                print(f"[Loopback WS] Error: {e}")
                await send_message({"type": "error", "message": str(e)})

    finally:
        # Cleanup
        session = _loopback_sessions.pop(session_id, None)
        if session:
            session["running"] = False

        processor_task.cancel()
        try:
            await processor_task
        except asyncio.CancelledError:
            pass

        # Stop loopback if no other sessions
        if not _loopback_sessions:
            loopback_service.stop()


# =====================================================
# DIAGNOSTICS ENDPOINTS (Dev Mode)
# =====================================================

# Check if DEV_MODE is enabled
DEV_MODE = os.environ.get("DEV_MODE", "false").lower() == "true"


class DiagnosticsEventAppend(BaseModel):
    """Request model for appending frontend events"""
    events: List[dict]


@app.get("/api/diagnostics/status")
async def get_diagnostics_status():
    """Get current diagnostics status"""
    from diagnostics import get_event_store

    store = get_event_store()
    errors_grouped = store.get_errors_by_fingerprint()

    return {
        "dev_mode": DEV_MODE,
        "events_count": len(store.get_events(limit=10000)),
        "errors_count": len(store.get_errors(limit=10000)),
        "unique_errors": len(errors_grouped),
    }


@app.get("/api/diagnostics/events")
async def get_diagnostics_events(
    limit: int = 100,
    job_id: Optional[str] = None,
    module: Optional[str] = None,
    level: Optional[str] = None,
):
    """Get recent events"""
    if not DEV_MODE:
        raise HTTPException(403, "Dev mode not enabled")

    from diagnostics.bundle import get_recent_events

    events = get_recent_events(limit=limit, job_id=job_id, module=module)
    return {"events": events, "count": len(events)}


@app.get("/api/diagnostics/errors")
async def get_diagnostics_errors(limit: int = 100):
    """Get recent errors"""
    if not DEV_MODE:
        raise HTTPException(403, "Dev mode not enabled")

    from diagnostics.bundle import get_recent_errors, get_errors_by_fingerprint

    errors = get_recent_errors(limit=limit)
    grouped = get_errors_by_fingerprint()

    return {
        "errors": errors,
        "count": len(errors),
        "grouped": list(grouped.values()),
        "unique_count": len(grouped),
    }


@app.post("/api/diagnostics/events")
async def append_diagnostics_events(request: DiagnosticsEventAppend):
    """Append events from frontend"""
    if not DEV_MODE:
        raise HTTPException(403, "Dev mode not enabled")

    from diagnostics import get_event_store

    store = get_event_store()
    for event in request.events:
        # Ensure required fields
        event.setdefault("source", "frontend")
        event.setdefault("timestamp", datetime.datetime.now().isoformat())
        store.add_event(event)

    return {"appended": len(request.events)}


@app.post("/api/diagnostics/bundle")
async def create_diagnostics_bundle_endpoint(
    job_id: Optional[str] = None,
    last_n_events: int = 100,
):
    """Generate and download diagnostic bundle"""
    if not DEV_MODE:
        raise HTTPException(403, "Dev mode not enabled")

    from diagnostics.bundle import create_diagnostic_bundle

    try:
        zip_path = create_diagnostic_bundle(
            job_id=job_id,
            last_n_events=last_n_events,
        )
        return FileResponse(
            path=str(zip_path),
            filename=zip_path.name,
            media_type="application/zip",
        )
    except Exception as e:
        raise HTTPException(500, f"Failed to create bundle: {e}")


@app.get("/api/diagnostics/bug-report")
async def get_bug_report():
    """Get formatted bug report for the last error"""
    if not DEV_MODE:
        raise HTTPException(403, "Dev mode not enabled")

    from diagnostics.bundle import get_last_error_report

    report = get_last_error_report()
    if not report:
        return {"report": None, "message": "No errors recorded"}

    return {"report": report}


@app.get("/api/diagnostics/system")
async def get_diagnostics_system():
    """Get system information"""
    if not DEV_MODE:
        raise HTTPException(403, "Dev mode not enabled")

    from diagnostics.bundle import get_system_info, get_versions_info

    return {
        "system": get_system_info(),
        "versions": get_versions_info(),
    }


# =====================================================
# STATIC FRONTEND
# =====================================================

# Serve static frontend in production
# Check both locations: ui/frontend/out (dev) and electron/frontend (when run via bat)
FRONTEND_DIR = BASE_DIR / "ui" / "frontend" / "out"
ELECTRON_FRONTEND_DIR = BASE_DIR / "electron" / "frontend"

# Prefer electron frontend if it exists (when run via ChatterboxUI.bat)
if ELECTRON_FRONTEND_DIR.exists():
    FRONTEND_DIR = ELECTRON_FRONTEND_DIR

if FRONTEND_DIR.exists():
    # Mount static files - API routes are matched BEFORE mounts in FastAPI
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn
    # Note: Large file uploads (up to 5GB) are handled via streaming in chunks
    # See upload_for_transcription endpoint - no body size limit needed
    
    # We bind to 0.0.0.0 to:
    # 1. Allow access from other devices (remote control)
    # 2. Trigger the OS "Allow Network Access" (Firewall) prompt on first run
    print("[Startup] Binding to 0.0.0.0 to allow network access (Public/Private networks)")
    uvicorn.run(app, host="0.0.0.0", port=8000)
