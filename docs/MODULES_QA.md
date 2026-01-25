# Whisperall Modules QA Documentation

This document describes each module in the Whisperall backend, their critical functions, potential failure points, and associated error codes.

## Error Code Ranges

| Range | Module |
|-------|--------|
| 1xxx | TTS (Text-to-Speech) |
| 2xxx | STT (Speech-to-Text) |
| 3xxx | Transcription |
| 4xxx | Diarization |
| 5xxx | Music Generation |
| 6xxx | SFX (Sound Effects) |
| 7xxx | History |
| 8xxx | Voice Changer |
| 9xxx | Voice Isolator |
| 10xx | Dubbing |
| 11xx | Loopback |
| 12xx | AI Editor |
| 13xx | Reader |
| 90xx | Provider/API |
| 99xx | System |

---

## 1. TTS Service (`tts_service.py`)

**Module:** `tts`
**Responsibility:** Text-to-Speech synthesis using Chatterbox models (original, turbo, multilingual)

### Critical Functions

| Function | Purpose |
|----------|---------|
| `_load_model(model_type)` | Loads TTS model into GPU/CPU memory |
| `generate(text, model_type, ...)` | Synthesizes audio from text |
| `unload_model(model_type)` | Frees VRAM by unloading model |
| `save_audio(audio, path)` | Saves generated audio to file |

### Error Codes

| Code | Name | Scenario | Retryable |
|------|------|----------|-----------|
| 1001 | TTS_MODEL_LOAD_FAILED | Model not found, corrupted, or incompatible | No |
| 1002 | TTS_MODEL_NOT_FOUND | Model files don't exist | No |
| 1003 | TTS_CUDA_OOM | GPU out of memory | Yes (CPU fallback) |
| 1004 | TTS_VOICE_NOT_FOUND | Voice ID doesn't exist | No |
| 1005 | TTS_GENERATION_FAILED | Synthesis error | Yes |
| 1006 | TTS_AUDIO_INVALID | Generated audio is corrupted | Yes |
| 1007 | TTS_TEXT_TOO_LONG | Input exceeds max length | No |
| 1008 | TTS_LANGUAGE_UNSUPPORTED | Language not supported | No |

### Dependencies
- `torch`, `torchaudio`
- Chatterbox models from HuggingFace

---

## 2. STT Service (`stt_service.py`)

**Module:** `stt`
**Responsibility:** Speech-to-Text transcription using Faster-Whisper (local) or API providers

### Critical Functions

| Function | Purpose |
|----------|---------|
| `transcribe(audio_path, language)` | Main transcription entry point |
| `_transcribe_local(...)` | Local Faster-Whisper transcription |
| `_transcribe_openai(...)` | OpenAI Whisper API |
| `_transcribe_groq(...)` | Groq API |
| `_transcribe_deepgram(...)` | Deepgram API |
| `_transcribe_elevenlabs(...)` | ElevenLabs API |

### Error Codes

| Code | Name | Scenario | Retryable |
|------|------|----------|-----------|
| 2001 | STT_MODEL_LOAD_FAILED | Whisper model load failed | No |
| 2002 | STT_MODEL_NOT_FOUND | Model not downloaded | No |
| 2003 | STT_AUDIO_INVALID | Audio format unsupported | No |
| 2004 | STT_TRANSCRIPTION_FAILED | Transcription error | Yes |
| 2005 | STT_LANGUAGE_UNSUPPORTED | Language not supported | No |
| 2008 | STT_CUDA_OOM | GPU out of memory | Yes |

### Dependencies
- `faster-whisper`
- `ffmpeg` (for audio conversion)
- API keys for cloud providers

---

## 3. Transcription Service (`transcription_service.py`)

**Module:** `transcription`
**Responsibility:** Long-form transcription with progress tracking, pause/resume, and cancellation

### Critical Functions

| Function | Purpose |
|----------|---------|
| `start_job(file_path)` | Initiates async transcription job |
| `process_segments()` | Processes audio in chunks |
| `pause_job(job_id)` | Pauses transcription |
| `resume_job(job_id)` | Resumes from checkpoint |
| `cancel_job(job_id)` | Cancels and cleans up |
| `finalize_job(job_id)` | Generates final output |

### Error Codes

