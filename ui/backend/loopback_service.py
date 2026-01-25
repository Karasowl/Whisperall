"""
Loopback Audio Capture Service - Capture system audio on Windows using WASAPI.

This service captures the audio output from the system (what you hear through speakers/headphones)
and makes it available for transcription and other processing.
"""

from __future__ import annotations

import asyncio
import threading
import queue
import wave
import io
import time
import tempfile
import subprocess
import sys
from pathlib import Path
from typing import Optional, List, Dict, Any, Callable, Tuple
from dataclasses import dataclass, field
from enum import Enum
import numpy as np

# Diagnostics
from diagnostics import log_function, error_context, log_info, log_error
from diagnostics.error_codes import ErrorCode

# Try to import audio capture libraries
_pyaudiowpatch_available = False
_sounddevice_available = False
_install_attempted = False


def _try_install_pyaudiowpatch() -> bool:
    """Attempt to install pyaudiowpatch automatically."""
    global _pyaudiowpatch_available, _install_attempted

    if _install_attempted:
        return _pyaudiowpatch_available

    _install_attempted = True

    print("[Loopback] pyaudiowpatch not found, attempting automatic installation...")
    try:
        result = subprocess.run(
            [sys.executable, "-m", "pip", "install", "pyaudiowpatch", "--quiet"],
            capture_output=True,
            text=True,
            timeout=120
        )
        if result.returncode == 0:
            print("[Loopback] pyaudiowpatch installed successfully!")
            # Try to import again
            try:
                import pyaudiowpatch as pyaudio
                _pyaudiowpatch_available = True
                return True
            except ImportError:
                print("[Loopback] Installation succeeded but import still failed")
                return False
        else:
            print(f"[Loopback] Installation failed: {result.stderr}")
            return False
    except subprocess.TimeoutExpired:
        print("[Loopback] Installation timed out")
        return False
    except Exception as e:
        print(f"[Loopback] Installation error: {e}")
        return False


def _ensure_pyaudiowpatch() -> bool:
    """Ensure pyaudiowpatch is available, installing if necessary."""
    global _pyaudiowpatch_available

    if _pyaudiowpatch_available:
        return True

    return _try_install_pyaudiowpatch()


try:
    import pyaudiowpatch as pyaudio
    _pyaudiowpatch_available = True
except ImportError:
    try:
        import pyaudio
    except ImportError:
        pass

try:
    import sounddevice as sd
    _sounddevice_available = True
except ImportError:
    pass


class LoopbackState(str, Enum):
    """State of the loopback capture."""
    STOPPED = "stopped"
    STARTING = "starting"
    CAPTURING = "capturing"
    PAUSED = "paused"
    ERROR = "error"


@dataclass
class LoopbackDevice:
    """Information about an audio output device that can be captured."""
    index: int
    name: str
    host_api: str
    channels: int
    sample_rate: int
    is_loopback: bool = False
    is_default: bool = False


@dataclass
class AudioChunk:
    """A chunk of captured audio data."""
    data: bytes
    sample_rate: int
    channels: int
    sample_width: int  # bytes per sample (2 for 16-bit)
    timestamp: float
    duration_seconds: float


