"""Dubbing Service - ElevenLabs Dubbing API integration

Uses the dubbing feature included in ElevenLabs Starter plan (6 min video/month).
Automatically translates and dubs video/audio to different languages while
preserving speaker voices, emotions, and timing.

Supported languages: 32+ including EN, ES, FR, DE, IT, PT, ZH, JA, KO, AR, HI, etc.
"""

import requests
import tempfile
import time
import uuid
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional, Dict, Any, List
from threading import Thread

# Diagnostics
from diagnostics import log_function, error_context, log_info, log_error, set_job_id
from diagnostics.error_codes import ErrorCode


# Supported target languages for dubbing
SUPPORTED_LANGUAGES = {
    "en": "English",
    "es": "Spanish",
    "fr": "French",
    "de": "German",
    "it": "Italian",
    "pt": "Portuguese",
    "pl": "Polish",
    "zh": "Chinese",
    "ja": "Japanese",
    "ko": "Korean",
    "ar": "Arabic",
    "hi": "Hindi",
    "ru": "Russian",
    "nl": "Dutch",
    "sv": "Swedish",
    "da": "Danish",
    "fi": "Finnish",
    "no": "Norwegian",
    "tr": "Turkish",
    "cs": "Czech",
    "el": "Greek",
    "he": "Hebrew",
    "id": "Indonesian",
    "ms": "Malay",
    "th": "Thai",
    "vi": "Vietnamese",
    "uk": "Ukrainian",
    "ro": "Romanian",
    "hu": "Hungarian",
    "bg": "Bulgarian",
    "ta": "Tamil",
    "te": "Telugu",
}


@dataclass
class DubbingJob:
    """Represents a dubbing job"""
    id: str
    elevenlabs_id: Optional[str] = None  # ID from ElevenLabs API
    status: str = "pending"  # pending, uploading, dubbing, completed, failed
    input_path: str = ""
    source_language: str = "auto"
    target_language: str = "en"
    output_path: Optional[str] = None
    error: Optional[str] = None
    progress: float = 0.0
    expected_duration_sec: float = 0.0