| Code | Name | Scenario | Retryable |
|------|------|----------|-----------|
| 3001 | TRANS_JOB_NOT_FOUND | Invalid job ID | No |
| 3003 | TRANS_FILE_NOT_FOUND | Input file missing | No |
| 3004 | TRANS_FILE_TOO_LARGE | Exceeds size limit | No |
| 3005 | TRANS_FILE_INVALID | Corrupted file | No |
| 3006 | TRANS_INTERRUPTED | System interrupted | Partial |
| 3007 | TRANS_CANCELLED | User cancelled | No |
| 3008 | TRANS_OUTPUT_FAILED | Write error | Yes |
| 3011 | TRANS_FFMPEG_FAILED | FFmpeg processing failed | Yes |

### Job States
- `pending` → `transcribing` → `completed`
- `transcribing` → `paused` → `transcribing`
- Any → `cancelled` | `failed`

---

## 4. Diarization Service (`diarization_service.py`)

**Module:** `diarization`
**Responsibility:** Speaker identification using pyannote or clustering algorithms

### Critical Functions

| Function | Purpose |
|----------|---------|
| `diarize(audio_path)` | Identifies speakers in audio |
| `assign_speakers(segments)` | Assigns speaker labels to segments |
| `rename_speaker(id, name)` | Renames detected speaker |
| `_load_pyannote_model()` | Loads pyannote pipeline |

### Error Codes

| Code | Name | Scenario | Retryable |
|------|------|----------|-----------|
| 4001 | DIAR_MODEL_LOAD_FAILED | pyannote model unavailable | No |
| 4002 | DIAR_AUTH_REQUIRED | HuggingFace token missing | No |
| 4003 | DIAR_THERMAL_GUARD | GPU throttling | Yes (delay) |
| 4004 | DIAR_NO_SPEAKERS | No speech detected | No |
| 4005 | DIAR_PROCESSING_FAILED | Processing error | Yes |
| 4007 | DIAR_CUDA_OOM | GPU out of memory | Yes |

### Dependencies
- `pyannote.audio` (optional)
- HuggingFace token for pyannote models

---

## 5. Music Service (`music_service.py`)

**Module:** `music`
**Responsibility:** Music generation using DiffRhythm model

### Critical Functions

| Function | Purpose |
|----------|---------|
| `generate(prompt, duration)` | Generates music from prompt |
| `load_model()` | Loads DiffRhythm model |
| `unload_model()` | Frees memory |

### Error Codes

| Code | Name | Scenario | Retryable |
|------|------|----------|-----------|
| 5001 | MUSIC_MODEL_UNAVAILABLE | DiffRhythm not installed | No |
| 5002 | MUSIC_MODEL_LOAD_FAILED | Model load error | No |
| 5003 | MUSIC_CUDA_OOM | GPU out of memory | Yes |
| 5004 | MUSIC_GENERATION_FAILED | Generation error | Yes |
| 5005 | MUSIC_PROMPT_INVALID | Invalid prompt | No |
| 5006 | MUSIC_DURATION_INVALID | Invalid duration | No |

### Dependencies
- `diffrhythm` (optional)
- Large model files

---

## 6. SFX Service (`sfx_service.py`)

**Module:** `sfx`
**Responsibility:** Sound effects generation from video using MMAudio

### Critical Functions

| Function | Purpose |
|----------|---------|
| `generate(video_path, prompt)` | Generates SFX for video |
| `load_model()` | Loads MMAudio model |

### Error Codes

| Code | Name | Scenario | Retryable |
|------|------|----------|-----------|
| 6001 | SFX_MODEL_UNAVAILABLE | MMAudio not installed | No |
| 6003 | SFX_VIDEO_INVALID | Video format unsupported | No |
| 6004 | SFX_GENERATION_FAILED | Generation error | Yes |
| 6005 | SFX_CUDA_OOM | GPU out of memory | Yes |

### Dependencies
- `mmaudio` (optional)
- Video processing libraries

---

## 7. History Service (`history_service.py`)

**Module:** `history`
**Responsibility:** Persists generation history to SQLite database

### Critical Functions

| Function | Purpose |
|----------|---------|
| `save_tts_entry(...)` | Saves TTS generation |
| `save_stt_entry(...)` | Saves transcription |
| `get_entries(filters)` | Queries history |
| `delete_entry(id)` | Removes entry |
| `clear_history()` | Clears all entries |