class LoopbackService:
    """Service for capturing system audio using WASAPI loopback."""

    def __init__(self):
        self._state = LoopbackState.STOPPED
        self._capture_thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._pause_event = threading.Event()
        self._audio_queue: queue.Queue[AudioChunk] = queue.Queue(maxsize=100)
        self._current_device: Optional[LoopbackDevice] = None
        self._error_message: Optional[str] = None
        self._pyaudio_instance: Optional[Any] = None
        self._stream: Optional[Any] = None

        # Capture settings
        self._chunk_duration_seconds = 3.0  # Duration of each audio chunk
        self._sample_rate = 16000  # Target sample rate for transcription
        self._channels = 1  # Mono for transcription

        # Callbacks
        self._on_chunk_callback: Optional[Callable[[AudioChunk], None]] = None
        self._on_state_change_callback: Optional[Callable[[LoopbackState], None]] = None

    @property
    def state(self) -> LoopbackState:
        return self._state

    @property
    def is_available(self) -> bool:
        """Check if loopback capture is available on this system."""
        return _pyaudiowpatch_available or _sounddevice_available

    @property
    def error_message(self) -> Optional[str]:
        return self._error_message

    def _set_state(self, state: LoopbackState):
        """Update state and notify callback."""
        self._state = state
        if self._on_state_change_callback:
            try:
                self._on_state_change_callback(state)
            except Exception:
                pass

    def get_loopback_devices(self) -> List[LoopbackDevice]:
        """Get list of available loopback devices (audio outputs that can be captured)."""
        devices = []

        if _pyaudiowpatch_available:
            devices = self._get_pyaudio_loopback_devices()
        elif _sounddevice_available:
            devices = self._get_sounddevice_loopback_devices()

        return devices

    def _get_pyaudio_loopback_devices(self) -> List[LoopbackDevice]:
        """Get loopback devices using pyaudiowpatch."""
        devices = []
        try:
            p = pyaudio.PyAudio()

            # Get WASAPI host API index
            wasapi_index = None
            for i in range(p.get_host_api_count()):
                api_info = p.get_host_api_info_by_index(i)
                if "WASAPI" in api_info.get("name", ""):
                    wasapi_index = i
                    break

            if wasapi_index is None:
                p.terminate()
                return devices

            # Get default output device
            try:
                default_output = p.get_default_wasapi_loopback()
                default_index = default_output.get("index") if default_output else None
            except Exception:
                default_index = None

            # Enumerate WASAPI devices
            for i in range(p.get_device_count()):
                try:
                    device_info = p.get_device_info_by_index(i)
                    host_api_index = device_info.get("hostApi")

                    if host_api_index != wasapi_index:
                        continue

                    # Check if it's a loopback device
                    is_loopback = device_info.get("isLoopbackDevice", False)
                    max_output_channels = device_info.get("maxOutputChannels", 0)

                    # Include loopback devices or output devices
                    if is_loopback or max_output_channels > 0:
                        devices.append(LoopbackDevice(
                            index=i,
                            name=device_info.get("name", f"Device {i}"),
                            host_api="WASAPI",
                            channels=device_info.get("maxInputChannels", 2) or device_info.get("maxOutputChannels", 2),
                            sample_rate=int(device_info.get("defaultSampleRate", 44100)),
                            is_loopback=is_loopback,
                            is_default=(i == default_index)
                        ))
                except Exception:
                    continue

            p.terminate()

        except Exception as e:
            print(f"[Loopback] Error getting PyAudio devices: {e}")

        return devices

    def _get_sounddevice_loopback_devices(self) -> List[LoopbackDevice]:
        """Get loopback devices using sounddevice (limited support)."""
        devices = []
        try:
            device_list = sd.query_devices()
            default_output = sd.default.device[1]  # Output device index

            for i, dev in enumerate(device_list):
                # Only include output devices
                if dev.get("max_output_channels", 0) > 0:
                    devices.append(LoopbackDevice(
                        index=i,
                        name=dev.get("name", f"Device {i}"),
                        host_api=dev.get("hostapi_name", "Unknown"),
                        channels=dev.get("max_output_channels", 2),
                        sample_rate=int(dev.get("default_samplerate", 44100)),
                        is_loopback=False,  # sounddevice doesn't indicate loopback
                        is_default=(i == default_output)
                    ))
        except Exception as e:
            print(f"[Loopback] Error getting sounddevice devices: {e}")

        return devices

    def set_chunk_callback(self, callback: Optional[Callable[[AudioChunk], None]]):
        """Set callback to be called when an audio chunk is ready."""
        self._on_chunk_callback = callback

    def set_state_callback(self, callback: Optional[Callable[[LoopbackState], None]]):
        """Set callback to be called when state changes."""
        self._on_state_change_callback = callback

    @log_function(module="loopback", error_code=ErrorCode.LOOP_CAPTURE_FAILED)
    def start(self, device_index: Optional[int] = None) -> bool:
        """
        Start capturing system audio.

        Args:
            device_index: Index of the device to capture. If None, uses default loopback device.

        Returns:
            True if capture started successfully.
        """
        with error_context(device_index=device_index):
            if self._state in (LoopbackState.CAPTURING, LoopbackState.STARTING):
                return True

            if self._state == LoopbackState.PAUSED:
                return self.resume()

            self._error_message = None
            self._set_state(LoopbackState.STARTING)

            # Ensure pyaudiowpatch is installed (auto-install if needed)
            if not _ensure_pyaudiowpatch():
                self._error_message = "pyaudiowpatch is required but could not be installed automatically. Please restart the application."
                log_error("loopback", "start", self._error_message,
                          error_code=ErrorCode.LOOP_DEVICE_NOT_FOUND)
                self._set_state(LoopbackState.ERROR)
                return False

            # Find device
            devices = self.get_loopback_devices()
            if not devices:
                self._error_message = "No loopback devices available."
                log_error("loopback", "start", self._error_message,
                          error_code=ErrorCode.LOOP_DEVICE_NOT_FOUND)
                self._set_state(LoopbackState.ERROR)
                return False

            if device_index is not None:
                device = next((d for d in devices if d.index == device_index), None)
            else:
                # Prefer loopback devices, then default
                device = next((d for d in devices if d.is_loopback and d.is_default), None)
                if not device:
                    device = next((d for d in devices if d.is_loopback), None)
                if not device:
                    device = next((d for d in devices if d.is_default), None)
                if not device:
                    device = devices[0]

            if not device:
                self._error_message = f"Device with index {device_index} not found"
                log_error("loopback", "start", self._error_message,
                          error_code=ErrorCode.LOOP_DEVICE_NOT_FOUND)
                self._set_state(LoopbackState.ERROR)
                return False

            self._current_device = device
            log_info("loopback", "start", f"Starting capture on device: {device.name}")

            # Start capture thread
            self._stop_event.clear()
            self._pause_event.clear()
            self._capture_thread = threading.Thread(target=self._capture_loop, daemon=True)
            self._capture_thread.start()

            return True

    def stop(self):
        """Stop capturing audio."""
        self._stop_event.set()
        self._pause_event.set()  # Unpause if paused

        if self._capture_thread and self._capture_thread.is_alive():
            self._capture_thread.join(timeout=2.0)

        self._capture_thread = None
        self._current_device = None

        # Clear queue
        while not self._audio_queue.empty():
            try:
                self._audio_queue.get_nowait()
            except queue.Empty:
                break

        self._set_state(LoopbackState.STOPPED)

    def pause(self):
        """Pause capturing (keeps device open)."""
        if self._state == LoopbackState.CAPTURING:
            self._pause_event.set()
            self._set_state(LoopbackState.PAUSED)

    def resume(self) -> bool:
        """Resume capturing after pause."""
        if self._state == LoopbackState.PAUSED:
            self._pause_event.clear()
            self._set_state(LoopbackState.CAPTURING)
            return True
        return False

    def get_chunk(self, timeout: float = 0.1) -> Optional[AudioChunk]:
        """Get the next audio chunk from the queue."""
        try:
            return self._audio_queue.get(timeout=timeout)
        except queue.Empty:
            return None

    def _capture_loop(self):
        """Main capture loop running in a separate thread."""
        if not _pyaudiowpatch_available:
            self._error_message = "pyaudiowpatch is required for WASAPI loopback. Install with: pip install pyaudiowpatch"
            self._set_state(LoopbackState.ERROR)
            return

        device = self._current_device
        if not device:
            self._error_message = "No device selected"
            self._set_state(LoopbackState.ERROR)
            return

        try:
            p = pyaudio.PyAudio()
            self._pyaudio_instance = p

            # Get the loopback device
            try:
                if device.is_loopback:
                    loopback_device = p.get_device_info_by_index(device.index)
                else:
                    # Try to get loopback for this output device
                    loopback_device = p.get_loopback_device_info_by_index(device.index)
            except Exception:
                loopback_device = p.get_device_info_by_index(device.index)

            native_sample_rate = int(loopback_device.get("defaultSampleRate", 44100))
            native_channels = int(loopback_device.get("maxInputChannels", 2)) or 2

            # Calculate chunk size for native rate
            chunk_samples = int(native_sample_rate * self._chunk_duration_seconds)

            # Open stream
            stream = p.open(
                format=pyaudio.paInt16,
                channels=native_channels,
                rate=native_sample_rate,
                input=True,
                input_device_index=loopback_device.get("index", device.index),
                frames_per_buffer=chunk_samples
            )
            self._stream = stream

            self._set_state(LoopbackState.CAPTURING)
            print(f"[Loopback] Capturing from: {device.name} at {native_sample_rate}Hz, {native_channels}ch")

            buffer = []
            buffer_samples = 0
            target_samples = int(self._sample_rate * self._chunk_duration_seconds)

            while not self._stop_event.is_set():
                # Handle pause
                if self._pause_event.is_set():
                    time.sleep(0.1)
                    continue

                try:
                    # Read audio data
                    data = stream.read(chunk_samples, exception_on_overflow=False)
                    timestamp = time.time()

                    # Convert to numpy array
                    audio_np = np.frombuffer(data, dtype=np.int16)

                    # Convert to mono if stereo
                    if native_channels > 1:
                        audio_np = audio_np.reshape(-1, native_channels).mean(axis=1).astype(np.int16)

                    # Resample if needed
                    if native_sample_rate != self._sample_rate:
                        import scipy.signal
                        num_samples = int(len(audio_np) * self._sample_rate / native_sample_rate)
                        audio_np = scipy.signal.resample(audio_np, num_samples).astype(np.int16)

                    buffer.append(audio_np)
                    buffer_samples += len(audio_np)

                    # Create chunk when we have enough data
                    if buffer_samples >= target_samples:
                        full_audio = np.concatenate(buffer)
                        chunk_audio = full_audio[:target_samples]

                        # Keep remainder for next chunk
                        if len(full_audio) > target_samples:
                            buffer = [full_audio[target_samples:]]
                            buffer_samples = len(buffer[0])
                        else:
                            buffer = []
                            buffer_samples = 0

                        # Create chunk
                        chunk = AudioChunk(
                            data=chunk_audio.tobytes(),
                            sample_rate=self._sample_rate,
                            channels=1,
                            sample_width=2,
                            timestamp=timestamp,
                            duration_seconds=len(chunk_audio) / self._sample_rate
                        )

                        # Add to queue or call callback
                        if self._on_chunk_callback:
                            try:
                                self._on_chunk_callback(chunk)
                            except Exception as e:
                                print(f"[Loopback] Chunk callback error: {e}")

                        try:
                            self._audio_queue.put_nowait(chunk)
                        except queue.Full:
                            # Drop oldest chunk
                            try:
                                self._audio_queue.get_nowait()
                                self._audio_queue.put_nowait(chunk)
                            except queue.Empty:
                                pass

                except Exception as e:
                    if not self._stop_event.is_set():
                        print(f"[Loopback] Read error: {e}")
                    break

            # Cleanup
            stream.stop_stream()
            stream.close()

        except Exception as e:
            self._error_message = f"Capture error: {str(e)}"
            print(f"[Loopback] {self._error_message}")
            self._set_state(LoopbackState.ERROR)

        finally:
            if self._pyaudio_instance:
                self._pyaudio_instance.terminate()
                self._pyaudio_instance = None
            self._stream = None

            if self._state not in (LoopbackState.ERROR, LoopbackState.STOPPED):
                self._set_state(LoopbackState.STOPPED)

    def chunk_to_wav_bytes(self, chunk: AudioChunk) -> bytes:
        """Convert an AudioChunk to WAV format bytes."""
        buffer = io.BytesIO()
        with wave.open(buffer, 'wb') as wf:
            wf.setnchannels(chunk.channels)
            wf.setsampwidth(chunk.sample_width)
            wf.setframerate(chunk.sample_rate)
            wf.writeframes(chunk.data)
        return buffer.getvalue()

    def chunk_to_temp_file(self, chunk: AudioChunk) -> Path:
        """Save an AudioChunk to a temporary WAV file."""
        fd, path = tempfile.mkstemp(suffix='.wav')
        with wave.open(path, 'wb') as wf:
            wf.setnchannels(chunk.channels)
            wf.setsampwidth(chunk.sample_width)
            wf.setframerate(chunk.sample_rate)
            wf.writeframes(chunk.data)
        return Path(path)


# Singleton instance
_service: Optional[LoopbackService] = None


def get_loopback_service() -> LoopbackService:
    """Get singleton loopback service instance."""
    global _service
    if _service is None:
        _service = LoopbackService()
    return _service


def is_loopback_available(auto_install: bool = True) -> Tuple[bool, str]:
    """
    Check if loopback capture is available.

    Args:
        auto_install: If True, attempt to install pyaudiowpatch if not available

    Returns:
        Tuple of (is_available, message)
    """
    global _pyaudiowpatch_available

    if _pyaudiowpatch_available:
        return True, "pyaudiowpatch available - full WASAPI loopback support"

    # Try to auto-install if requested
    if auto_install and not _install_attempted:
        if _ensure_pyaudiowpatch():
            return True, "pyaudiowpatch installed and ready - full WASAPI loopback support"

    if _pyaudiowpatch_available:
        return True, "pyaudiowpatch available - full WASAPI loopback support"
    elif _sounddevice_available:
        return False, "WASAPI loopback requires pyaudiowpatch (auto-install failed)"
    else:
        return False, "Audio capture library not available (auto-install failed)"
