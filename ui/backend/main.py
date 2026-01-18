"""FastAPI backend for Whisperall"""
import os
import shutil
import uuid
import json
import asyncio
import subprocess
import sys
import datetime
from pathlib import Path
from typing import Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, UploadFile, File, Form, BackgroundTasks, Request
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
            if status in ("pending", "transcribing", "diarizing", "cleaning", "extracting_audio"):
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

    # Pre-load default model on startup (optional, can be slow)
    # get_tts_service()
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
    model: str = "multilingual"  # original, turbo, multilingual
    language: str = "en"
    voice_id: Optional[str] = None  # ID of saved voice
    temperature: float = 0.8
    exaggeration: float = 0.5
    cfg_weight: float = 0.5
    top_p: float = 0.95
    top_k: int = 1000
    speed: float = 1.0
    seed: Optional[int] = None
    output_format: str = "wav"  # wav, mp3, flac


class GenerateBookRequest(BaseModel):
    chapters: list[dict]  # [{number, title, content}]
    model: str = "multilingual"
    language: str = "en"
    voice_id: Optional[str] = None
    temperature: float = 0.8
    exaggeration: float = 0.5
    cfg_weight: float = 0.5
    speed: float = 1.0
    output_format: str = "wav"


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
            raise Exception(f"pip install failed: {result.stderr}")

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

def get_history_file():
    """Get path to history file"""
    return HISTORY_DIR / "history.json"


def load_history() -> list:
    """Load generation history"""
    history_file = get_history_file()
    if history_file.exists():
        with open(history_file) as f:
            return json.load(f)
    return []


def save_history(history: list):
    """Save generation history"""
    history_file = get_history_file()
    with open(history_file, "w") as f:
        json.dump(history, f, indent=2)


def save_history_entry(entry: dict):
    """Add a new entry to history"""
    history = load_history()
    history.insert(0, entry)  # Add at beginning (most recent first)
    # Keep only last 100 entries
    history = history[:100]
    save_history(history)


