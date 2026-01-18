"""
Diarization Service - Speaker identification using pyannote or fallback clustering.
Uses pyannote-audio for accurate diarization when available, falls back to
embedding clustering otherwise.
"""

from __future__ import annotations

import os
import shutil
import tempfile
import subprocess
import json
import wave
import datetime
from pathlib import Path
from typing import Callable, Optional, List, Dict, TypedDict, Literal, Any, Tuple


class DiarizationResult(TypedDict):
    """Result of diarization including method used."""
    segments: List[Dict]
    method: Literal["pyannote", "clustering"]
    num_speakers: int

import numpy as np

from settings_service import settings_service
from audio_cache import get_audio_cache_dir
from system_telemetry import get_system_telemetry


class ThermalGuardTriggered(RuntimeError):
    """Raised when thermal guard decides to pause diarization."""

    def __init__(self, reason: str, snapshot: Optional[dict] = None):
        super().__init__(reason)
        self.snapshot = snapshot or {}


def _get_ffmpeg_path() -> str:
    """Get FFmpeg path - uses bundled version from imageio-ffmpeg if available."""
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        # Fallback to system ffmpeg
        ffmpeg = shutil.which("ffmpeg")
        return ffmpeg if ffmpeg else "ffmpeg"


class DiarizationService:
    """Service for speaker diarization - prefers pyannote, falls back to clustering."""

    def __init__(self):
        self._pyannote_pipeline = None
        self._voice_analyzer = None
        self._voice_analyzer_device = None
        self._pyannote_available = None
        self._pyannote_error = None
        self._torchcodec_available = None
        self._torchcodec_error = None
        self._pyannote_device = None
        self._active_safety = None

    def _resolve_safety_settings(self) -> Dict[str, Any]:
        safety = settings_service.get("diarization.safety", {}) or {}
        mode = str(safety.get("mode") or "safe").strip().lower()
        device = str(safety.get("device") or ("cpu" if mode == "safe" else "auto")).strip().lower()
        cpu_count = os.cpu_count() or 4

        presets = {
            "safe": {
                "max_threads": min(4, cpu_count),
                "interop_threads": 1,
                "cooldown_ms": 75,
                "low_priority": True,
                "ffmpeg_threads": 2,
            },
            "balanced": {
                "max_threads": min(8, cpu_count),
                "interop_threads": 2,
                "cooldown_ms": 20,
                "low_priority": True,
                "ffmpeg_threads": 4,
            },
            "performance": {
                "max_threads": cpu_count,
                "interop_threads": 2,
                "cooldown_ms": 0,
                "low_priority": False,
                "ffmpeg_threads": 0,
            },
        }

        resolved = presets.get(mode, presets["safe"]).copy()
        resolved["mode"] = mode
        resolved["device"] = device
        resolved["telemetry_override"] = False
        if safety.get("test_hotspot_c") is not None:
            try:
                resolved["test_hotspot_c"] = float(safety.get("test_hotspot_c"))
            except (TypeError, ValueError):
                resolved["test_hotspot_c"] = None

        telemetry = get_system_telemetry()
        gpu_available = telemetry.get("gpu", {}).get("available", False)
        if not gpu_available:
            # No telemetry available: default to conservative settings.
            resolved = presets["safe"].copy()
            resolved["mode"] = "safe"
            resolved["device"] = "cpu"
            resolved["telemetry_override"] = True

        return resolved

    def _apply_safety_settings(self) -> Dict[str, Any]:
        resolved = self._resolve_safety_settings()
        self._active_safety = resolved

        max_threads = resolved.get("max_threads")
        interop_threads = resolved.get("interop_threads")
        if max_threads:
            os.environ["OMP_NUM_THREADS"] = str(max_threads)
            os.environ["MKL_NUM_THREADS"] = str(max_threads)
            os.environ["NUMEXPR_NUM_THREADS"] = str(max_threads)

        try:
            import torch
            if max_threads:
                torch.set_num_threads(int(max_threads))
            if interop_threads is not None:
                torch.set_num_interop_threads(int(interop_threads))
        except Exception:
            pass

        if resolved.get("low_priority"):
            try:
                import psutil
                proc = psutil.Process()
                if os.name == "nt":
                    proc.nice(psutil.BELOW_NORMAL_PRIORITY_CLASS)
                else:
                    proc.nice(10)
            except Exception:
                pass

        return resolved

    def _get_device_preference(self) -> str:
        resolved = self._active_safety or self._resolve_safety_settings()
        device = resolved.get("device", "auto")
        if device == "cpu":
            return "cpu"
        if device == "gpu":
            try:
                import torch
                return "cuda" if torch.cuda.is_available() else "cpu"
            except Exception:
                return "cpu"
        try:
            import torch
            return "cuda" if torch.cuda.is_available() else "cpu"
        except Exception:
            return "cpu"

    def _maybe_cooldown(self):
        resolved = self._active_safety or self._resolve_safety_settings()
        cooldown_ms = resolved.get("cooldown_ms", 0)
        if cooldown_ms:
            import time
            time.sleep(cooldown_ms / 1000.0)

    def _check_thermal_guard(self, stage: str):
        resolved = self._active_safety or self._resolve_safety_settings()
        device = resolved.get("device", "auto")
        if device == "cpu":
            return

        telemetry = get_system_telemetry()
        gpu = telemetry.get("gpu", {})
        if not gpu.get("available"):
            # No telemetry to validate thermal safety: abort before risking thermal runaway.
            raise ThermalGuardTriggered(
                "Thermal guard: GPU telemetry unavailable, running in CPU-only safe mode",
                snapshot=telemetry
            )

        sensors = gpu.get("sensors") or []
        if not sensors:
            return

        thresholds = {
            "safe": {"hotspot_proxy": 85.0, "power_ratio": 0.95},
            "balanced": {"hotspot_proxy": 92.0, "power_ratio": 0.98},
            "performance": {"hotspot_proxy": 98.0, "power_ratio": 1.0},
        }
        limits = thresholds.get(resolved.get("mode", "safe"), thresholds["safe"])
        test_hotspot = resolved.get("test_hotspot_c")

        for sensor in sensors:
            temp = sensor.get("temperature") or {}
            hotspot_proxy = temp.get("hotspot_c")
            hotspot_kind = temp.get("hotspot_kind")
            throttle = sensor.get("throttle") or {}
            power_draw = sensor.get("power_w")
            power_limit = sensor.get("power_limit_w")

            if throttle.get("thermal") or throttle.get("hw_slowdown") or throttle.get("active"):
                raise ThermalGuardTriggered(
                    f"Thermal guard: GPU throttling detected ({stage})",
                    snapshot=telemetry
                )
            if throttle.get("sw_power_cap"):
                raise ThermalGuardTriggered(
                    f"Thermal guard: GPU power cap detected ({stage})",
                    snapshot=telemetry
                )
            if power_draw is not None and power_limit is not None:
                if power_limit > 0 and power_draw >= power_limit * limits["power_ratio"]:
                    raise ThermalGuardTriggered(
                        f"Thermal guard: GPU at power limit ({stage})",
                        snapshot=telemetry
                    )
            if test_hotspot is not None:
                hotspot_proxy = test_hotspot
                hotspot_kind = "proxy"
            if hotspot_kind == "proxy" and isinstance(hotspot_proxy, (int, float)):
                if hotspot_proxy >= limits["hotspot_proxy"]:
                    raise ThermalGuardTriggered(
                        f"Thermal guard: GPU proxy hotspot high ({stage})",
                        snapshot=telemetry
                    )

    def _get_chunk_config(self) -> Dict[str, Any]:
        resolved = self._active_safety or self._resolve_safety_settings()
        mode = resolved.get("mode", "safe")
        if mode == "safe":
            chunk_size = 30.0
            overlap = 5.0
        else:
            chunk_size = 60.0
            overlap = 10.0
        return {
            "version": 1,
            "chunk_size_s": chunk_size,
            "overlap_s": overlap,
            "vad_frame_ms": 30,
            "vad_min_speech_ms": 300,
            "vad_min_silence_ms": 300,
        }

    def _get_wav_duration(self, audio_path: Path) -> Optional[float]:
        try:
            with wave.open(str(audio_path), "rb") as wf:
                return wf.getnframes() / float(wf.getframerate() or 1)
        except Exception:
            return None

    def _compute_vad_intervals(
        self,
        audio_path: Path,
        frame_ms: int,
        min_speech_ms: int,
        min_silence_ms: int,
    ) -> List[Tuple[float, float]]:
        try:
            with wave.open(str(audio_path), "rb") as wf:
                sample_rate = wf.getframerate()
                channels = wf.getnchannels()
                sampwidth = wf.getsampwidth()
                if sampwidth != 2 or sample_rate <= 0:
                    return [(0.0, self._get_wav_duration(audio_path) or 0.0)]

                frame_size = int(sample_rate * frame_ms / 1000)
                if frame_size <= 0:
                    return [(0.0, self._get_wav_duration(audio_path) or 0.0)]

                rms_db: List[float] = []
                while True:
                    data = wf.readframes(frame_size)
                    if not data:
                        break
                    samples = np.frombuffer(data, dtype=np.int16)
                    if channels > 1:
                        samples = samples.reshape(-1, channels).mean(axis=1)
                    rms = np.sqrt(np.mean(samples.astype(np.float32) ** 2)) / 32768.0
                    db = 20 * np.log10(rms + 1e-6)
                    rms_db.append(float(db))
        except Exception:
            return [(0.0, self._get_wav_duration(audio_path) or 0.0)]

        if not rms_db:
            return [(0.0, self._get_wav_duration(audio_path) or 0.0)]

        noise_floor = float(np.percentile(rms_db, 10))
        threshold_db = max(noise_floor + 10.0, -45.0)

        frame_duration = frame_ms / 1000.0
        speech_mask = [db >= threshold_db for db in rms_db]

        raw_intervals: List[Tuple[float, float]] = []
        current_start: Optional[float] = None
        for idx, is_speech in enumerate(speech_mask):
            t0 = idx * frame_duration
            t1 = (idx + 1) * frame_duration
            if is_speech:
                if current_start is None:
                    current_start = t0
                current_end = t1
            else:
                if current_start is not None:
                    raw_intervals.append((current_start, t0))
                    current_start = None
        if current_start is not None:
            raw_intervals.append((current_start, len(speech_mask) * frame_duration))

        min_speech_s = min_speech_ms / 1000.0
        min_silence_s = min_silence_ms / 1000.0

        # Filter short speech and merge close intervals.
        filtered: List[Tuple[float, float]] = []
        for start, end in raw_intervals:
            if end - start >= min_speech_s:
                filtered.append((start, end))

        if not filtered:
            return [(0.0, self._get_wav_duration(audio_path) or 0.0)]

        allowed: List[Tuple[float, float]] = []
        last_start, last_end = filtered[0]
        for start, end in filtered[1:]:
            if start - last_end <= min_silence_s:
                last_end = max(last_end, end)
            else:
                allowed.append((last_start, last_end))
                last_start, last_end = start, end
        allowed.append((last_start, last_end))
        return allowed

    def _build_chunk_windows(
        self,
        duration: float,
        chunk_size: float,
        overlap: float,
        speech_intervals: List[Tuple[float, float]],
    ) -> List[Dict[str, float]]:
        if duration <= 0:
            return []
        step = max(1.0, chunk_size - overlap)
        chunks: List[Dict[str, float]] = []
        idx = 0
        start = 0.0
        while start < duration:
            end = min(start + chunk_size, duration)
            has_speech = False
            for s0, s1 in speech_intervals:
                if s1 <= start:
                    continue
                if s0 >= end:
                    break
                has_speech = True
                break
            if has_speech:
                chunks.append({"index": idx, "start": start, "end": end})
                idx += 1
            start += step
        if not chunks:
            chunks.append({"index": 0, "start": 0.0, "end": duration})
        return chunks

    def _get_chunk_storage(self, cache_info: Optional[Dict[str, Any]]) -> Optional[Path]:
        audio_hash = None
        if cache_info:
            audio_hash = cache_info.get("hash")
        if not audio_hash:
            return None
        cache_dir = get_audio_cache_dir(audio_hash)
        chunks_dir = cache_dir / "chunks"
        chunks_dir.mkdir(parents=True, exist_ok=True)
        return chunks_dir

    def _load_chunk_manifest(
        self,
        chunks_dir: Path,
        config: Dict[str, Any],
    ) -> Optional[List[Dict[str, float]]]:
        manifest_path = chunks_dir / "manifest.json"
        if not manifest_path.exists():
            return None
        try:
            with open(manifest_path, "r", encoding="utf-8") as f:
                manifest = json.load(f)
        except Exception:
            return None
        if manifest.get("config") != config:
            shutil.rmtree(chunks_dir, ignore_errors=True)
            chunks_dir.mkdir(parents=True, exist_ok=True)
            return None
        return manifest.get("chunks")

    def _save_chunk_manifest(
        self,
        chunks_dir: Path,
        config: Dict[str, Any],
        chunks: List[Dict[str, float]],
        duration: float,
    ) -> None:
        manifest = {
            "config": config,
            "chunks": chunks,
            "duration_s": duration,
            "created_at": datetime.datetime.now().isoformat(),
        }
        manifest_path = chunks_dir / "manifest.json"
        try:
            with open(manifest_path, "w", encoding="utf-8") as f:
                json.dump(manifest, f, ensure_ascii=False, indent=2)
        except Exception:
            pass

    def _load_chunk_embeddings(
        self,
        chunk_path: Path,
    ) -> Tuple[List[int], np.ndarray]:
        if not chunk_path.exists():
            return [], np.array([], dtype=np.float32)
        try:
            data = np.load(str(chunk_path))
            indices = data["segment_indices"].tolist()
            embeddings = data["embeddings"]
            return indices, embeddings
        except Exception:
            return [], np.array([], dtype=np.float32)

    def _save_chunk_embeddings(
        self,
        chunk_path: Path,
        segment_indices: List[int],
        embeddings: np.ndarray,
    ) -> None:
        try:
            np.savez_compressed(
                str(chunk_path),
                segment_indices=np.array(segment_indices, dtype=np.int32),
                embeddings=np.asarray(embeddings, dtype=np.float32),
            )
        except Exception:
            pass

    def _build_concat_audio(
        self,
        audio_path: Path,
        chunks: List[Dict[str, float]],
        temp_dir: Path,
    ) -> Tuple[Optional[Path], List[Dict[str, float]]]:
        if not chunks:
            return None, []

        ffmpeg_path = _get_ffmpeg_path()
        concat_list_path = temp_dir / "concat.txt"
        output_path = temp_dir / "speech_concat.wav"
        mapping: List[Dict[str, float]] = []

        current_concat = 0.0
        with open(concat_list_path, "w", encoding="utf-8") as f:
            for idx, chunk in enumerate(chunks):
                start = chunk["start"]
                end = chunk["end"]
                duration = max(0.0, end - start)
                if duration < 0.5:
                    continue
                chunk_path = temp_dir / f"chunk_{idx}.wav"
                cmd = [
                    ffmpeg_path, "-y",
                    "-ss", str(start),
                    "-t", str(duration),
                    "-i", str(audio_path),
                    "-ar", "16000",
                    "-ac", "1",
                    "-acodec", "pcm_s16le",
                    str(chunk_path),
                ]
                subprocess.run(cmd, capture_output=True, check=True)
                if not chunk_path.exists():
                    continue
                chunk_duration = self._get_wav_duration(chunk_path) or duration
                f.write(f"file '{chunk_path.as_posix()}'\n")
                mapping.append(
                    {
                        "concat_start": current_concat,
                        "concat_end": current_concat + chunk_duration,
                        "orig_start": start,
                    }
                )
                current_concat += chunk_duration

        if not mapping:
            return None, []

        concat_cmd = [
            ffmpeg_path, "-y",
            "-f", "concat",
            "-safe", "0",
            "-i", str(concat_list_path),
            "-c", "copy",
            str(output_path),
        ]
        subprocess.run(concat_cmd, capture_output=True, check=True)

        return output_path if output_path.exists() else None, mapping

    def _map_concat_timeline(
        self,
        speaker_timeline: List[Dict[str, Any]],
        mapping: List[Dict[str, float]],
    ) -> List[Dict[str, Any]]:
        if not mapping:
            return speaker_timeline
        mapped: List[Dict[str, Any]] = []
        for turn in speaker_timeline:
            start = turn["start"]
            end = turn["end"]
            for map_entry in mapping:
                m_start = map_entry["concat_start"]
                m_end = map_entry["concat_end"]
                if end <= m_start or start >= m_end:
                    continue
                overlap_start = max(start, m_start)
                overlap_end = min(end, m_end)
                orig_start = map_entry["orig_start"] + (overlap_start - m_start)
                orig_end = map_entry["orig_start"] + (overlap_end - m_start)
                mapped.append(
                    {
                        "start": orig_start,
                        "end": orig_end,
                        "speaker": turn["speaker"],
                    }
                )
        return mapped

    def _check_pyannote_available(self) -> bool:
        """Check if pyannote is installed and model is available."""
        if self._pyannote_available is not None:
            return self._pyannote_available

        self._pyannote_error = None

        # Check if pyannote-audio is installed
        try:
            import pyannote.audio
            # Check if HF token is set
            hf_token = os.environ.get("HF_TOKEN") or os.environ.get("HUGGING_FACE_HUB_TOKEN")
            if not hf_token:
                # Try to get from settings
                hf_token = settings_service.get("api_keys.huggingface")

            if not hf_token:
                print("[Diarization] pyannote installed but no HF_TOKEN found")
                self._pyannote_error = "HuggingFace token not configured"
                self._pyannote_available = False
                return False

            self._check_torchcodec_available()

            self._pyannote_available = True
            return True

        except ImportError:
            print("[Diarization] pyannote-audio not installed, using fallback clustering")
            self._pyannote_error = "pyannote.audio is not installed"
            self._pyannote_available = False
            return False

    def _check_torchcodec_available(self) -> bool:
        """Check if torchcodec audio decoding is available."""
        if self._torchcodec_available is not None:
            return self._torchcodec_available

        try:
            from torchcodec.decoders import AudioDecoder  # noqa: F401
            self._torchcodec_available = True
            self._torchcodec_error = None
            return True
        except Exception as exc:
            detail = str(exc).strip()
            if detail:
                detail = detail.splitlines()[0]
                detail = f" Details: {detail}"
            else:
                detail = ""
            self._torchcodec_available = False
            self._torchcodec_error = (
                "Pyannote audio decoder (torchcodec) is not available. "
                "Install/repair torchcodec and FFmpeg."
                f"{detail}"
            )
            return False

    def _load_audio_waveform(self, audio_path: Path, progress_callback: Optional[Callable[[float, str], None]] = None) -> Dict:
        """Load audio into memory as waveform to bypass torchcodec."""
        if progress_callback:
            progress_callback(82, "Loading audio into memory (torchcodec missing)...")

        import torch
        import torchaudio

        temp_dir = None
        load_path = audio_path
        if audio_path.suffix.lower() != ".wav":
            temp_dir = tempfile.TemporaryDirectory()
            temp_path = Path(temp_dir.name) / f"pyannote_{audio_path.stem}.wav"
            ffmpeg_path = _get_ffmpeg_path()
            ffmpeg_threads = (self._active_safety or self._resolve_safety_settings()).get("ffmpeg_threads", 0)
            threads_arg = ["-threads", str(ffmpeg_threads)] if ffmpeg_threads else []
            subprocess.run([
                ffmpeg_path, "-y",
                *threads_arg,
                "-i", str(audio_path),
                "-ar", "16000",
                "-ac", "1",
                "-acodec", "pcm_s16le",
                str(temp_path)
            ], capture_output=True, check=True)
            load_path = temp_path

        waveform, sample_rate = torchaudio.load(str(load_path))

        if waveform.dim() == 1:
            waveform = waveform.unsqueeze(0)
        if waveform.shape[0] > 1:
            waveform = waveform.mean(dim=0, keepdim=True)
        if waveform.dtype != torch.float32:
            waveform = waveform.float()

        if temp_dir is not None:
            temp_dir.cleanup()

        return {"waveform": waveform, "sample_rate": int(sample_rate)}

    def _get_pyannote_pipeline(self):
        """Lazy load pyannote pipeline."""
        device_pref = self._get_device_preference()
        if self._pyannote_pipeline is not None:
            if device_pref != self._pyannote_device:
                try:
                    import torch
                    self._pyannote_pipeline.to(torch.device(device_pref))
                    self._pyannote_device = device_pref
                except Exception:
                    pass
            return self._pyannote_pipeline

        if not self._check_pyannote_available():
            return None

        try:
            from pyannote.audio import Pipeline
            import torch

            self._ensure_pyannote_audio_decoder()

            hf_token = (
                os.environ.get("HF_TOKEN") or
                os.environ.get("HUGGING_FACE_HUB_TOKEN") or
                settings_service.get("api_keys.huggingface")
            )

            self._pyannote_pipeline = Pipeline.from_pretrained(
                "pyannote/speaker-diarization-3.1",
                token=hf_token
            )

            # Move to GPU if available
            if device_pref == "cuda" and torch.cuda.is_available():
                self._pyannote_pipeline.to(torch.device("cuda"))
                self._pyannote_device = "cuda"
            else:
                self._pyannote_pipeline.to(torch.device("cpu"))
                self._pyannote_device = "cpu"

            print("[Diarization] Pyannote pipeline loaded successfully")
            return self._pyannote_pipeline

        except Exception as e:
            print(f"[Diarization] Failed to load pyannote: {e}")
            self._pyannote_error = str(e)
            self._pyannote_available = False
            return None

    def _ensure_pyannote_audio_decoder(self) -> None:
        """Patch pyannote audio decoder when torchcodec is missing."""
        try:
            from pyannote.audio.core import io as pyannote_io
        except Exception:
            return

        if hasattr(pyannote_io, "AudioDecoder"):
            return

        try:
            import torch
            import torchaudio
        except Exception as exc:
            self._pyannote_error = f"Pyannote fallback decoder unavailable: {exc}"
            return

        class _FallbackAudioStreamMetadata:
            def __init__(self, sample_rate: int, num_frames: int, num_channels: int):
                self.sample_rate = sample_rate
                self.num_frames = num_frames
                self.num_channels = num_channels
                self.duration_seconds_from_header = (
                    num_frames / sample_rate if sample_rate else 0.0
                )

        class _FallbackAudioSamples:
            def __init__(self, data: torch.Tensor, sample_rate: int):
                self.data = data
                self.sample_rate = sample_rate

        class _FallbackAudioDecoder:
            def __init__(self, source):
                self._source = source
                self.metadata = self._load_metadata()

            def _load_metadata(self) -> _FallbackAudioStreamMetadata:
                try:
                    info = torchaudio.info(self._source)
                    return _FallbackAudioStreamMetadata(
                        info.sample_rate, info.num_frames, info.num_channels
                    )
                except Exception:
                    data, sample_rate = torchaudio.load(self._source)
                    num_frames = data.shape[1]
                    num_channels = data.shape[0]
                    return _FallbackAudioStreamMetadata(
                        sample_rate, num_frames, num_channels
                    )

            def get_all_samples(self) -> _FallbackAudioSamples:
                data, sample_rate = torchaudio.load(self._source)
                return _FallbackAudioSamples(data, sample_rate)

            def get_samples_played_in_range(self, start: float, end: float) -> _FallbackAudioSamples:
                sample_rate = self.metadata.sample_rate
                frame_offset = int(max(0.0, start) * sample_rate)
                num_frames = max(0, int(max(0.0, end - start) * sample_rate))
                if num_frames == 0:
                    data = torch.zeros((1, 0), dtype=torch.float32)
                    return _FallbackAudioSamples(data, sample_rate)
                try:
                    data, sample_rate = torchaudio.load(
                        self._source,
                        frame_offset=frame_offset,
                        num_frames=num_frames
                    )
                except Exception:
                    data, sample_rate = torchaudio.load(self._source)
                    data = data[:, frame_offset:frame_offset + num_frames]
                return _FallbackAudioSamples(data, sample_rate)

        pyannote_io.AudioDecoder = _FallbackAudioDecoder
        pyannote_io.AudioSamples = _FallbackAudioSamples
        pyannote_io.AudioStreamMetadata = _FallbackAudioStreamMetadata

    def _get_voice_analyzer(self):
        """Lazy load voice analyzer for fallback clustering."""
        device_pref = self._get_device_preference()
        if self._voice_analyzer is None or self._voice_analyzer_device != device_pref:
            from voice_analyzer import get_voice_analyzer
            self._voice_analyzer = get_voice_analyzer(device=device_pref)
            self._voice_analyzer_device = device_pref
        return self._voice_analyzer

    def diarize_segments(
        self,
        audio_path: Path,
        segments: List[Dict],
        min_speakers: int = 1,
        max_speakers: int = 10,
        progress_callback: Optional[Callable[[float, str], None]] = None,
        force_pyannote: bool = False,
        prefer_pyannote: bool = True,
        cache_info: Optional[Dict[str, Any]] = None
    ) -> DiarizationResult:
        """
        Assign speaker labels to transcription segments.

        Args:
            audio_path: Path to audio file
            segments: List of segments with start_time, end_time, text
            min_speakers: Minimum number of speakers
            max_speakers: Maximum number of speakers
            progress_callback: Optional callback(progress_percent, status_message)
            force_pyannote: If True, raise error instead of falling back to clustering

        Returns:
            DiarizationResult with segments, method used, and speaker count
        """
        if not segments:
            return {"segments": segments, "method": "pyannote", "num_speakers": 0}

        self._apply_safety_settings()
        self._check_thermal_guard("startup")

        if force_pyannote:
            prefer_pyannote = True

        # Try pyannote first if preferred
        if prefer_pyannote:
            pipeline = self._get_pyannote_pipeline()
            if pipeline is not None:
                return self._diarize_with_pyannote(
                    audio_path,
                    segments,
                    min_speakers,
                    max_speakers,
                    progress_callback,
                    force_pyannote=force_pyannote,
                    cache_info=cache_info
                )

        # If pyannote required but not available, raise error
        if force_pyannote:
            detail = self._pyannote_error or (
                "Pyannote diarization is not available. "
                "Please configure your HuggingFace token and accept model terms. "
                "Go to Models page to verify setup."
            )
            raise RuntimeError(detail)

        # Fallback to clustering
        return self._diarize_with_clustering(
            audio_path, segments, min_speakers, max_speakers, progress_callback, cache_info=cache_info
        )

    def _diarize_with_pyannote(
        self,
        audio_path: Path,
        segments: List[Dict],
        min_speakers: int,
        max_speakers: int,
        progress_callback: Optional[Callable[[float, str], None]] = None,
        force_pyannote: bool = False,
        cache_info: Optional[Dict[str, Any]] = None
    ) -> DiarizationResult:
        """Use pyannote for accurate speaker diarization."""
        if progress_callback:
            progress_callback(82, "Running AI speaker detection (pyannote)...")

        self._check_thermal_guard("pyannote_start")

        diarization = None
        error: Optional[Exception] = None
        audio_input = str(audio_path)
        audio_path_for_pipeline = Path(audio_input)
        concat_dir: Optional[tempfile.TemporaryDirectory] = None
        concat_mapping: List[Dict[str, float]] = []

        config = self._get_chunk_config()
        duration = self._get_wav_duration(audio_path) or 0.0
        if duration > config["chunk_size_s"] * 1.25:
            if progress_callback:
                progress_callback(83, "Preparing speech chunks for diarization...")
            speech_intervals = self._compute_vad_intervals(
                audio_path,
                config["vad_frame_ms"],
                config["vad_min_speech_ms"],
                config["vad_min_silence_ms"],
            )
            pyannote_chunks = self._build_chunk_windows(
                duration,
                config["chunk_size_s"],
                0.0,
                speech_intervals,
            )
            if len(pyannote_chunks) > 1:
                concat_dir = tempfile.TemporaryDirectory()
                try:
                    concat_audio, concat_mapping = self._build_concat_audio(
                        audio_path,
                        pyannote_chunks,
                        Path(concat_dir.name),
                    )
                    if concat_audio is not None:
                        audio_input = str(concat_audio)
                        audio_path_for_pipeline = Path(audio_input)
                except Exception as exc:
                    concat_mapping = []
                    if progress_callback:
                        progress_callback(83, "Using full audio for diarization...")

        if not self._check_torchcodec_available():
            audio_input = self._load_audio_waveform(audio_path_for_pipeline, progress_callback)

        try:
            diarization = self._pyannote_pipeline(
                audio_input,
                min_speakers=min_speakers,
                max_speakers=max_speakers
            )
        except Exception as exc:
            error = exc
            error_text = str(exc)
            if "AudioDecoder" in error_text or "torchcodec" in error_text.lower():
                try:
                    audio_input = self._load_audio_waveform(audio_path_for_pipeline, progress_callback)
                    diarization = self._pyannote_pipeline(
                        audio_input,
                        min_speakers=min_speakers,
                        max_speakers=max_speakers
                    )
                    error = None
                except Exception as retry_exc:
                    error = retry_exc
        finally:
            if concat_dir is not None:
                concat_dir.cleanup()

        if error is not None or diarization is None:
            print(f"[Diarization] Pyannote failed: {error}")
            error_text = str(error).strip() if error else ""
            error_line = error_text.splitlines()[0] if error_text else ""
            use_torchcodec_message = (
                self._torchcodec_available is False
                or "AudioDecoder" in error_text
                or "torchcodec" in error_text.lower()
            )
            if use_torchcodec_message:
                message = (
                    self._torchcodec_error
                    or "Pyannote audio decoder (torchcodec) is not available. "
                    "Install/repair torchcodec and FFmpeg."
                )
                if error_line:
                    message = f"{message} Details: {error_line}"
            else:
                message = error_line or "Pyannote diarization failed."
            self._pyannote_error = message
            if force_pyannote:
                raise RuntimeError(message) from error
            print("[Diarization] Falling back to clustering")
            return self._diarize_with_clustering(
                audio_path, segments, min_speakers, max_speakers, progress_callback
            )

        if progress_callback:
            progress_callback(90, "Assigning speakers to segments...")

        self._check_thermal_guard("pyannote_assign")

        # Build speaker timeline
        speaker_timeline = []
        for turn, _, speaker in diarization.itertracks(yield_label=True):
            speaker_timeline.append({
                "start": turn.start,
                "end": turn.end,
                "speaker": speaker
            })
        if concat_mapping:
            speaker_timeline = self._map_concat_timeline(speaker_timeline, concat_mapping)

        # Map speakers to numeric IDs
        unique_speakers = list(set(t["speaker"] for t in speaker_timeline))
        speaker_to_id = {s: i for i, s in enumerate(unique_speakers)}

        # Assign speakers to segments based on overlap
        total_segments = len(segments)
        update_every = max(1, total_segments // 20)
        for idx, seg in enumerate(segments):
            seg_start = seg["start_time"]
            seg_end = seg["end_time"]
            seg_mid = (seg_start + seg_end) / 2

            # Find speaker with most overlap or closest to midpoint
            best_speaker = None
            best_overlap = 0

            for turn in speaker_timeline:
                overlap_start = max(seg_start, turn["start"])
                overlap_end = min(seg_end, turn["end"])
                overlap = max(0, overlap_end - overlap_start)

                if overlap > best_overlap:
                    best_overlap = overlap
                    best_speaker = turn["speaker"]

            # If no overlap found, find closest turn
            if best_speaker is None:
                min_dist = float("inf")
                for turn in speaker_timeline:
                    turn_mid = (turn["start"] + turn["end"]) / 2
                    dist = abs(turn_mid - seg_mid)
                    if dist < min_dist:
                        min_dist = dist
                        best_speaker = turn["speaker"]

            if best_speaker is not None:
                speaker_id = speaker_to_id[best_speaker]
                seg["speaker_id"] = speaker_id
                seg["speaker"] = f"Speaker {speaker_id + 1}"
            else:
                seg["speaker_id"] = 0
                seg["speaker"] = "Speaker 1"
            if progress_callback and (idx % update_every == 0 or idx == total_segments - 1):
                pct = 90 + (idx / max(1, total_segments)) * 5
                progress_callback(pct, f"Assigning speakers {idx + 1}/{total_segments}...")
                self._maybe_cooldown()

        num_speakers = len(unique_speakers)
        if progress_callback:
            progress_callback(95, f"Detected {num_speakers} speakers (pyannote)")

        return {"segments": segments, "method": "pyannote", "num_speakers": num_speakers}

    def _diarize_with_clustering(
        self,
        audio_path: Path,
        segments: List[Dict],
        min_speakers: int,
        max_speakers: int,
        progress_callback: Optional[Callable[[float, str], None]] = None,
        cache_info: Optional[Dict[str, Any]] = None
    ) -> DiarizationResult:
        """Fallback: Use voice embeddings + clustering for diarization."""
        if progress_callback:
            progress_callback(82, "Extracting speaker embeddings (chunked clustering)...")

        analyzer = self._get_voice_analyzer()
        chunks_dir = self._get_chunk_storage(cache_info)
        config = self._get_chunk_config()

        duration = self._get_wav_duration(audio_path)
        if duration is None:
            duration = max((seg.get("end_time", 0) for seg in segments), default=0)

        if chunks_dir:
            chunks = self._load_chunk_manifest(chunks_dir, config)
        else:
            chunks = None

        if not chunks:
            speech_intervals = self._compute_vad_intervals(
                audio_path,
                config["vad_frame_ms"],
                config["vad_min_speech_ms"],
                config["vad_min_silence_ms"],
            )
            chunks = self._build_chunk_windows(
                duration,
                config["chunk_size_s"],
                config["overlap_s"],
                speech_intervals,
            )
            if chunks_dir:
                self._save_chunk_manifest(chunks_dir, config, chunks, duration)

        chunk_to_segments: Dict[int, List[int]] = {chunk["index"]: [] for chunk in chunks}
        for idx, seg in enumerate(segments):
            mid = (seg["start_time"] + seg["end_time"]) / 2
            assigned = False
            for chunk in chunks:
                if chunk["start"] <= mid < chunk["end"]:
                    chunk_to_segments[chunk["index"]].append(idx)
                    assigned = True
                    break
            if not assigned and chunks:
                nearest = min(chunks, key=lambda c: abs(((c["start"] + c["end"]) / 2) - mid))
                chunk_to_segments[nearest["index"]].append(idx)

        embeddings_map: Dict[int, np.ndarray] = {}
        total_targets = sum(len(ids) for ids in chunk_to_segments.values()) or len(segments)
        processed = 0

        embeddings_dir = None
        if chunks_dir:
            embeddings_dir = chunks_dir / "embeddings"
            embeddings_dir.mkdir(parents=True, exist_ok=True)

        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            for chunk in chunks:
                chunk_idx = chunk["index"]
                segment_ids = chunk_to_segments.get(chunk_idx, [])
                if not segment_ids:
                    continue

                chunk_file = embeddings_dir / f"chunk_{chunk_idx}.npz" if embeddings_dir else None
                loaded_indices: List[int] = []
                loaded_embeddings: np.ndarray = np.array([], dtype=np.float32)
                if chunk_file is not None:
                    loaded_indices, loaded_embeddings = self._load_chunk_embeddings(chunk_file)
                    for idx, emb in zip(loaded_indices, loaded_embeddings):
                        embeddings_map[idx] = emb

                pending_indices = [idx for idx in segment_ids if idx not in embeddings_map]
                processed += len(segment_ids) - len(pending_indices)
                new_indices: List[int] = []
                new_embeddings: List[np.ndarray] = []

                for count, seg_idx in enumerate(pending_indices, start=1):
                    seg = segments[seg_idx]
                    seg_audio = self._extract_segment_audio(
                        audio_path,
                        seg["start_time"],
                        seg["end_time"],
                        temp_path
                    )
                    if seg_audio is not None:
                        try:
                            embedding = analyzer.get_embedding(str(seg_audio))
                            embedding = embedding.flatten()
                            embeddings_map[seg_idx] = embedding
                            new_indices.append(seg_idx)
                            new_embeddings.append(embedding)
                        except Exception:
                            pass
                        finally:
                            if seg_audio.exists():
                                seg_audio.unlink()

                    processed += 1
                    if progress_callback:
                        pct = 82 + (processed / max(1, total_targets)) * 8
                        progress_callback(
                            pct,
                            f"Analyzing speaker chunk {chunk_idx + 1}/{len(chunks)}..."
                        )
                    self._maybe_cooldown()
                    if count % 10 == 0:
                        self._check_thermal_guard("embedding")

                    if chunk_file is not None and new_indices and count % 5 == 0:
                        merged_indices = loaded_indices + new_indices
                        merged_embeddings = (
                            np.vstack([loaded_embeddings, np.vstack(new_embeddings)])
                            if loaded_embeddings.size
                            else np.vstack(new_embeddings)
                        )
                        self._save_chunk_embeddings(chunk_file, merged_indices, merged_embeddings)

                if chunk_file is not None and new_indices:
                    merged_indices = loaded_indices + new_indices
                    merged_embeddings = (
                        np.vstack([loaded_embeddings, np.vstack(new_embeddings)])
                        if loaded_embeddings.size
                        else np.vstack(new_embeddings)
                    )
                    self._save_chunk_embeddings(chunk_file, merged_indices, merged_embeddings)

                if progress_callback:
                    self._check_thermal_guard("embedding")

        if len(embeddings_map) < 2:
            for seg in segments:
                seg["speaker"] = "Speaker 1"
                seg["speaker_id"] = 0
            return {"segments": segments, "method": "clustering", "num_speakers": 1}

        if progress_callback:
            progress_callback(92, "Clustering speakers...")
            self._check_thermal_guard("clustering")

        ordered_indices = sorted(embeddings_map.keys())
        embeddings_array = np.array([embeddings_map[idx] for idx in ordered_indices])
        speaker_labels = self._cluster_speakers(
            embeddings_array, min_speakers, max_speakers
        )

        label_map = {idx: label for idx, label in zip(ordered_indices, speaker_labels)}

        total_segments = len(segments)
        update_every = max(1, total_segments // 20)
        for i, seg in enumerate(segments):
            if i in label_map:
                speaker_id = label_map[i]
            else:
                speaker_id = self._find_nearest_speaker(i, label_map, segments)

            seg["speaker_id"] = int(speaker_id)
            seg["speaker"] = f"Speaker {speaker_id + 1}"

            if progress_callback and (i % update_every == 0 or i == total_segments - 1):
                pct = 92 + (i / max(1, total_segments)) * 3
                progress_callback(pct, f"Assigning speakers {i + 1}/{total_segments}...")
                self._check_thermal_guard("assignment")

        num_speakers = len(set(label_map.values())) if label_map else 1
        if progress_callback:
            progress_callback(95, f"Detected {num_speakers} speakers (clustering)")

        return {"segments": segments, "method": "clustering", "num_speakers": num_speakers}

    def _extract_segment_audio(
        self,
        audio_path: Path,
        start_time: float,
        end_time: float,
        temp_dir: Path
    ) -> Optional[Path]:
        """Extract a segment of audio using FFmpeg."""
        import uuid

        output_path = temp_dir / f"seg_{uuid.uuid4().hex[:8]}.wav"
        duration = end_time - start_time

        if duration < 0.5:
            return None

        try:
            ffmpeg_path = _get_ffmpeg_path()
            ffmpeg_threads = (self._active_safety or self._resolve_safety_settings()).get("ffmpeg_threads", 0)
            threads_arg = ["-threads", str(ffmpeg_threads)] if ffmpeg_threads else []
            subprocess.run([
                ffmpeg_path, "-y",
                *threads_arg,
                "-ss", str(start_time),
                "-t", str(duration),
                "-i", str(audio_path),
                "-ar", "22050",
                "-ac", "1",
                "-acodec", "pcm_s16le",
                str(output_path)
            ], capture_output=True, check=True, timeout=30)

            if output_path.exists() and output_path.stat().st_size > 1000:
                return output_path
        except Exception:
            pass

        return None

    def _cluster_speakers(
        self,
        embeddings: np.ndarray,
        min_speakers: int,
        max_speakers: int
    ) -> np.ndarray:
        """Cluster embeddings to identify speakers with improved accuracy."""
        try:
            from sklearn.cluster import AgglomerativeClustering
            from sklearn.metrics import silhouette_score
            from sklearn.metrics.pairwise import cosine_similarity
        except ImportError as exc:
            raise RuntimeError(
                "scikit-learn is required for speaker diarization. "
                "Run: pip install scikit-learn"
            ) from exc

        n_samples = len(embeddings)

        max_k = min(max_speakers, n_samples - 1)
        if max_k < min_speakers:
            max_k = min_speakers

        if max_k <= 1 or n_samples < 3:
            return np.zeros(n_samples, dtype=int)

        # Check if all embeddings are very similar (single speaker)
        similarities = cosine_similarity(embeddings)
        upper_tri = similarities[np.triu_indices(n_samples, k=1)]
        avg_similarity = np.mean(upper_tri) if len(upper_tri) > 0 else 1.0

        # High similarity threshold = likely single speaker
        enforce_min_speakers = min_speakers > 1
        if avg_similarity > 0.85 and not enforce_min_speakers:
            return np.zeros(n_samples, dtype=int)

        best_score = -1
        best_labels = None
        MIN_SILHOUETTE = 0.15
        min_silhouette = -1.0 if enforce_min_speakers else MIN_SILHOUETTE

        for n_clusters in range(min_speakers, max_k + 1):
            try:
                clustering = AgglomerativeClustering(
                    n_clusters=n_clusters,
                    metric="cosine",
                    linkage="average"
                )
                labels = clustering.fit_predict(embeddings)

                if len(set(labels)) > 1:
                    score = silhouette_score(embeddings, labels, metric="cosine")
                    if score > best_score and score > min_silhouette:
                        best_score = score
                        best_labels = labels
                elif best_labels is None:
                    best_labels = labels
            except Exception:
                continue

        if best_labels is None or (best_score < MIN_SILHOUETTE and not enforce_min_speakers):
            return np.zeros(n_samples, dtype=int)

        return best_labels

    def _find_nearest_speaker(
        self,
        segment_idx: int,
        label_map: Dict[int, int],
        segments: List[Dict]
    ) -> int:
        """Find speaker of nearest labeled segment by time."""
        if not label_map:
            return 0

        seg_time = segments[segment_idx]["start_time"]
        nearest_idx = None
        min_dist = float("inf")

        for idx in label_map:
            dist = abs(segments[idx]["start_time"] - seg_time)
            if dist < min_dist:
                min_dist = dist
                nearest_idx = idx

        return label_map.get(nearest_idx, 0)

    def is_pyannote_available(self) -> bool:
        """Check if pyannote diarization is available."""
        return self._check_pyannote_available()


# Singleton instance
_service: Optional[DiarizationService] = None


def get_diarization_service() -> DiarizationService:
    """Get singleton diarization service instance."""
    global _service
    if _service is None:
        _service = DiarizationService()
    return _service