class DubbingService:
    """Service for video/audio dubbing using ElevenLabs Dubbing API"""

    API_BASE = "https://api.elevenlabs.io/v1/dubbing"

    def __init__(self):
        self._jobs: Dict[str, DubbingJob] = {}

    def get_supported_languages(self) -> Dict[str, str]:
        """Get dictionary of supported language codes and names"""
        return SUPPORTED_LANGUAGES.copy()

    def create_job(
        self,
        input_path: str,
        target_language: str,
        source_language: str = "auto",
        name: Optional[str] = None,
        num_speakers: int = 0,  # 0 = auto-detect
        watermark: bool = True,  # Starter plan has watermark
        drop_background_audio: bool = False,
        use_profanity_filter: bool = False,
        highest_resolution: bool = False,
    ) -> str:
        """
        Create a dubbing job.

        Args:
            input_path: Path to input video or audio file
            target_language: Target language code (e.g., "es", "fr", "de")
            source_language: Source language code or "auto" for detection
            name: Optional project name
            num_speakers: Number of speakers (0 for auto-detect)
            watermark: Apply watermark (required for Starter plan)
            drop_background_audio: Remove background audio from final dub
            use_profanity_filter: Censor profanities
            highest_resolution: Use maximum resolution (more credits)

        Returns:
            Job ID string
        """
        job_id = str(uuid.uuid4())[:8]

        job = DubbingJob(
            id=job_id,
            status="pending",
            input_path=input_path,
            source_language=source_language,
            target_language=target_language,
        )
        self._jobs[job_id] = job

        # Start processing in background
        thread = Thread(
            target=self._process_job,
            args=(job_id, name, num_speakers, watermark, drop_background_audio,
                  use_profanity_filter, highest_resolution),
            daemon=True
        )
        thread.start()

        return job_id

    def _process_job(
        self,
        job_id: str,
        name: Optional[str],
        num_speakers: int,
        watermark: bool,
        drop_background_audio: bool,
        use_profanity_filter: bool,
        highest_resolution: bool,
    ):
        """Process dubbing job in background"""
        from settings_service import settings_service

        job = self._jobs.get(job_id)
        if not job:
            return

        set_job_id(job_id)
        job.status = "uploading"
        job.progress = 0.05

        try:
            with error_context(
                provider="elevenlabs",
                job_id=job_id,
                source_language=job.source_language,
                target_language=job.target_language,
            ):
                key = settings_service.get_api_key("elevenlabs")
                if not key:
                    raise RuntimeError("ElevenLabs API key not configured")

                input_path = Path(job.input_path)
                if not input_path.exists():
                    raise FileNotFoundError(f"Input file not found: {input_path}")

                job.progress = 0.1
                log_info("dubbing", "_process_job", f"Starting dubbing job", job_id=job_id,
                         source=job.source_language, target=job.target_language)

                # Step 1: Create dubbing project
                with open(input_path, "rb") as f:
                    files = {
                        "file": (input_path.name, f, self._get_mime_type(input_path))
                    }
                    data = {
                        "target_lang": job.target_language,
                        "watermark": str(watermark).lower(),
                    }

                    if job.source_language != "auto":
                        data["source_lang"] = job.source_language

                    if name:
                        data["name"] = name

                    if num_speakers > 0:
                        data["num_speakers"] = str(num_speakers)

                    if drop_background_audio:
                        data["drop_background_audio"] = "true"

                    if use_profanity_filter:
                        data["use_profanity_filter"] = "true"

                    if highest_resolution:
                        data["highest_resolution"] = "true"

                    resp = requests.post(
                        self.API_BASE,
                        headers={"xi-api-key": key},
                        files=files,
                        data=data,
                        timeout=600  # 10 min for upload
                    )

                if resp.status_code != 200:
                    error_msg = self._parse_error(resp)
                    raise RuntimeError(f"Failed to create dubbing: {error_msg}")

                result = resp.json()
                job.elevenlabs_id = result.get("dubbing_id")
                job.expected_duration_sec = result.get("expected_duration_sec", 0)
                job.status = "dubbing"
                job.progress = 0.2

                log_info("dubbing", "_process_job", f"Dubbing project created",
                         job_id=job_id, elevenlabs_id=job.elevenlabs_id)

                # Step 2: Poll for completion
                self._poll_dubbing_status(job, key)

                # Step 3: Download result
                self._download_result(job, key)

        except Exception as e:
            job.status = "failed"
            job.error = str(e)
            log_error("dubbing", "_process_job", f"Job {job_id} failed: {e}",
                      error_code=ErrorCode.DUB_DUBBING_FAILED, exception=e, job_id=job_id)

    def _poll_dubbing_status(self, job: DubbingJob, api_key: str):
        """Poll ElevenLabs API until dubbing is complete"""
        max_attempts = 360  # 30 minutes max (5s interval)
        attempts = 0

        while attempts < max_attempts:
            resp = requests.get(
                f"{self.API_BASE}/{job.elevenlabs_id}",
                headers={"xi-api-key": api_key},
                timeout=30
            )

            if resp.status_code != 200:
                raise RuntimeError(f"Failed to get dubbing status: {resp.status_code}")

            data = resp.json()
            status = data.get("status", "unknown")

            print(f"[Dubbing] Job {job.id} status: {status}")

            if status == "dubbed":
                job.progress = 0.9
                return
            elif status == "failed":
                error = data.get("error", "Unknown error")
                raise RuntimeError(f"Dubbing failed: {error}")
            elif status in ("dubbing", "cloning"):
                # Update progress estimate
                job.progress = 0.2 + (attempts / max_attempts) * 0.6
            elif status == "waiting":
                pass  # Still in queue

            time.sleep(5)
            attempts += 1

        raise RuntimeError("Dubbing timed out after 30 minutes")

    def _download_result(self, job: DubbingJob, api_key: str):
        """Download the dubbed result"""
        # Determine if it's video or audio based on input
        input_ext = Path(job.input_path).suffix.lower()
        is_video = input_ext in (".mp4", ".mov", ".avi", ".mkv", ".webm")

        # Download dubbed audio/video
        resp = requests.get(
            f"{self.API_BASE}/{job.elevenlabs_id}/audio/{job.target_language}",
            headers={"xi-api-key": api_key},
            timeout=300
        )

        if resp.status_code != 200:
            raise RuntimeError(f"Failed to download dubbed audio: {resp.status_code}")

        # Save output
        output_dir = Path(tempfile.gettempdir()) / "whisperall" / "dubbing"
        output_dir.mkdir(parents=True, exist_ok=True)

        ext = "mp4" if is_video else "mp3"
        output_path = output_dir / f"dubbed_{job.id}_{job.target_language}.{ext}"

        with open(output_path, "wb") as f:
            f.write(resp.content)

        job.output_path = str(output_path)
        job.status = "completed"
        job.progress = 1.0

        log_info("dubbing", "_download_result", f"Job completed: {output_path}", job_id=job.id)

        # Save to history
        try:
            from history_service import get_history_service
            import librosa
            duration = librosa.get_duration(filename=str(output_path))
            history_svc = get_history_service()
            history_svc.save_dubbing_entry(
                input_path=job.input_path,
                output_path=str(output_path),
                provider="elevenlabs",
                source_language=job.source_language,
                target_language=job.target_language,
                is_video=is_video,
                duration_seconds=duration,
                elevenlabs_project_id=job.elevenlabs_id,
            )
        except Exception as he:
            log_error("dubbing", "_download_result", f"Failed to save to history: {he}", job_id=job.id)

    def _get_mime_type(self, path: Path) -> str:
        """Get MIME type for file"""
        ext = path.suffix.lower()
        mime_types = {
            ".mp4": "video/mp4",
            ".mov": "video/quicktime",
            ".avi": "video/x-msvideo",
            ".mkv": "video/x-matroska",
            ".webm": "video/webm",
            ".mp3": "audio/mpeg",
            ".wav": "audio/wav",
            ".m4a": "audio/mp4",
            ".ogg": "audio/ogg",
            ".flac": "audio/flac",
        }
        return mime_types.get(ext, "application/octet-stream")

    def _parse_error(self, resp) -> str:
        """Parse error response from API"""
        try:
            data = resp.json()
            detail = data.get("detail", {})
            if isinstance(detail, dict):
                return detail.get("message", str(detail))
            return str(detail)
        except Exception:
            return f"HTTP {resp.status_code}: {resp.text[:200]}"

    def get_job(self, job_id: str) -> Optional[DubbingJob]:
        """Get job by ID"""
        return self._jobs.get(job_id)

    def get_job_status(self, job_id: str) -> Dict[str, Any]:
        """Get job status as dictionary"""
        job = self._jobs.get(job_id)
        if not job:
            return {"error": "Job not found"}

        return {
            "id": job.id,
            "elevenlabs_id": job.elevenlabs_id,
            "status": job.status,
            "progress": job.progress,
            "source_language": job.source_language,
            "target_language": job.target_language,
            "output_path": job.output_path,
            "error": job.error,
            "expected_duration_sec": job.expected_duration_sec,
        }

    def list_jobs(self) -> List[Dict[str, Any]]:
        """List all dubbing jobs"""
        return [self.get_job_status(jid) for jid in self._jobs.keys()]

    def delete_job(self, job_id: str) -> bool:
        """Delete a job from memory"""
        if job_id in self._jobs:
            job = self._jobs[job_id]
            # Optionally delete output file
            if job.output_path:
                try:
                    Path(job.output_path).unlink(missing_ok=True)
                except Exception:
                    pass
            del self._jobs[job_id]
            return True
        return False


# Singleton instance
_service: Optional[DubbingService] = None


def get_dubbing_service() -> DubbingService:
    """Get the dubbing service singleton"""
    global _service
    if _service is None:
        _service = DubbingService()
    return _service