@app.get("/api/history")
async def get_history_list(limit: int = 50, offset: int = 0):
    """Get generation history"""
    history = load_history()

    # Verify files still exist
    valid_history = []
    for entry in history:
        output_path = OUTPUT_DIR / entry["filename"]
        if output_path.exists():
            entry["file_exists"] = True
            entry["file_size_bytes"] = output_path.stat().st_size
            entry["file_size_mb"] = round(output_path.stat().st_size / (1024 * 1024), 2)
        else:
            entry["file_exists"] = False
        valid_history.append(entry)

    total = len(valid_history)
    paginated = valid_history[offset:offset + limit]

    return {
        "history": paginated,
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@app.get("/api/history/{history_id}")
async def get_history_entry(history_id: str):
    """Get a specific history entry"""
    history = load_history()
    entry = next((h for h in history if h["id"] == history_id), None)
    if not entry:
        raise HTTPException(404, "History entry not found")

    # Check if file still exists
    output_path = OUTPUT_DIR / entry["filename"]
    entry["file_exists"] = output_path.exists()
    if entry["file_exists"]:
        entry["file_size_bytes"] = output_path.stat().st_size

    return entry


@app.delete("/api/history/{history_id}")
async def delete_history_entry(history_id: str, delete_file: bool = True):
    """Delete a history entry and optionally its audio file"""
    history = load_history()

    entry = next((h for h in history if h["id"] == history_id), None)
    if not entry:
        raise HTTPException(404, "History entry not found")

    # Delete audio file if requested
    freed_space = 0
    if delete_file:
        output_path = OUTPUT_DIR / entry["filename"]
        if output_path.exists():
            freed_space = output_path.stat().st_size
            output_path.unlink()

    # Remove from history
    history = [h for h in history if h["id"] != history_id]
    save_history(history)

    return {
        "message": "History entry deleted",
        "id": history_id,
        "file_deleted": delete_file,
        "freed_bytes": freed_space,
    }


@app.delete("/api/history")
async def clear_history(delete_files: bool = False):
    """Clear all history entries"""
    history = load_history()
    freed_space = 0

    if delete_files:
        for entry in history:
            output_path = OUTPUT_DIR / entry["filename"]
            if output_path.exists():
                freed_space += output_path.stat().st_size
                output_path.unlink()

    save_history([])

    return {
        "message": "History cleared",
        "entries_deleted": len(history),
        "files_deleted": delete_files,
        "freed_bytes": freed_space,
    }


@app.post("/api/generate")
async def generate_audio(request: GenerateRequest):
    """Generate audio from text"""
    service = get_tts_service()

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

    # Chunk the text
    chunks = chunk_text(request.text, max_chars=250)

    # Generate audio for each chunk
    audio_segments = []
    for chunk in chunks:
        audio, sr = service.generate(
            text=chunk,
            model_type=request.model,
            language_id=request.language,
            audio_prompt_path=voice_path,
            temperature=request.temperature,
            exaggeration=request.exaggeration,
            cfg_weight=request.cfg_weight,
            top_p=request.top_p,
            top_k=request.top_k,
            seed=request.seed,
        )
        audio_segments.append(audio)

    # Concatenate segments
    final_audio = concatenate_audio(audio_segments, sample_rate=service.SAMPLE_RATE)

    # Apply speed change if needed
    if request.speed != 1.0:
        final_audio = change_speed(final_audio, service.SAMPLE_RATE, request.speed)

    # Save output
    output_id = str(uuid.uuid4())[:8]
    output_path = OUTPUT_DIR / f"{output_id}.wav"
    service.save_audio(final_audio, str(output_path), service.SAMPLE_RATE)

    # Convert format if needed
    if request.output_format != "wav":
        converted_path = convert_format(
            str(output_path),
            str(OUTPUT_DIR / f"{output_id}.{request.output_format}"),
            request.output_format
        )
        output_path.unlink()  # Remove WAV
        output_path = Path(converted_path)

    # Save to history
    from datetime import datetime
    history_entry = {
        "id": output_id,
        "text": request.text[:500],  # Truncate long texts
        "text_full": request.text,
        "model": request.model,
        "language": request.language,
        "voice_id": request.voice_id,
        "temperature": request.temperature,
        "exaggeration": request.exaggeration,
        "cfg_weight": request.cfg_weight,
        "speed": request.speed,
        "output_format": request.output_format,
        "filename": output_path.name,
        "output_url": f"/output/{output_path.name}",
        "created_at": datetime.now().isoformat(),
        "chunks_processed": len(chunks),
    }
    save_history_entry(history_entry)

    return {
        "success": True,
        "output_url": f"/output/{output_path.name}",
        "filename": output_path.name,
        "chunks_processed": len(chunks),
    }


@app.post("/api/generate-preview")
async def generate_preview(request: GenerateRequest):
    """Generate preview (first chunk only) for quick testing"""
    service = get_tts_service()

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

    audio, sr = service.generate(
        text=first_chunk,
        model_type=request.model,
        language_id=request.language,
        audio_prompt_path=voice_path,
        temperature=request.temperature,
        exaggeration=request.exaggeration,
        cfg_weight=request.cfg_weight,
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
    service = get_tts_service()
    jobs[job_id]["status"] = "processing"

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

    try:
        for i, chapter in enumerate(request.chapters):
            jobs[job_id]["current_chapter"] = i + 1

            # Chunk the chapter content
            chunks = chunk_text(chapter["content"], max_chars=250)

            # Generate audio for each chunk
            audio_segments = []
            for j, chunk in enumerate(chunks):
                audio, sr = service.generate(
                    text=chunk,
                    model_type=request.model,
                    language_id=request.language,
                    audio_prompt_path=voice_path,
                    temperature=request.temperature,
                    exaggeration=request.exaggeration,
                    cfg_weight=request.cfg_weight,
                )
                audio_segments.append(audio)

                # Update progress
                chunk_progress = (j + 1) / len(chunks)
                chapter_progress = i / len(request.chapters)
                jobs[job_id]["progress"] = int((chapter_progress + chunk_progress / len(request.chapters)) * 100)

            # Concatenate chapter audio
            chapter_audio = concatenate_audio(audio_segments, sample_rate=service.SAMPLE_RATE)

            # Apply speed change if needed
            if request.speed != 1.0:
                chapter_audio = change_speed(chapter_audio, service.SAMPLE_RATE, request.speed)

            # Save chapter
            chapter_filename = f"chapter_{chapter['number']:02d}_{job_id}.wav"
            chapter_path = OUTPUT_DIR / chapter_filename
            service.save_audio(chapter_audio, str(chapter_path), service.SAMPLE_RATE)

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
    try:
        raw_text, meta = stt_service.transcribe(temp_path, language=language, prompt=prompt)
    except Exception as exc:
        raise HTTPException(500, f"STT transcription failed: {exc}") from exc
    finally:
        if temp_path.exists():
            temp_path.unlink()

    stt_cfg = settings_service.settings.stt
    formatter = SmartFormatter(
        enable_punctuation=stt_cfg.auto_punctuation or stt_cfg.smart_formatting,
        enable_backtrack=stt_cfg.backtrack,
        enable_fillers=stt_cfg.filler_removal,
    )
    formatted_text = formatter.format_text(raw_text, list_dictionary_entries(), list_snippet_entries())

    stt_sessions.pop(session_id, None)

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
        raise HTTPException(500, f"STT partial failed: {exc}") from exc
    finally:
        if temp_path.exists():
            temp_path.unlink()

    if raw_text:
        existing = stt_sessions[session_id].get("partial_text", "")
        combined = f"{existing} {raw_text}".strip() if existing else raw_text.strip()
        stt_sessions[session_id]["partial_text"] = combined
    else:
        combined = stt_sessions[session_id].get("partial_text", "")

    return {
        "session_id": session_id,
        "text": raw_text.strip(),
        "partial_text": combined,
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
    output_path = TEMP_DIR / f"reader_{output_id}.wav"
    reader.synthesize_to_file(
        text=request.text,
        output_path=output_path,
        language=request.language,
        voice=request.voice,
        speed=request.speed
    )
    return {
        "output_url": f"/temp/{output_path.name}",
        "filename": output_path.name,
    }


# =====================================================
# AI EDIT ENDPOINTS
# =====================================================

@app.post("/api/ai-edit")
async def ai_edit(request: AIEditRequest):
    service = get_ai_edit_service()
    edited_text, meta = service.edit(request.text, request.command, provider=request.provider)
    return {"text": edited_text, "meta": meta}


# =====================================================
# TRANSLATION ENDPOINTS
# =====================================================

@app.post("/api/translate")
async def translate_text(request: TranslateRequest):
    service = get_translation_service()
    translated, meta = service.translate(
        request.text,
        source_lang=request.source_lang,
        target_lang=request.target_lang,
        provider=request.provider
    )
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
        # Clean up cancellation tracking
        cancelled_jobs.discard(job_id)
        # Clean up temp audio if extracted from video
        if audio_path != file_path and audio_path.exists():
            try:
                audio_path.unlink()
            except Exception:
                pass


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
        transcription_jobs[job_id]["progress"] = round(pct, 1)
        transcription_jobs[job_id]["current_step"] = msg
        _save_transcription_job(job_id, transcription_jobs[job_id])

    temp_audio_path = None

    try:
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

    if status in ("completed", "error", "cancelled", "paused", "interrupted"):
        return {"paused": False, "reason": f"Job already {status}"}

    # Mark as paused (uses same cancellation mechanism internally)
    cancelled_jobs.add(job_id)
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


async def download_model_task(model_id: str, manager):
    """Background task for model download"""
    def progress_callback(progress: float):
        download_progress[model_id]["progress"] = int(progress)

    try:
        manager.download_model(model_id, progress_callback)
        download_progress[model_id]["status"] = "completed"
        download_progress[model_id]["progress"] = 100
    except Exception as e:
        download_progress[model_id]["status"] = "error"
        download_progress[model_id]["error"] = str(e)


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


@app.get("/api/settings/{path:path}")
async def get_setting(path: str):
    """Get a specific setting by path (e.g., 'providers.tts.selected')"""
    value = settings_service.get(path)
    if value is None:
        raise HTTPException(404, f"Setting not found: {path}")
    return {"path": path, "value": value}


@app.put("/api/settings/{path:path}")
async def update_setting(path: str, value: dict):
    """Update a specific setting"""
    success = settings_service.set(path, value.get("value"))
    if not success:
        raise HTTPException(400, f"Could not update setting: {path}")
    return {"path": path, "value": value.get("value"), "updated": True}


@app.post("/api/settings/reset")
async def reset_settings(section: Optional[str] = None):
    """Reset settings to defaults (optionally just one section)"""
    settings_service.reset_to_defaults(section)
    return {"message": f"Settings reset {'for ' + section if section else 'completely'}"}


# =====================================================
# API KEYS ENDPOINTS
# =====================================================

class APIKeyUpdate(BaseModel):
    provider: str
    key: str


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
async def set_api_key(provider: str, data: APIKeyUpdate):
    """Set API key for a provider"""
    success = settings_service.set_api_key(provider, data.key)
    if not success:
        raise HTTPException(400, f"Could not set API key for: {provider}")
    return {"provider": provider, "updated": True}


@app.post("/api/settings/api-keys/{provider}/test")
async def test_api_key(provider: str):
    """Test if an API key is valid"""
    key = settings_service.get_api_key(provider)
    if not key:
        return {"provider": provider, "valid": False, "error": "No API key configured"}

    # Test the key based on provider
    try:
        if provider == "openai":
            import openai
            client = openai.OpenAI(api_key=key)
            client.models.list()
            return {"provider": provider, "valid": True}

        elif provider == "elevenlabs":
            import requests
            resp = requests.get(
                "https://api.elevenlabs.io/v1/user",
                headers={"xi-api-key": key}
            )
            if resp.status_code == 200:
                return {"provider": provider, "valid": True, "user": resp.json().get("first_name")}
            return {"provider": provider, "valid": False, "error": f"HTTP {resp.status_code}"}

        elif provider == "gemini":
            import requests
            resp = requests.get(
                f"https://generativelanguage.googleapis.com/v1beta/models?key={key}"
            )
            return {"provider": provider, "valid": resp.status_code == 200}

        elif provider == "claude":
            import anthropic
            client = anthropic.Anthropic(api_key=key)
            # Just check if client initializes
            return {"provider": provider, "valid": True}

        elif provider == "deepl":
            import requests
            resp = requests.get(
                "https://api-free.deepl.com/v2/usage",
                headers={"Authorization": f"DeepL-Auth-Key {key}"}
            )
            return {"provider": provider, "valid": resp.status_code == 200}

        else:
            return {"provider": provider, "valid": False, "error": "Unknown provider"}

    except ImportError as e:
        return {"provider": provider, "valid": False, "error": f"Missing library: {str(e)}"}
    except Exception as e:
        return {"provider": provider, "valid": False, "error": str(e)}


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

    # Also update provider-specific config if provided
    if "config" in data:
        settings_service.set(f"providers.{function}.{provider.replace('-', '_')}", data["config"])

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
        }
    }

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
    api_providers = [
        {"id": "openai", "name": "OpenAI", "key_path": "api_keys.openai", "features": ["TTS", "STT", "AI Edit"]},
        {"id": "elevenlabs", "name": "ElevenLabs", "key_path": "api_keys.elevenlabs", "features": ["TTS"]},
        {"id": "anthropic", "name": "Anthropic Claude", "key_path": "api_keys.anthropic", "features": ["AI Edit"]},
        {"id": "deepl", "name": "DeepL", "key_path": "api_keys.deepl", "features": ["Translation"]},
        {"id": "deepgram", "name": "Deepgram", "key_path": "api_keys.deepgram", "features": ["STT"]},
    ]

    for provider in api_providers:
        api_key = settings_service.get(provider["key_path"])
        result["api_providers"][provider["id"]] = {
            "name": provider["name"],
            "configured": bool(api_key),
            "key_preview": f"{api_key[:8]}..." if api_key and len(api_key) > 8 else None,
            "features": provider["features"],
        }

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

    valid_providers = ["openai", "elevenlabs", "anthropic", "deepl", "deepgram", "huggingface"]
    if provider not in valid_providers:
        raise HTTPException(400, f"Invalid provider. Valid: {valid_providers}")

    key_path = f"api_keys.{provider}"

    if api_key:
        settings_service.set(key_path, api_key)
        # For HuggingFace, also reset diarization service
        if provider == "huggingface":
            diarization = get_diarization_service()
            diarization._pyannote_available = None
            diarization._pyannote_pipeline = None
            diarization._pyannote_error = None
            diarization._torchcodec_available = None
            diarization._torchcodec_error = None
    else:
        # Clear the key
        settings_service.set(key_path, None)

    return {"provider": provider, "configured": bool(api_key)}


@app.delete("/api/settings/api-key/{provider}")
async def delete_api_key(provider: str):
    """Remove API key for a provider."""
    valid_providers = ["openai", "elevenlabs", "anthropic", "deepl", "deepgram", "huggingface"]
    if provider not in valid_providers:
        raise HTTPException(400, f"Invalid provider. Valid: {valid_providers}")

    settings_service.set(f"api_keys.{provider}", None)
    return {"provider": provider, "removed": True}


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


# Serve static frontend in production
FRONTEND_DIR = BASE_DIR / "ui" / "frontend" / "out"
if FRONTEND_DIR.exists():
    # Serve static files
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn
    # Note: Large file uploads (up to 5GB) are handled via streaming in chunks
    # See upload_for_transcription endpoint - no body size limit needed
    uvicorn.run(app, host="0.0.0.0", port=8000)