### Error Codes

| Code | Name | Scenario | Retryable |
|------|------|----------|-----------|
| 7001 | HIST_DB_LOCKED | SQLite locked | Yes |
| 7002 | HIST_DB_CORRUPTED | Database corruption | No |
| 7003 | HIST_DISK_FULL | No disk space | No |
| 7004 | HIST_ENTRY_NOT_FOUND | ID doesn't exist | No |
| 7005 | HIST_WRITE_FAILED | Write error | Yes |

### Database
- SQLite file at `{APP_DATA}/history.db`
- Automatic migrations on startup

---

## 8. Voice Changer (`voice_changer/service.py`)

**Module:** `voice_changer`
**Responsibility:** Voice conversion using RVC or similar models

### Critical Functions

| Function | Purpose |
|----------|---------|
| `convert(audio, target_voice)` | Converts voice |
| `load_model(voice_id)` | Loads voice model |
| `list_voices()` | Lists available target voices |

### Error Codes

| Code | Name | Scenario | Retryable |
|------|------|----------|-----------|
| 8001 | VC_MODEL_UNAVAILABLE | RVC not installed | No |
| 8003 | VC_VOICE_NOT_FOUND | Target voice missing | No |
| 8004 | VC_CONVERSION_FAILED | Conversion error | Yes |
| 8005 | VC_CUDA_OOM | GPU out of memory | Yes |

---

## 9. Voice Isolator (`voice_isolator/service.py`)

**Module:** `voice_isolator`
**Responsibility:** Separates voice from background noise/music using Demucs

### Critical Functions

| Function | Purpose |
|----------|---------|
| `separate(audio_path)` | Separates voice track |
| `load_model()` | Loads Demucs model |

### Error Codes

| Code | Name | Scenario | Retryable |
|------|------|----------|-----------|
| 9001 | VI_MODEL_UNAVAILABLE | Demucs not installed | No |
| 9003 | VI_SEPARATION_FAILED | Separation error | Yes |
| 9004 | VI_CUDA_OOM | GPU out of memory | Yes |
| 9005 | VI_AUDIO_INVALID | Invalid audio format | No |

---

## 10. Dubbing Service (`dubbing/service.py`)

**Module:** `dubbing`
**Responsibility:** Automatic video dubbing (transcribe → translate → TTS → sync)

### Critical Functions

| Function | Purpose |
|----------|---------|
| `dub_video(video, target_lang)` | Full dubbing pipeline |
| `extract_audio(video)` | Extracts audio track |
| `sync_audio(audio, video)` | Synchronizes dubbed audio |

### Error Codes

| Code | Name | Scenario | Retryable |
|------|------|----------|-----------|
| 10001 | DUB_VIDEO_INVALID | Video format unsupported | No |
| 10002 | DUB_TRANSLATION_FAILED | Translation error | Yes |
| 10003 | DUB_SYNC_FAILED | Audio sync error | Yes |
| 10004 | DUB_TTS_FAILED | Voice synthesis error | Yes |
| 10007 | DUB_LANGUAGE_UNSUPPORTED | Target language unavailable | No |

---

## 11. Loopback Service (`loopback_service.py`)

**Module:** `loopback`
**Responsibility:** Real-time audio capture from system audio (WASAPI loopback)

### Critical Functions

| Function | Purpose |
|----------|---------|
| `start()` | Starts audio capture |
| `stop()` | Stops capture |
| `get_audio_chunk()` | Gets buffered audio |
| `list_devices()` | Lists audio devices |

### Error Codes

| Code | Name | Scenario | Retryable |
|------|------|----------|-----------|
| 11001 | LOOP_DEVICE_NOT_FOUND | Audio device unavailable | No |
| 11002 | LOOP_CAPTURE_FAILED | Capture error | Yes |
| 11003 | LOOP_WEBSOCKET_CLOSED | WebSocket disconnected | Yes |
| 11004 | LOOP_BUFFER_OVERFLOW | Buffer full | Yes |
| 11005 | LOOP_PERMISSION_DENIED | OS permission denied | No |

### Platform Notes
- Windows: Uses WASAPI via `pyaudiowpatch`
- Requires specific audio device configuration

---

