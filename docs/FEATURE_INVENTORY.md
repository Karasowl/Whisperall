# Whisperall - Feature Inventory (1 Page)

Date: 2026-02-03

Purpose: a compact map of what exists today, what job-to-be-done (JTBD) each module solves, and how it should be positioned (Core / Tools / Labs).

Legend:
- Core: must feel premium; drives retention and monetization.
- Tools: supporting workflows; still polished but not the "first impression".
- Labs: experimental / optional; should not distract from Core.

## Modules (Frontend)

| Module | Route | JTBD (Job-to-be-done) | Inputs | Outputs | Dependencies | Position |
|---|---|---|---|---|---|---|
| Text to Speech (TTS) | `/` | Turn text into high-quality speech quickly (with optional voice cloning). | Text, optional reference audio | Audio file (wav/mp3), playback | Local TTS models; optional TTS APIs; GPU optional | Tools (can become Core later) |
| Reader (TTS Utility) | `/reader` | Read clipboard/text out loud (fast utility). | Clipboard text / pasted text | Audio playback | TTS provider | Tools |
| Dictation (STT) | `/dictate` | Speak anywhere and get text typed/pasted into the focused app. | Microphone audio (live) | Transcript + auto-paste | STT provider (local/API), overlay + hotkeys | Core |
| Live Transcription (Loopback) | `/loopback` | Capture system audio / meeting audio and get live transcript. | System audio (loopback) | Live transcript, export | OS audio routing; STT provider | Tools (or Core if meeting-focused) |
| Transcribe (Files) | `/transcribe` | Turn long audio/video files into text with progress + exports. | Audio/video file | Transcript, timestamps, export formats | Transcription service, diarization (optional) | Tools |
| History | `/history` | Browse, search, re-open past outputs across modules. | Stored entries | Replay / re-download / copy | History DB (SQLite) | Tools (key retention) |
| Voice Library | `/voices` | Manage voices/presets; reuse voices in TTS and cloning. | Voice metadata, audio samples | Voice presets | Local storage, provider voice APIs | Tools |
| Train Voice | `/voices/train` | Create a new custom voice (cloning) from samples. | Training samples | New voice entry | Model-specific; storage | Tools (Pro feature candidate) |
| Voice Changer | `/voice-changer` | Transform one voice into another (post-processing). | Audio file + target voice/settings | New audio | Voice conversion model/provider | Tools |
| Voice Isolator | `/voice-isolator` | Remove noise/isolates voice stems from audio. | Audio file | Clean vocal track | Source separation model/provider | Tools |
| Auto Dubbing | `/dubbing` | Translate + re-voice content into another language. | Audio/video + target language | Dubbed audio/video | STT + Translate + TTS chain | Tools (complex workflow) |
| Translate | `/translate` | Translate text (or transcript) into another language quickly. | Text | Translated text | Local (Argos) or API LLM/DeepL | Tools |
| AI Edit | `/ai-edit` | Rewrite/edit text with an LLM (summarize, correct, style). | Text + prompt | Edited text | Local (Ollama) or cloud LLMs | Tools |
| Sound Effects (SFX) | `/sfx` | Generate SFX from text prompt. | Prompt | Audio | Local SFX model or API | Labs (until core is solid) |
| Music | `/music` | Generate music from text prompt/lyrics. | Prompt, lyrics | Audio | Mostly external or heavy local models | Labs |
| Models | `/models` | Install / remove local models; manage disk/VRAM expectations. | Model choices | Installed models | Model registry + downloads | Setup (critical) |
| Settings | `/settings` | Configure API keys, hotkeys, UI, privacy, device/perf defaults. | User preferences | Persisted config | Backend settings service + Electron | Setup (critical) |

## Notes / Decisions Needed

- If the goal is to compete with Wispr Flow, **Dictation** is the product "front door" and must be the default first-run experience.
- Music/SFX are valuable but should be visually grouped as **Labs** to avoid diluting the product narrative.
- Voice workflows (voices/train, voice changer, isolator, dubbing) fit best as Pro features once the core dictation loop is premium.