## 12. AI Editor (`ai_editor.py`)

**Module:** `ai_editor`
**Responsibility:** Text editing using LLM providers (OpenAI, Claude, etc.)

### Critical Functions

| Function | Purpose |
|----------|---------|
| `edit(text, instruction)` | Applies AI edit |
| `list_providers()` | Lists available AI providers |

### Error Codes

| Code | Name | Scenario | Retryable |
|------|------|----------|-----------|
| 12001 | AI_PROVIDER_UNAVAILABLE | Provider not configured | No |
| 12002 | AI_API_KEY_INVALID | Invalid API key | No |
| 12003 | AI_RATE_LIMITED | Rate limit exceeded | Yes (delay) |
| 12004 | AI_RESPONSE_INVALID | Malformed response | Yes |
| 12005 | AI_TIMEOUT | Request timeout | Yes |
| 12006 | AI_CONTEXT_TOO_LONG | Text exceeds limit | No |

### Providers
- OpenAI (GPT-4, GPT-3.5)
- Anthropic (Claude)
- Google (Gemini)
- Local (Ollama)

---

## 13. Reader Service (`reader_service.py`)

**Module:** `reader`
**Responsibility:** Text reading using TTS (primarily Kokoro for streaming)

### Critical Functions

| Function | Purpose |
|----------|---------|
| `read(text, voice)` | Reads text aloud |
| `read_clipboard()` | Reads from clipboard |
| `synthesize_to_file(...)` | Saves reading to file |

### Error Codes

| Code | Name | Scenario | Retryable |
|------|------|----------|-----------|
| 13001 | READ_TEXT_EMPTY | No text to read | No |
| 13002 | READ_TTS_FAILED | TTS synthesis error | Yes |
| 13003 | READ_CLIPBOARD_FAILED | Clipboard access error | Yes |
| 13004 | READ_FILE_INVALID | File format unsupported | No |
| 13005 | READ_CANCELLED | User cancelled | No |

---

## Provider/API Errors (90xx)

These errors apply across multiple modules when using external APIs.

| Code | Name | Scenario | Retryable |
|------|------|----------|-----------|
| 9001 | PROVIDER_API_KEY_INVALID | Invalid API key | No |
| 9002 | PROVIDER_API_KEY_MISSING | Key not configured | No |
| 9003 | PROVIDER_RATE_LIMITED | Rate limit exceeded | Yes |
| 9004 | PROVIDER_TIMEOUT | Request timeout | Yes |
| 9005 | PROVIDER_UNAVAILABLE | Service down | Yes |
| 9006 | PROVIDER_RESPONSE_INVALID | Bad response | Yes |
| 9007 | PROVIDER_QUOTA_EXCEEDED | Usage quota exceeded | No |

---

## System Errors (99xx)

General system-level errors.

| Code | Name | Scenario | Retryable |
|------|------|----------|-----------|
| 9901 | SYS_DISK_FULL | No disk space | No |
| 9902 | SYS_MEMORY_LOW | Low system memory | Yes |
| 9903 | SYS_CUDA_UNAVAILABLE | CUDA not available | No |
| 9904 | SYS_FFMPEG_MISSING | FFmpeg not installed | No |
| 9905 | SYS_PERMISSION_DENIED | File permission error | No |
| 9906 | SYS_NETWORK_ERROR | Network connectivity | Yes |
| 9999 | SYS_INTERNAL_ERROR | Unexpected error | No |

---

## Using the Diagnostics System

### Enabling Dev Mode

Set environment variable before starting:
```bash
set DEV_MODE=true
python main.py
```

### Viewing Errors

1. Click "Dev Diagnostics" in sidebar
2. View errors grouped by fingerprint
3. Click "Copy Bug Report" for formatted error info
4. Click "Bundle" to download full diagnostic ZIP

### Instrumenting New Code

```python
from diagnostics import log_function, error_context
from diagnostics.error_codes import ErrorCode

@log_function(module="mymodule", error_code=ErrorCode.MY_ERROR)
def my_function(param1, param2):
    with error_context(provider="myprovider", model="mymodel"):
        # Your code here
        pass
```

### Adding New Error Codes

1. Add to `diagnostics/error_codes.py` in appropriate range
2. Add metadata in `_ERROR_METADATA` dict
3. Update this documentation
