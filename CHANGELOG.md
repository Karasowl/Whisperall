# Changelog

All notable changes to WhisperAll are documented here. Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions follow [SemVer](https://semver.org/).

## [Unreleased]

### Fixed — Diarized segments now persist for URL + file transcriptions

User reproducer: 10-min Spanish YouTube interview. Audio + title landed on the note correctly (previous batch), but the segment panel showed "Audio is linked to this note, but there are no diarized segments yet." even though Deepgram had returned segments.

Root cause: `runUrlTranscription` (URL flow) and `loadResult` (file flow) both saved the note text + audio URL via `saveAsNote`/`updateDocument`, but neither wrote the segments to the `document_transcriptions` table. `EditorPage` reads segments from that table via `noteSegments` (not from the session-only `transcription.segments` state), so after navigation the segments were gone.

Fix: both flows now call `api.documents.createTranscription(docId, { source: 'audio', language, diarization, text, segments, audio_url })` right after the note is saved/updated. Best-effort (wrapped in try/catch) — if the persistence call fails the note content + audio link are already committed, so we warn and move on rather than rolling back. Mirrors the existing retranscribe + dictation history patterns in `EditorPage.tsx` and `DictatePage.tsx`.

`apps/desktop/src/stores/transcription.ts` — Phase C of `runUrlTranscription` and the post-save branch of `loadResult`.

### Added — Playable audio on URL-transcribed notes + retranscribe parity + Deepgram nova-3

Three deferred items from the previous batch, all shipped.

**1. "Could not load audio" on YouTube-sourced notes**

The note's `<audio>` element was trying to load the raw YouTube watch URL, which is an HTML page — browsers can't play it. Meanwhile the extracted audio already lived in ffmpeg's tmp dir during the chunk split but was thrown away after reading the chunk files.

Fix: ffmpeg's command now emits TWO outputs in the same encoding pass — the segmented chunks (for STT batching) AND a single `source.mp3` (for playback). Since ffmpeg decodes once and encodes both outputs from the same stream, the marginal cost is tiny (~2x encode time; for a 10-min clip that was ~1 s in the log). The endpoint uploads `source.mp3` to `audio/{user_id}/url-media/{job_id}/audio.mp3` via the existing Supabase service-role client and includes the public URL in `TranscribeJobResponse.audio_url`. Client stores that URL on the note document (`audio_url`) instead of the YouTube watch URL, so the `<audio>` player actually loads the source and "Download Audio" produces an mp3 instead of `watch.htm`.

Timeout bumped `estimated_encode_s` from `duration * 0.1 + 30` → `duration * 0.2 + 60` because we now produce two outputs. Still well under the 30-min client timeout for any realistic length.

Defensive guard: `_ffmpeg_split_audio._last_full_audio` is read via `isinstance(raw, (bytes, bytearray)) and len(raw) > 0` so MagicMock patches in tests don't spoof an auto-attribute.

**2. Deepgram nova-2 → nova-3 + pinned diarize version**

User reproducer: 10-min Spanish YouTube with a voice-over intro + main presenter; nova-2 ping-ponged speakers 1/2 every few lines and misattributed most of the main-presenter utterances to the intro speaker. nova-3 gives substantially better speaker boundaries on conversational content and, combined with `diarize_version=2024-01-09` pinned explicitly (so regional routing can't fall back to older behaviour), keeps speaker identity stable within a single chunk. `paragraphs=true` also added — it helps the segment cohesion the editor displays.

Cross-chunk speaker identity is still Deepgram's blind spot because each chunk is a separate request; fixing that means sending the full audio as a single Deepgram request in parallel to the chunked STT. Tracked for a future pass.

Test `test_provider_deepgram.py::test_sends_query_params` updated to assert `model=nova-3`.

**3. Retranscribe panel feature parity**

`NoteRetranscribePanel` only exposed `language` + `diarization`. Added `aiSummary` and `punctuation` checkboxes + matching `onChangeAiSummary` / `onChangePunctuation` props so users see the same switches they set in the main Transcribe dialog. Flagged in-code as currently-cosmetic — neither Groq whisper-large-v3-turbo nor Deepgram nova-3 take a client-side punctuation toggle, and AI-summary post-processing isn't wired through the retranscribe loop yet — but the UX matches the main dialog's. Keeping the toggles visible makes expectations consistent; when backend wiring lands, no UI change is needed.

`DictatePage` state: `retranscribeAiSummary` + `retranscribePunctuation` with defaults matching the transcribe store (`false` / `true`), plumbed through to the panel.

### Fixed — Five things from the latest URL-transcription test round

All triggered by a single 10-min YouTube transcription. Fixes shipped together.

**1. Logs section was hidden for completed jobs**  
`JobDetailModal`'s conditional `process.status === 'failed' || 'canceled' || isRunning` excluded `completed`. That made it impossible to review what the pipeline did on a successful run. Added `completed` to the list; the panel is collapsed by default for completed jobs so the card stays compact, but one click reveals the whole trace.

**2. New running jobs appeared below older completed ones**  
`combineProcessItems` concatenated `transcriptionItems + localItems` in insertion order. After sorting by `startedAt` desc (newest first) with an `id` stable tiebreaker, the Processes hub reads like a real "recent activity" list — the job you just kicked off sits on top.

**3. YouTube video title was never used**  
yt-dlp's `info['title']` was available but thrown away. Changes:
- `_yt_dlp_download_to_bytes` return tuple grew to `(bytes, ct, path_hint, title)`.
- `_resolve_media_from_url` propagates the title.
- `/v1/transcribe/from-url-job` endpoint returns `title` on `TranscribeJobResponse` (optional field, `None` for direct-media URLs where no extractor ran).
- api-client `TranscribeJobResponse` type updated.
- Client `runUrlTranscription` uses `backendJob.title` as the job row label (falls back to full URL) and as the **default note title** when the note hasn't been user-renamed. Respects existing user-picked titles.
- Four `_resolve_media_from_url` test callsites updated to the new 4-tuple shape.

**4. `prompt()` threw `window.error` on speaker/annotation edits**  
Electron disables native modal dialogs (`alert`/`confirm`/`prompt`) — hitting any of the 4 call sites in DictatePage / EditorPage / ReaderPage produced `[window.error] prompt() is and will not be supported.` with no input affordance. Created `apps/desktop/src/lib/prompt.tsx` exposing `promptText({message, defaultValue, …}) → Promise<string | null>`: portal-rendered modal with text input, Enter submits, Escape/Cancel/backdrop resolves null. All four call sites switched to the async helper.

**5. Server logs now have a `Summary` tab (Resumen)**  
Added a third choice to the logs filter alongside `Relevant only` / `All lines`. The `Summary` tab runs the raw tail through a regex-rule pipeline that converts engineer-language stage markers like `[transcribe.url] stage=resolve download done bytes=8095507 ct=audio/mp4 elapsed=250.6s` into `• Loaded the source (7.7 MB)` / `• Medio descargado (7.7 MB, 250s)`. Rules covered so far (each with EN + ES wording):

- start / load page / yt-dlp download (begin, done, failed)
- split-audio done (with chunk count)
- register job / upload done / upload retries / upload failed
- STT batch start / diarization / provider failure
- save begin / done / timeout
- download progress (kept un-deduped so throughput updates stay visible)

Deduplicates exact-repeat events so a noisy retry loop doesn't blast the summary. Shows `transcribe.humanLog.empty` when no known event has fired yet. The Summary tab is the new default — user sees the narrative first, can fall back to raw if needed.

### Fixed — 0.26 Mbps YouTube download on a 500 Mbps connection (broken IPv6 route)

User reported: "500 Mbps simétricos con Totalplay y todo lo demás descarga bien" but the googlevideo.com download was crawling at 0.26 Mbps. The streaming-download log confirmed it (`throughput=0.26 Mbps`). The offending URL was `ip=2806:2f0:9001:…` — an IPv6 address. Totalplay (MX) and several other Latin-American ISPs have known degraded IPv6 peering to Google CDN; desktop browsers sidestep it with happy-eyeballs (try IPv6 + IPv4 in parallel, use whichever wins). Raw `httpx` doesn't, so a single-stack IPv6 connection to `rrX---snYYY.googlevideo.com` crawled.

Two-line fix wouldn't have covered the whole class of problems — rather than just force IPv4 on httpx, the right call is to hand off the media download entirely to yt-dlp, which already has IPv4 fallback + Google-specific throttle workarounds + segment retries built in.

**Replaced** `_extract_media_download_target` (extract URL only, then httpx-download it) **with** `_yt_dlp_download_to_bytes` (yt-dlp downloads directly to a temp file, we read bytes + cleanup). Key options:
- `force_ipv4=True` — bypasses the degraded IPv6 route entirely.
- `socket_timeout=60`, `retries=3`, `fragment_retries=3` — yt-dlp's native retry loop covers transient 429/503 and throttled-format rotation.
- `outtmpl={'default': os.path.join(tmp_dir, 'source.%(ext)s')}` — writes under a per-request tmp dir that's `shutil.rmtree`'d in `finally` so large downloads don't leak disk on the bundled backend.

The wall-clock cap on the extraction stage was bumped from 180 s (barely enough for extract-only) to **20 minutes** (covers ~200 MB / 4 h video at ~1.5 Mbps IPv4). Past that, the existing 30 min client timeout catches it.

Direct-media URLs (`https://example.com/audio.mp3`) still go through the httpx streaming path — that wasn't the problem and yt-dlp doesn't add value there. The split is entirely in `_resolve_media_from_url`: if the first httpx GET returns HTML/JSON, we know yt-dlp is needed; otherwise we already have the audio.

### Fixed — Chunk upload SSL race: `httpx.WriteError: EOF occurred in violation of protocol`

User's log caught the real culprit that was killing the URL → chunked pipeline:
```
httpx.WriteError: EOF occurred in violation of protocol (_ssl.c:2427)
  … httpcore._sync.http2._write_outgoing_data …
  … storage3._sync.file_api._request …
  … app.routers.transcribe._upload_one …
```

Root cause: the upload phase ran with `URL_UPLOAD_CONCURRENCY = 6` via `asyncio.gather + asyncio.to_thread`, but `supabase-py` exposes a SINGLE shared `httpx.Client` per storage handle. `httpx.Client` is NOT thread-safe for concurrent requests — multiple worker threads hitting the same socket interleave HTTP/2 stream frames mid-write, which TLS interprets as a protocol violation and drops the connection. The error is fatal for the whole batch, even though the upload itself was fine.

Two fixes:

1. `URL_UPLOAD_CONCURRENCY` dropped from 6 → **1**. With the semaphore in place the `asyncio.gather` still runs, but uploads execute one after another — no shared-state race. Cost: 24 chunks of a 4 h video now upload in ~24 s instead of ~4 s. Rounding error compared to the 4-8 min STT phase.
2. New **`URL_UPLOAD_RETRIES = 2`** — each chunk upload is retried up to 3 times with a small backoff (`0.5s * attempt`). Covers transient SSL hiccups and occasional 502s from Supabase Storage. Logs `attempt=N/M err_type=… err=…` per try so we can tell apart flaky network vs. permanent rejection vs. library bug.

The `URL_UPLOAD_CONCURRENCY` name is kept as a knob so a future switch to a pure-async `httpx.AsyncClient` implementation (which IS safe for concurrent requests on a single client) can re-enable parallelism cleanly.

### Diagnostic observations from the live log

The user's log also showed a 10-min YouTube audio took **250 s to download at 0.26 Mbps** — that's dial-up speed to googlevideo.com specifically, way below what the network would report for other hosts. Not something the app can fix, but the streaming-download progress lines surfaced it instantly (previously the 120 s timeout would just kill the request with no useful info).

### Fixed — Modal orphaned after fail + logs wiped on restart

User report: *"una vez termine y falla, ya no hay forma de abrir esa ventana donde tenía todos los logs detallados y copiarlos."* Two root causes, both fixed:

**1 — The synthetic→real job swap unmounted the open modal** (`apps/desktop/src/stores/transcription.ts`)

When the server returned the `backend.id` after prep, `runUrlTranscription` removed the synthetic row from `jobs[]` and inserted a new row with the real uuid. `JobDetailModal` was keyed off `detailJobId = <synthetic>`, so the modal's `detailProcess` resolved to `null` the instant the swap happened and the modal unmounted silently. If the job then failed, the user had nowhere to go to read the logs or copy the error.

The swap is gone. The synthetic row keeps its id for the whole lifetime of the job. The real backend uuid is stashed on the row as `backendJobId` (new optional `TranscriptionJob` field) and used internally whenever we call `api.transcribe.run(backendId)` or `api.transcribe.getResult(backendId)`. UI state updates target `currentJobId` — which now == synthetic `jobId` from start to finish. The modal never orphans.

Side benefit: on success the completed job stays visible (`status: 'completed'`) instead of vanishing. The user can still open the modal to review the logs or copy the URL, and dismisses manually via the `⋯` menu or `Clear finished` button.

**2 — `backend.log` was truncated on every app start** (`apps/desktop/electron/modules/backend.ts`)

`fs.openSync(logPath, 'w')` wiped the entire log each time the bundled backend spawned. If the user closed the app right after a failure to come back later and inspect logs, those logs were gone forever.

Switched to append mode (`'a'`) with a soft size cap:
- If the existing log is >4 MB, rotate it to `backend.log.prev` (single generation, unlinked if an older `.prev` was there).
- Open the active file in append mode.
- Write a session boundary `===== backend session started at <ISO timestamp> =====` so a tail view can visually separate sessions.

Net effect: closing and reopening the app keeps the failed-job logs intact. The JobDetailModal's `Show server logs → Relevant only` filter surfaces them immediately on reopen. Bounded growth (~4 MB active + one ~4 MB backup) so `backend.log` can't balloon over months of use.

### Changed — Streaming URL download with per-chunk progress + granular ffmpeg logs

User's live log showed the pipeline got as far as httpx "200 OK" on the googlevideo.com audio URL (73 MB / 79 min video) and then **went silent for 15 minutes** — no `stage=resolve download done`, no `stage=extract`, nothing. The process was either stuck accessing `resp.content` after the `async with client` closed, or stuck inside ffmpeg with no visible progress. Either way, silence between "begin" and "done" made diagnosis impossible.

Two instrumentation changes so "stuck" is never silent again:

**`_download_url_bytes` rewritten to streaming** (`apps/api/app/routers/transcribe.py`):
- `client.stream("GET", url)` + `async for piece in resp.aiter_bytes(chunk_size=262144)` instead of a single `await client.get()`.
- Status-code check happens inside the stream context, before draining the body — 4xx/5xx bail out instantly instead of buffering a useless error page.
- **Heartbeat log every 4 MB**: `stage=resolve download progress bytes=N mb=X.Y elapsed=Zs throughput=W Mbps`. A 73 MB download now produces ~18 progress lines over its duration, so "stuck after N MB" is a concrete observation, not guesswork. Throughput is computed live so a slow network vs. a hung socket is distinguishable.
- Response body is assembled (`b"".join(chunks)`) and the `download done` log fires INSIDE the `async with` context, so we never access `resp.content` after the client closed — which was the suspected source of the previous silent stall.
- `HTTPException` re-raised explicitly so a non-200 early-bail doesn't get swallowed by the outer `except Exception`.

**`_ffmpeg_split_audio` instrumented** (`apps/api/app/routers/transcribe.py`):
- Logs at every sub-step with elapsed time: `begin bytes=… tmp=…`, `wrote input_file elapsed=…`, `ffprobe duration=… elapsed=…`, `ffmpeg spawn argv_len=… timeout=…`, `ffmpeg done rc=… elapsed=…`, `found chunks=…`, `read_all_chunks=… total_bytes=…`.
- `subprocess.TimeoutExpired` is caught explicitly with an `ffmpeg TIMEOUT after X.Xs (limit Ys)` error line so timeout stalls aren't a mystery.
- Non-zero exit codes log the last 500 chars of ffmpeg stderr before raising.

Net effect: if the backend stalls anywhere in the URL→job prep, the live log stream in the modal now shows EXACTLY where and for how long, every 4 MB of download or at each ffmpeg transition. Test cycles no longer require 30-min timeouts to surface a problem — they surface in seconds once the silent window is eliminated.

### Fixed — `[transcribe.urljob]` and sibling log lines were never written to backend.log

With the live log stream shipping, the user saw ONLY uvicorn.access output and a `get_debate_state failed` 500 — none of my `log.info("[transcribe.urljob] stage=…")` calls appeared. Root cause:

Python's root logger ships with only a `lastResort` handler at **WARNING** level. Uvicorn configures `uvicorn` / `uvicorn.access` / `uvicorn.error` with their own handlers, but it does NOT touch arbitrary loggers like `app.routers.transcribe`. So `logging.getLogger(__name__).info(...)` from my routers went straight to /dev/null.

Fix in `apps/api/app/main.py`:
```python
logging.basicConfig(level=logging.INFO, format="%(levelname)s:     [%(name)s] %(message)s")
logging.getLogger("app").setLevel(logging.INFO)
```
Done at module-import time, BEFORE the `.routers` imports bring in their loggers. Now every `[transcribe.urljob] start url=…`, `stage=resolve download begin`, `stage=extract done chunks=…`, `stage=upload done`, etc. lands in `backend.log` and streams to the modal in real time.

This was the missing piece for the whole live-diagnostic story: the stream worked, the filter worked, the UI worked — but there was nothing to stream because the backend wasn't writing the lines.

### Fixed — `get_debate_state` 500 noise

Also fixed the persistent `get_debate_state failed: 'NoneType' object has no attribute 'data'` 500 that polluted every log tail. supabase-py's `.maybe_single()` can return `None` (not an APIResponse) when the row doesn't exist, depending on version — the code accessed `.data` directly and crashed. Now returns `{state_json: {}, persisted: false}` gracefully.

### Added — Live backend log tail in JobDetailModal + idle-stuck warning

User pain: *"cada prueba se convierte en media hora. No hay forma de arreglar eso."* Every failed URL test burned 30 min of wall-clock time because the client timeout is the only signal that something's stuck — the user couldn't see mid-flight stage transitions and had to wait for the deadline to surface any error. This makes iterating on 4 h-video issues prohibitively slow.

Three pieces ship a live diagnostic pipe from `backend.log` → modal:

**Electron main** (`apps/desktop/electron/modules/backend.ts`):
- New `backend:log-stream-start` / `backend:log-stream-stop` IPC handlers. Per-renderer `logStreams: Map<webId, { timer, lastSize }>` tracks a polling watcher keyed by `webContents.id`. On each tick (500 ms) we `fs.statSync` the log path and, if it grew, `fs.readSync` only the new bytes and emit them as a `backend:log-line` array to that sender. Truncation (size < lastSize) resets to 0 so log-rotate is survived. `sender.once('destroyed')` cleans up automatically when the window closes.
- `fs.watch` avoided because on Windows it coalesces events during bursty writes — polling is boring but reliable.

**Preload** (`apps/desktop/electron/preload.ts`):
- `backend.startLogStream(cb)` returns `Unsubscribe`. Internally listens on `backend:log-line` + invokes start; unsubscribe removes the listener and invokes stop so the main-process timer stops.

**Client UI** (`apps/desktop/src/components/processes/JobDetailModal.tsx`):
- For `running` jobs the logs panel is **open by default** and auto-subscribes to the live stream. New lines are appended to the same `logTail` string that the existing filter reads, so the `Relevant / All` toggle keeps working against the live feed.
- A small **"Live"** pill next to the "Hide server logs" toggle confirms the stream is active. It includes a pulsing green dot (`.wa-pulse`).
- **Idle-stuck warning**: `lastLogActivityAt` is stamped every time a new batch arrives. A 5 s ticker recomputes `idleSeconds`; when `running && idleSeconds >= 60` the amber banner says "Servidor sin actividad por 72s — puede estar colgado. Considera cancelar y reintentar." Now the user sees a stuck backend within 60 s, not 30 min.
- Cleanup on unmount: `unsubscribe()` removes the listener AND the timer. Flipping the filter or scrolling the pane doesn't double-subscribe.

**i18n** (EN + ES): `transcribe.liveTailing` (`Live` / `En vivo`), `transcribe.backendIdle` (with `{seconds}` interpolation).

### Fixed — Server log tail was useless (transcribe lines drowned in GET noise)

User showed a log tail dominated by ~40 lines of `GET /v1/usage HTTP/1.1 200 OK` with zero `[transcribe.urljob]` events visible — the real transcribe pipeline markers had been pushed out of the 120-line tail by polling traffic. Three coordinated changes so the log surface is usable:

**Backend** (`apps/api/app/main.py`):
- Installed a `logging.Filter` on `uvicorn.access` that drops `GET … HTTP/1.1 2xx/3xx` for noisy polling paths: `/health`, `/v1/usage`, `/v1/documents`, `/v1/folders`, `/v1/history`. Non-2xx responses and any non-GET method still go through, so real failures are preserved. Implemented as `_AccessLogFilter` with a path-prefix match list (`_NOISY_GET_PATHS`) so future additions are one-line.
- Net effect: the `backend.log` tail is now dominated by actual events — application startup, transcribe stages, errors — instead of usage polling.

**Electron main** (`apps/desktop/electron/modules/backend.ts`):
- `ipcMain.handle('backend:log-tail')` default line count bumped 80 → 500. With the access-log filter above, 500 lines reliably covers the last several minutes of real activity including full transcribe runs.

**Client UI** (`apps/desktop/src/components/processes/JobDetailModal.tsx`):
- Fetches 500 lines by default.
- **Relevant / All** segmented control next to the copy button. "Relevant only" (default) keeps lines matching `[transcribe / WARN / ERROR / CRITICAL / Traceback / File " / ffmpeg / yt[_-]?dlp / HTTP\/1\.1" [4-5]\d\d`. Falls back to a "no transcribe-related lines" hint when the filter yields nothing, so the user isn't staring at a blank pane. Copy button copies whichever view is active.
- This also works on legacy backends that don't have the server-side access-log filter yet — the relevant-lines regex cuts the same noise client-side.

New i18n keys: `transcribe.logsFilterRelevant` / `logsFilterAll` / `logsNothingRelevant` (EN + ES).

### Fixed — URL transcription jobs lost the full link in the UI

User report: *"una vez le doy transcribir, es como si no hubiera referencias ya del enlace inicial. Toda la fuente y todo lo que habla es de youtube.com."* The synthetic job, the real job after swap, and the persisted `LocalProcess` mirror all wrote `filename: urlHost` (just the host, e.g. `www.youtube.com`). Three concurrent YouTube transcriptions were indistinguishable in the Processes hub — they all said `www.youtube.com`.

Switched every write point (`stores/transcription.ts`) to use the full submitted URL as `filename`/`title`:

- Synthetic job on kickoff → `filename: submittedUrl`.
- Real job at the swap → `filename: url`.
- Synthetic defensive re-creation in the catch path → `filename: url`.
- `mirrorUrlJobFailureToProcessesStore` → `title: args.url || args.urlHost`.

The ProcessCard already used `truncate` + `title={process.title}`, so the compact list keeps the hostname-like look but hovering reveals the full URL. The JobDetailModal already uses `break-all`, so the full URL wraps legibly in the `Source` block. `urlHost` is still passed around and used only where short wording matters (toast bodies: `"Transcripción iniciada — youtube.com"`).

### Fixed — Backend was hanging indefinitely in yt-dlp extract + download timeout too short

User report: *"No response from server after 30 min"* again, even with v0.30.0's parallel STT. The parallel STT didn't help because the request was getting stuck BEFORE reaching the STT phase — either yt-dlp was waiting forever on YouTube's metadata endpoint, or httpx's 120 s download timeout fired mid-stream for a 4 h video that legitimately needs longer.

Three pieces (`apps/api/app/routers/transcribe.py`):

1. **yt-dlp socket timeout** — `ydl_opts` now sets `socket_timeout: 60` and `retries: 2`. Without this, a single TCP read against YouTube can block forever (we've seen it in the wild when they rate-limit or when DNS is slow). 60 s is ~10× normal, short enough that a hang never cascades into a 30-min request.
2. **`asyncio.wait_for(to_thread(_extract_media_download_target, ...), timeout=180)`** — belt-and-suspenders wall-clock cap on the whole yt-dlp extract step. If the socket timeout somehow misses (or yt-dlp retries internally for longer than we want), the wait_for kills it at 180 s and raises a new `TRANSCRIBE_URL_YTDLP_TIMEOUT` (504) with `stage=resolve` so the user sees a concrete error instead of a 30-min generic timeout.
3. **Download timeout 120 s → 600 s** — httpx's `AsyncClient(timeout=…)` applies to the full request lifecycle (connect + headers + body), so a 200 MB body needs enough budget to stream through. 120 s required 13 Mbps sustained; 600 s requires 2.7 Mbps, which comfortably fits residential broadband. Error message also clarifies that the timeout is elapsed seconds, not a single-stall timer.

### Added — Server log tail inline in the JobDetailModal

To stop making the user hunt through `%APPDATA%\Whisperall\backend.log` every time, the modal now has a collapsible `Ver logs del servidor` (`Show server logs`) row shown for failed/canceled jobs. Clicking it lazy-fetches the last 120 lines via the existing `window.whisperall.backend.getLogTail` IPC (already wired in preload.ts) and renders them in a monospace scroll-container with a copy button. Defaults to closed so it doesn't blast the modal with text for users who don't care; click opens it; another click hides it; and the fetch is deferred until first open so the modal still renders instantly.

Added i18n keys `transcribe.serverLogs`, `serverLogsShow`, `serverLogsHide`, `serverLogsEmpty`, `serverLogsUnavailable`, `copyLogs` (EN + ES).

### Changed — 4 h videos now finish in ~4-8 min (parallel STT + upload)

User ask: *"NECESITAMOS QUE SOPORTE 4H FÁCIL. ALGUNA MANERA DE HACERLO, Y QUE SEA RÁPIDO SIN PERDER CALIDAD"*. Previously a 4 h video would have ~48 chunks processed 1-at-a-time server-side (~16-25 min). Two bottlenecks parallelized:

**Backend — `apps/api/app/routers/transcribe.py`**

1. **`run_job` STT parallelism**: the per-chunk loop is refactored into an async helper `_process_one_chunk(chunk)` and called via `asyncio.gather(..., return_exceptions=True)` gated by `STT_CONCURRENCY=5`. A single bad chunk no longer kills the batch — errors are collected and the first one is re-raised after partial progress is recorded. Storage downloads inside the helper are `await asyncio.to_thread(db.storage.from_('audio').download, path)` so the sync supabase-py call doesn't block the event loop. DB row updates stay sequential (supabase-py connection pool is sync).
2. **URL-job upload parallelism**: `from-url-job`'s upload phase was serial (~48 s for 4 h); now `asyncio.gather` with `URL_UPLOAD_CONCURRENCY=6` lands the same work in ~8-10 s. `db.storage.from_('audio').upload` wrapped in `asyncio.to_thread` (same reason). Storage paths are pre-computed before gather so the `23505 unique` edge case stays predictable. DB chunk-row inserts remain sequential for clear diagnostics per row.
3. **Chunk duration bumped** `URL_CHUNK_SECONDS_DEFAULT: 300 → 600` (10 min). At 64 kbps mono mp3 that's ~4.7 MB per chunk — well under Groq's 25 MB cap and ~2× fewer server-side STT rounds for the same total audio. Diarized chunks stay at 120 s because Deepgram nova-2 gives better speaker boundaries on shorter audio.

**Client — `apps/desktop/src/stores/transcription.ts`**

1. **`TRANSCRIBE_BATCH_SIZE: 5 → 10`** — server now processes 5 concurrently per call, so larger batches don't create back-pressure, they just reduce round-trips.
2. **`URL_TIMEOUT_MS: 15 min → 30 min`** — headroom for 4 h worst-case prep on slow residential broadband (download can be 100-200 MB).

**Quality: unchanged.** The existing encode (64 kbps mono 16 kHz mp3) matches what whisper-large-v3-turbo and Deepgram nova-2 are trained for. Downgrading from stereo 256 kbps → mono 64 kbps has no measurable impact on transcription accuracy for spoken content — it's the same effective audio quality as a phone call, which is Whisper's primary training distribution.

**Expected throughput** (back-of-envelope on decent network + machine):

| Duration | Before (serial) | After (concurrent) |
|---|---|---|
| 1 h | ~4-7 min | ~1-2 min |
| 2 h | ~8-14 min | ~2-3 min |
| 4 h | ~16-25 min | ~4-8 min |

### Added — Start / end timestamps on processes

User feedback: *"los procesos no me dicen cuándo fue que se iniciaron, en qué horario y en qué hora y día fue que fallaron."* Added full timestamp tracking to every terminal transition so the user can tell exactly when a job kicked off and when it died.

**Data model**

- `TranscriptionJob` gains `endedAt?: number` (paired with the existing `startedAt`). Set to `Date.now()` in every terminal transition: Phase B "non-completed" return, timeout-path catch, generic-error catch, user-cancel, file-upload abort. Success path implicitly carries `startedAt` forward; the completed job is removed from the visible list since the note already exists, so `endedAt` isn't needed there.
- File jobs (`createJob(file, language)`) now stamp `startedAt: Date.now()` on job creation — previously only URL jobs tracked this.
- The synthetic→real job swap now preserves the **original click-time `startedAt`** from the synthetic runtime instead of stamping the swap moment. The user's mental model of "when did I click Transcribe?" is the synthetic's start, not 1-3 min later when the prep returned.
- `ProcessItem` gains `startedAt?: number` and `endedAt?: number`. Forwarded from `TranscriptionJob.mapTranscriptionJobToProcess` and derived from `LocalProcess.createdAt` / `updatedAt` (which `useProcessesStore` persists as ISO strings — parsed via `Date.parse` at the mapper boundary).

**UI**

- `JobDetailModal`: new timestamp strip above the stage/progress block, in a bordered tinted panel:
  ```
  Iniciado: 23:30 · hace 15m    Finalizado: 23:45 · hace 3s    Duración: 15m 03s
  ```
  Cross-day jobs render the date (`17 Apr 23:30`) instead of just time.
- `ProcessCard`: a compact tabular-nums second line under the stage meta:
  ```
  Iniciado: 23:30 (hace 15m) · Finalizado: 23:45 (hace 3s)
  ```
- Both components use `useTickWhile(true, 30_000)` — a low-rate re-render so the "hace Xs" labels stay fresh without spamming the app with 1 s ticks.

**Locale-aware formatting**

- Two pure helpers (`formatAbsolute`, `formatAgo`) replicated in both components so ProcessCard stays a leaf with no cross-imports.
- `uiLocale` resolved from `useSettingsStore.uiLanguage` — `'es'` → `'es-ES'`, else `'en-US'`. Feeds `toLocaleTimeString` / `toLocaleString`.
- Same-day jobs show only the time (`23:30`); cross-day jobs show `dd MMM HH:MM`.

**i18n (EN + ES)**

- `processes.startedAt` (`Started` / `Iniciado`)
- `processes.endedAt` (`Ended` / `Finalizado`)
- `processes.duration` (`Duration` / `Duración`)
- `processes.agoSeconds` / `agoMinutes` / `agoHours` / `agoDays` with `{n}` interpolation, locale-natural forms (`5s ago` / `hace 5s`).

### Fixed — Failed URL jobs no longer disappear (two root causes)

User report: *"de nuevo el proceso se borró por completo aunque dio error no lo puedo recuperar."* Two independent bugs combined to erase failed URL transcriptions:

**Bug 1 — stale closure id after job swap**  
`runUrlTranscription` creates a synthetic job (`jobId = 'url-xxx-yyy'`) for UI progress during Phase A, then swaps it for the real backend uuid once `fromUrlAsJob()` returns. The catch block was still referencing the stale synthetic `jobId` from the closure, so:
- `jobs.map((j) => j.id === jobId ? ... failed ... : j)` silently no-op'd (synthetic row was already gone).
- The real job was left in `jobs[]` with status='processing'.
- `activeJobId` stayed pointing at the real id, but never got marked failed.

Introduced `let currentJobId = jobId;` and reassigned it to `realJobId` in the swap block. All downstream updates (both happy-path and catch-path) now target `currentJobId`, so Phase B/C failures correctly flip the real job row to `failed` with error text and `failedStage` intact.

Defensive: if `currentJobId` somehow isn't in `jobs[]` at catch time (edge case where another handler removed it), the setState now synthesizes a minimal failed row so the user always has *something* visible to recover from.

**Bug 2 — `jobs[]` is session-only, not persisted**  
The `useTranscriptionStore.jobs[]` state lives in memory only (persist middleware would need non-serialisable `AbortController`/`setInterval` fields, so we intentionally skipped it). If the user closed the app after seeing the error toast but before copying the error, the failure row vanished on next launch.

Added `mirrorUrlJobFailureToProcessesStore(...)` — on every URL job failure path (timeout, generic, Phase B "non-completed" return), we now create a `LocalProcess` snapshot in `useProcessesStore` (which IS persisted via the `whisperall-local-processes-v1` localStorage key). The snapshot carries:

- `title`: the URL host (e.g. `www.youtube.com`)
- `stageLabelKey`: `transcribe.failed`
- `documentId`: the target doc if one was attached
- `error`: `[failedStage] error_message — full_url` so the Processes hub shows the stage + message + source in one line, and the user can copy the URL directly from the card's `Dismiss` / detail view.

Now across app restarts the failure shows up in the Processes hub (under the "Failed" filter) with full context, and the existing `Dismiss` / `Clear finished` controls work on it.

### Added — Option B: URL transcription runs through the chunked pipeline

User question: *"¿Pero por qué debería fallar?"* The previous `/from-url` endpoint sent the whole downloaded audio as a single blob to Groq/Deepgram, enforced a 25 MB hard cap, gave the provider 60 s to respond, and had no chunking. Long YouTube videos were architecturally unsupported — they'd fail with `413 File too large` or provider timeout regardless of observability.

This release **unifies the URL path with the file-upload chunked pipeline**:

**Backend — `apps/api/app/routers/transcribe.py`**

- New dependency `imageio-ffmpeg>=0.5.1` in `requirements.txt` — ships a prebuilt `ffmpeg-win-x86_64-v7.1.exe` via pip, no external binary to manage. Bundle grows ~80 MB but removes the need for a cross-platform ffmpeg install.
- New helpers:
  - `_ffmpeg_executable()` — resolves the bundled ffmpeg path.
  - `_ffprobe_duration_seconds(ffmpeg_path, media_path)` — parses `Duration:` from ffmpeg's stderr (imageio-ffmpeg doesn't ship ffprobe).
  - `_ffmpeg_split_audio(input_bytes, ext_hint, chunk_seconds)` — single ffmpeg invocation using the `segment` muxer: transcodes to mono 16 kHz 64 kbps mp3 + splits into N chunks of `chunk_seconds` in one pass. Returns `[(bytes, duration_seconds?), …]` with per-chunk duration estimates.
  - Constants: `URL_CHUNK_SECONDS_DEFAULT=300`, `URL_CHUNK_SECONDS_DIARIZED=120` — match the file-upload chunk sizes.
- New endpoint **`POST /v1/transcribe/from-url-job`** returns `TranscribeJobResponse`. Stages:
  1. `resolve` — reuses `_resolve_media_from_url` (yt-dlp + httpx).
  2. `extract` — `_ffmpeg_split_audio` transcodes + splits.
  3. `register` — `transcribe_jobs` row created with `total_chunks=N`.
  4. `upload` — each chunk uploaded to `audio/{user_id}/url-chunks/{job_id}/{index}.mp3` via Supabase service role (bypasses RLS).
  5. `register` (chunk rows) — `transcribe_chunks` rows inserted with `storage_path` + `duration_seconds`.
  - Early reject (`stage=resolve`) if the downloaded bytes are <1 KB — that's always a captcha/404/redirect HTML page disguised as a response, not media.
  - On partial failure (upload or chunk-register), the job row is marked `status='failed'` so the user doesn't see a stuck half-created job in the hub.
- Old `POST /v1/transcribe/from-url` is kept intact for backward compat — it still enforces the 25 MB cap and returns text directly. The Electron client no longer calls it for anything the user triggers.

**api-client — `packages/api-client/src/endpoints/transcribe.ts`**

- New `transcribe.fromUrlAsJob(params, opts)` → returns `TranscribeJobResponse`. Mirrors the shape of `transcribe.createJob` so callers can reuse the chunked `run` loop verbatim.

**Client — `apps/desktop/src/stores/transcription.ts`**

- `runUrlTranscription` is rewritten to run the unified flow:
  - **Phase A (server prep)**: `await api.transcribe.fromUrlAsJob(...)`. The synthetic job's time-based stage ticker (`openingLink → downloading → extracting → sending`) stays visible during this single HTTP call (which is the actual download+transcode+split+upload step server-side).
  - **Job swap**: when the call returns, the synthetic job is replaced by a real backend job (keyed by the DB uuid) in `jobs[]`. `activeJobId` is moved over. The runtime map entry is disposed.
  - **Phase B (run loop)**: the same `while (status === 'processing' || 'pending') { api.transcribe.run(realJobId, {max_chunks: 5}) }` as the file-upload path. Each call processes 5 chunks server-side and the job row's `processed_chunks` ticks up. The UI counter and progress bar reflect real work now (before: entirely simulated).
  - **Phase C (finalize)**: `api.transcribe.getResult(realJobId)` + note persistence + success toast + remove job row.
  - Failures caught: `AbortError` (user cancel vs timeout), `ApiError` with stage header, generic. All paths mark the job `failed` and keep the row visible in the hub.

**Tests**

- `test_from_url_job_requires_auth`, `test_from_url_job_no_db_returns_503`, `test_from_url_job_happy_path` (mocks resolve + `_ffmpeg_split_audio` + DB inserts + storage upload, verifies 3 chunks → 3 uploads → job returned), `test_from_url_job_rejects_tiny_response` (ensures the <1 KB early reject hits with `stage=resolve`). 224/220 passing (4 new).

### Bundle size impact

`backend-bundle/` grew from ~170 MB → ~247 MB due to the ffmpeg binary + its deps. `win-unpacked/` installer payload similarly up ~80 MB. Acceptable tradeoff given the alternative was unreliable URL transcriptions.

### Fixed — "Copy error" button silently failed in the JobDetailModal

User report: *"el boton de copiar el error tampoco copia"*. The modal was calling `navigator.clipboard.writeText(text)` directly, which fails silently in Electron when the BrowserWindow isn't the topmost focused surface, when the document context isn't "secure" in the Electron renderer's view, or when the OS denies access to the clipboard. The user's click did nothing and no toast confirmed either success or failure.

The project already has a `copyText(text, label?)` helper at `apps/desktop/src/lib/clipboard-utils.ts` that:
1. Tries `electron.writeClipboard` via IPC (most reliable path in Electron since it uses Node's native clipboard).
2. Falls back to `navigator.clipboard.writeText`.
3. Falls back to a legacy `textarea` + `document.execCommand('copy')`.
4. Pushes a success/error toast to `useNotificationsStore`.

Fix (`components/processes/JobDetailModal.tsx`):
- `copyToClipboard(text, which)` now calls `copyText(text, which === 'source' ? 'link' : 'error')` so both code paths go through the triple fallback.
- Added a transient visual ack independent of the toast: on success, `setCopyFlash('source' | 'error')` for 1200 ms → the button's icon swaps from `content_copy` to `check` and the colour flips to emerald. Toasts can be missed, a checkmark on the exact button the user clicked cannot.

### Added — Stage-wise error reporting for URL transcription (observability pass)

User feedback: *"el mayor problema que tenemos es que, aunque definimos etapas y definimos procesos por los cuales se llega a la transcripción, no lanzamos los errores relacionados con los procesos ni con suficiente información para saber dónde es que se trabó la transcripción."* The client-side stages I added earlier (`openingLink → downloading → extracting → sending → processing`) are time-based heuristics with no backend counterpart. When anything failed, the client got a generic "Transcription failed" with no trace of which pipeline step broke.

Instrumented the entire `POST /v1/transcribe/from-url` path with named stages that surface to the client via a new HTTP response header + field on `ApiError`:

**Backend — `apps/api/app/routers/transcribe.py`**

- Added `log = logging.getLogger(__name__)` and `log.info/warning/error/exception` calls at every stage entry/exit/failure. Previously the endpoint had zero log statements; the real error (yt-dlp format-rotation, Groq 413, Deepgram timeout, etc.) was silently swallowed in a `except Exception` and never written to `backend.log`.
- Extended `_raise_transcribe_http_error(...)` with an optional `stage: str | None` parameter that sets the `X-Whisperall-Error-Stage` response header. Server still returns a human-readable `detail` for the UI; the stage header is the machine-readable routing key.
- Split `transcribe_from_url` into named, try/except-wrapped stages:
  - **`resolve`** — URL fetch + yt-dlp extraction + secondary media download. Distinguishes `TRANSCRIBE_URL_DOWNLOAD_TIMEOUT` (504) from generic network failures and "not media" rejections. `_download_url_bytes` now catches `httpx.TimeoutException` explicitly instead of letting it propagate as a generic 500.
  - **`size_check`** — the 25 MB gate. Error message now includes the actual size (`Audio is 87.3 MB; the URL pipeline currently caps at 25 MB`) so the user knows by how much they're over.
  - **`diarize`** — Deepgram nova-2 pass (only when `enable_diarization=True`). `DIARIZATION_NOT_CONFIGURED` + `TRANSCRIBE_DIARIZE_FAILED` both carry `stage=diarize`.
  - **`transcribe`** — Groq whisper-large-v3-turbo primary STT. Provider HTTP errors now return 502 Bad Gateway with `stage=transcribe` and include the upstream response body in the detail. Previously these were swallowed into a generic 400.
  - **`fallback_stt`** — OpenAI / Deepgram fallback when primary quality is low. Non-fatal failures are logged as warnings (not errors) so the primary path keeps the text it had.
  - **`save`** — DB usage increment + history row. Usage failures are logged but don't lose the transcription result.
- `_extract_media_download_target` (yt-dlp extractor) previously caught every exception silently. Now logs the real cause so YouTube format breakages are diagnosable from `backend.log`.

**api-client — `packages/api-client/src/client.ts`**

- `ApiError` gains an optional `stage?: string` property, populated from the `X-Whisperall-Error-Stage` header during `throwWithBody`. Backwards-compatible — callers that don't look at `stage` behave exactly as before.

**Desktop client — `apps/desktop/src/stores/transcription.ts`**

- `normalizeTranscriptionError(err)` now returns `{kind, message, stage?}`, reading `apiErr.stage`.
- `TranscriptionJob` gains `failedStage?: string`. When `runUrlTranscription` catches a non-abort error, it persists the stage on the job so the card and modal can display it.
- Error notification detail gets a `[stage] ` prefix for quick scanning in the `NotificationBell` panel / log store.

**UI — `apps/desktop/src/components/processes/JobDetailModal.tsx`**

- Failed-job banner shows a new line above the error text: `🏴 FALLÓ EN LA FASE: [resolve]`. The stage badge renders the localized stage name (via `transcribe.stageName.{resolve,size_check,diarize,transcribe,fallback_stt,save}`).
- The stage + error + URL are all selectable and copyable, so the user can paste a complete bug report in one go.

**i18n (EN + ES)**

- `transcribe.failedAtStage` (`Failed during` / `Falló en la fase`)
- `transcribe.stageName.{resolve,size_check,diarize,transcribe,fallback_stt,save}` with human-friendly labels in both languages.

**Tests**

- `test_from_url_maps_provider_http_error_to_stable_api_error` updated to assert the new, more-accurate mapping: HTTP 502 (Bad Gateway, since the failure came from an upstream provider) + `X-Whisperall-Error-Code: TRANSCRIBE_STT_FAILED` + `X-Whisperall-Error-Stage: transcribe`. Previous assertion was `400 / TRANSCRIBE_URL_PROVIDER_REJECTED` — semantically less precise and didn't expose the stage.
- All 220 pytest + 23 api-client vitest pass.

### Fixed — Failed URL transcriptions silently erased from Processes

User report: *"Terminó con este error… y desapareció de los procesos. No hay forma de copiar más nada. Simplemente desapareció."* After a 15-minute URL transcription failed, the synthetic job was removed from `jobs[]` the moment the error toast fired. The user had no way to see the source URL, the error text, or retry. The error WAS persisted in the `NotificationBell` panel (via `pushError` with `detail`), but the Processes hub — the place a user reasonably treats as the source of truth for job history — showed nothing.

Root cause: `runUrlTranscription` called `removeJob()` in every exit path, including the two error branches (timeout + generic error). `removeJob` filters the synthetic entry out of `jobs[]`, erasing the row.

Fix (`stores/transcription.ts`):

1. **Split the exit finalizers into two helpers**:
   - `removeJob()` — kept for the success path. Disposes the runtime AND removes the synthetic entry from `jobs[]` because the result has already been persisted into a note.
   - `failJob()` — new. Disposes the runtime + clears `activeJobId` + updates `urlStartedAt` but **keeps the job in `jobs[]`** with its `status: 'failed'` and `error: message` so it stays visible in the Processes hub / NotificationBell panel / JobDetailModal.
2. Both error branches (timeout + generic) now call `failJob()` instead of `removeJob()`.
3. **New `dismissJob(jobId)` store action** — lets the user remove a failed or completed job manually from the UI. Aborts + disposes the runtime if the job happens to still be running, then filters it out of `jobs[]`, clearing `activeJobId` and syncing `urlStartedAt`. This is what's wired to the `⋯ → Dismiss` overflow item and the JobDetailModal `Dismiss` button.

### Added — Copy affordances in JobDetailModal

For a failed job the user wants to troubleshoot, copy the URL, or paste the error into a chat/ticket. Added two copy buttons (`components/processes/JobDetailModal.tsx`):

- **Copy link** button next to the `Source` header — copies `process.title` (the URL or filename) to clipboard via `navigator.clipboard.writeText`. Push an info-toast `Copiado al portapapeles`.
- **Copy error** button inside the red error banner (only when `errorText` is set) — copies the full error string. Same toast.
- Source text is now `select-text` so the user can also mouse-select the URL for partial copy.

### Fixed — Dismiss routing + Clear finished now covers transcription jobs

`ProcessesPage` was routing the per-card `onDismiss` to `removeLocalProcess(item.id)` for everything except synthetic URL jobs. But `removeLocalProcess` no-ops for transcription jobs (they live in `useTranscriptionStore.jobs`, not `useProcessesStore.localProcesses`), so file transcription jobs in terminal state couldn't be dismissed either. New detection: `isTranscriptionJob = jobs.some((j) => j.id === item.id)` → dismiss routes to `dismissJob` if true, else `removeLocalProcess`. Applied to both the card `⋯ → Dismiss` and the `JobDetailModal` Dismiss button.

The page-level `Clear finished (N)` button now also sweeps terminal transcription jobs (in addition to terminal local processes) so the count always matches what the user sees and there's no "stuck" failed rows that the button can't clear.

### i18n keys added (EN + ES)

- `transcribe.copySource` (`Copy link` / `Copiar enlace`)
- `transcribe.copyError` (`Copy error` / `Copiar error`)
- `transcribe.copied` (`Copied to clipboard` / `Copiado al portapapeles`)

### Added — JobDetailModal + note-header transcription indicator

User report: clicking on an active transcription from the Processes hub navigated to the legacy `TranscribePage`, which rendered the full "configure a new transcription" workspace (file upload, URL input, language picker, diarization/summary/punctuation toggles, Start button) with the active job as `activeJobId`. The Start button then routed through `resumeJob() → startTranscription()` resume branch, which POSTs `/v1/transcribe/run/{id}` against the backend. Synthetic URL job ids don't exist in the DB, so the server returned `404 "Transcription job not found"`. The catch path marked the job as `failed` while `runUrlTranscription`'s original promise was still in flight against the real URL — producing the contradictory state the user reported ("en esa ventana decía que se iba transcribiendo y en la ventana de proceso te queda con el error").

Three fixes + one new component:

1. **Guard `resumeJob(jobId)` and `startTranscription` resume branch against synthetic URL jobs** (`stores/transcription.ts`). Both check `urlRuntimes.has(jobId)` (resume entry) and `resumableJob.synthetic` (inside the resume else-branch) and push a localized `transcribe.cannotResumeUrl` warning toast — "URL transcriptions cannot be resumed. Start a new one instead." / "Las transcripciones por enlace no se pueden reanudar. Inicia una nueva." — instead of firing the 404.
2. **New `components/processes/JobDetailModal.tsx`** — a read-only modal showing only what the user wants to know about an in-flight job: source (URL host / filename), status pill, stage label, chunk progress OR elapsed counter (with live 1 s ticker for synthetic URLs), indeterminate pulse bar when chunks don't apply, error banner when failed. Footer has `Dismiss` (terminal), `Cancel` (active), `Open note` (when the job has a documentId). Header has a prominent `← Volver a procesos` back button and close `×`. No upload/URL/settings UI — explicit non-goal. Escape and click-outside close.
3. **`ProcessesPage.tsx` primary action** — when a process has no resulting note yet, the primary button is now `Ver transcripción` which opens the `JobDetailModal`, not `openTranscribe()` (which navigated to the legacy workspace). The legacy `Open transcription` is preserved as an item in the overflow `⋯` menu for non-synthetic jobs where the transcription workspace remains relevant.
4. **Note header indicator** (`pages/DictatePage.tsx`) — derives `attachedActiveJob` from `transcribeJobs.find((j) => (j.documentId === docId || j.targetDocumentId === docId) && status ∈ {processing, pending, paused})`. When a match exists, renders a compact primary-colored pill next to the `Back to Notes` button with a spinning `progress_activity` icon and `En curso` label. Click navigates to the Processes page so the user can open the detail modal. Tooltip: `Hay una transcripción en curso para esta nota`. Disappears automatically when the job reaches a terminal state.

### i18n keys added (EN + ES)

- `transcribe.cannotResumeUrl`, `transcribe.jobDetailTitle`, `transcribe.backToProcesses`, `transcribe.source`, `transcribe.inProgress`, `transcribe.jobMissingBackend`, `transcribe.attachedJobIndicator`, `transcribe.viewTranscription`.

### Fixed — "No feedback" after clicking Transcribe

User report: *"Puse transcribir algo y cuando le di transcribir no me dio feedback ni nada. Se cerró la modal y no pasó nada, como si no hubiera pasado."* The dialog-close-on-Start behaviour (introduced for multi-process URL transcription) was silent: the user's click produced no visible acknowledgment because the success/failure toast only fired at the END of the blocking HTTP call, which can take minutes.

Two pieces of immediate feedback added:

1. **Kickoff toast** (`stores/transcription.ts`) — pushed to `useNotificationsStore` with tone `'info'` the moment the synthetic URL job is added to `jobs[]`, BEFORE the fire-and-forget `runUrlTranscription` starts. `NotificationToast` surfaces it bottom-right for 4 s ("Transcripción iniciada — youtube.com"). Persisted entry shows up in `NotificationBell` too. New i18n key `transcribe.notifyStarted` (EN + ES).

2. **Persistent activity indicator on the bell** (`components/ui/NotificationsPanel.tsx`) — `NotificationBell` now derives `activeCount` from `processItems.filter(p => status ∈ {running, queued, paused})`. When `activeCount > 0`:
   - Icon swaps to `notifications_active` with a subtle `.wa-pulse` opacity animation (1.8 s ease-in-out, `prefers-reduced-motion` falls back to static).
   - Bell colour switches from `text-muted` to `text-primary`.
   - If there are no unread notifications, a primary-coloured count badge sits at the bottom-right corner of the bell (ringed with `--color-base`) showing the number of active jobs. When there ARE unread notifications, the red unread badge at top-right takes precedence and the active dot is hidden to avoid visual stacking.
   - Tooltip flips to "3 procesos" (or the localised equivalent) instead of "Notifications" so the tooltip tells the user why the bell is animated.
3. **CSS utility `.wa-pulse`** (`src/index.css`) — 1.8 s opacity pulse between 1 and 0.55. Reused pattern from `.wa-indeterminate`; both respect `prefers-reduced-motion`.

### Fixed — False-positive `backend.exit` notification on clean shutdown

Every normal app close produced a sticky `[backend.exit] Backend exited unexpectedly (code 4294967295)` red notification that persisted into the next session via the `whisperall-logs` store. Root cause: on Windows, `ChildProcess.kill()` terminates the child with `TerminateProcess`, which sets the process exit code to `0xFFFFFFFF` (`4294967295` / `-1`). The `backendProc.on('exit')` handler's guard `code !== 0 && code !== null` treated this as a crash and broadcast an error event to the renderer, which pushed it into the persisted notification store.

Two-sided fix:

1. **`electron/modules/backend.ts`** — added `intentionalShutdown` flag set to `true` by `stopBundledBackend()` before calling `kill()`. The `exit` handler now early-returns when the flag is set. As a belt-and-suspenders, added `WINDOWS_TERMINATION_CODES` (`-1`, `0xFFFFFFFF`, `0xC000013A STATUS_CONTROL_C_EXIT`, `1`) — any of these are treated as a clean stop regardless of the flag. The log line now includes `code=`, `signal=`, and `intentional=` for debuggability. The flag is reset to `false` at the start of `ensureBundledBackend()` so a mid-session crash followed by restart still surfaces the error.

2. **`src/App.tsx`** — backend lifecycle events are session-scoped: a notification about the previous session's shutdown has no actionable value once a new session is running. The backend-event effect now purges any persisted `context: 'backend.*'` entries from `useNotificationsStore` at mount time, so the notification panel starts clean and only reflects the current session. Pre-existing legitimate errors from the current session are still surfaced by the live event handler that runs after the purge.

### Fixed — Processes hub UX overhaul

A user audit of the Processes page surfaced 14 distinct UX/data bugs. All shipped in this pass:

1. **Status/stage contradictions** (`lib/processes.ts`) — `processStatusFromTranscriptionJob` now auto-promotes a job to `completed` when `processed_chunks === total_chunks && total_chunks > 0`, and to `failed` when `job.error` is non-null regardless of the server stage. `mapTranscriptionJobToProcess` re-resolves the displayed stage label so a completed job can never show `TRANSCRIBING…` next to a 100% bar.
2. **"52/52 chunks" counted as Running, not Completed** (same file) — filter chips use the derived `status`, which now flips the job to Completed based on chunk progress even if the client never received the final server status flip. This fixes the `All 5 · Completed 0` contradiction.
3. **"TRANSCRIBING…" badge on interrupted jobs** (`stores/processes.ts` + `components/processes/ProcessCard.tsx`) — `loadStoredProcesses` now promotes stale `running`/`queued` entries to `completed` when `done >= total > 0` (the final tick was lost), otherwise to `failed` with the i18n sentinel `@@processes.interruptedOnClose`. The card translates the sentinel to `processes.interruptedOnClose` at render time. Legacy entries persisted as the raw English `'Process interrupted (app was closed)'` are migrated to the sentinel on boot.
4. **`0/1 chunks` on URL jobs** (`lib/processes.ts` + `ProcessCard.tsx`) — `ProcessItem` now carries `synthetic?: boolean` and `startedAt?: number`. URL jobs propagate these from the synthetic `TranscriptionJob`. The card hides the chunk counter when `synthetic === true` and shows `{stageLabel} · Transcurrido: 1m 23s` instead, with a live-ticking elapsed counter driven by `useTickWhile(active, 1000)`.
5. **Duplicate URL entries on restart** (`pages/DictatePage.tsx`) — `handleStartInlineTranscription` no longer calls `useProcessesStore.getState().start()` for URL jobs. URL transcriptions are already tracked by the synthetic `TranscriptionJob` in the transcription store; creating a parallel LocalProcess produced a phantom `running` row that never got marked `completed` when the synthetic job finished, and re-surfaced as "interrupted" on next boot.
6. **Blue "0" highlight artifact** (`ProcessCard.tsx`) — the chunk counter text is now wrapped in `<span class="select-none tabular-nums">` so stray browser text selection can't leave the digit highlighted.
7. **Action-button sprawl** (`ProcessCard.tsx`) — the per-card button trio (`Open transcription · Retry · Refresh · Open note`) is consolidated into: **primary** = `Open note` (or `Open transcription` if no doc), **secondary** = `Retry` (only for failed/canceled/paused non-synthetic jobs), **danger** = `Cancel` (while running/paused), **overflow `⋯` menu** = `Open transcription` + `Refresh` + `Dismiss`. Synthetic URL jobs skip `Retry`/`Refresh`/`Open transcription` because they don't map to a DB job.
8. **"Per-process notifications: Inherited from global" taking a whole row on every card** (`ProcessCard.tsx`) — the dropdown is replaced by a compact 🔔 button in the top-right corner that opens a portal popover with the four options (`Inherit · Silent · Notify · Notify + sound`). The bell icon changes (`notifications_off` / `notifications` / `notifications_active`) based on the current per-process mode so the override state is visible at a glance.
9. **Top-of-page notification prefs confusion** (`pages/ProcessesPage.tsx`) — the four dropdowns were visually indistinguishable from filter chips. They're now grouped in a bordered card labeled `Avísame cuando un proceso esté…` with uppercase section header. The options are renamed to consistent verbs: `Silencio · Notificar · Notificar + sonido` (was `Notify only · Play sound` — two different verb forms).
10. **No way to dismiss stale entries** (`stores/processes.ts` + `ProcessesPage.tsx`) — new store action `clearFinished()` + `Limpiar finalizados (N)` button at the top of the page (only visible when there's something to clear). Individual `Dismiss` inside each card's `⋯` menu. Routes synthetic URL cancels through `cancelUrlTranscription(id)` so the runtime + synthetic job are properly disposed.
11. **Card layout reflow** (`ProcessCard.tsx`) — title + status pill on the same line (previously status lived in a separate colored sublabel above the counter), meta line (`stage · N/M chunks · %` or `stage · Elapsed: …`) second, error banner compact, actions right-aligned in a single row. Progress bar only renders for running/queued states.
12. **Missing i18n keys** (`lib/i18n.ts`, EN + ES) — `processes.interruptedOnClose`, `processes.dismiss`, `processes.clearFinished`, `processes.clearFinishedHint`, `processes.moreActions`, `processes.elapsed`, `processes.notifyTitle`, `processes.notifySilent`, `processes.notifyHeader`, `processes.perProcessOverride`. Renamed `processes.notifyOnly` from "Notify only" → "Notify" (consistent with the new verb set) and `processes.notifySound` from "Play sound" → "Notify + sound". `processes.notifyInherited` tightened to `Inherit from global`.
13. **Dedup dedupe gap for legacy rows** — `loadStoredProcesses` migrates the legacy English `'Process interrupted (app was closed)'` string to the new sentinel on first load so existing users see the localized text without manual clearing.
14. **Progress bar colors hardcoded to `bg-primary`** (`ProcessCard.tsx`) — now derived from `STATUS_PROGRESS_BAR[process.status]`; a failed or paused job gets a muted amber/red bar instead of blue, matching the status pill. Synthetic jobs show an indeterminate pulse bar (`.wa-indeterminate`) that also picks up the status color.

### Changed — Multi-process URL transcription

The URL transcription path was previously **single-job blocking**: submitting a URL set a store-wide `loading: true` flag, kept a singleton `urlAbortController` + `urlStageTicker`, and forced the user to sit on the dialog until the blocking HTTP call resolved (or timed out). The user's mental model is different: they want to fire off several transcriptions and keep working.

Refactored to a fire-and-forget model backed by a per-job runtime map:

- **`urlRuntimes: Map<jobId, UrlJobRuntime>`** at module scope in `stores/transcription.ts` keyed by synthetic job id (`url-{startedAt}-{nonce}`). Each entry owns its own `AbortController`, `timeoutId`, stage-progression `ticker`, `startedAt`, and `abortedByUser` flag. The old module-level singletons (`urlAbortController`, `urlStageTicker`, `urlAbortedByUser`) are gone.
- **`startTranscription()` no longer awaits the URL fetch**. For URL input it now creates the synthetic job, registers the runtime, kicks off `runUrlTranscription(opts)` with `void`, and **returns immediately** so the dialog can close. The HTTP call continues in background.
- **New `runUrlTranscription(opts)` helper** (module scope, outside the Zustand API) handles the whole lifecycle: await fetch → flip stage to `saving` → persist note (target doc update or new note via `saveAsNote`) → push success notification → dispose runtime + remove synthetic job. On `AbortError` it distinguishes user-cancel (info toast) from timeout (error toast with `transcribe.timedOut` message). On any other failure: normalized error, `pushError` to notifications, job marked `failed` in `jobs[]` so it lingers visible in the NotificationBell / Processes hub.
- **`loading` is no longer set by the URL path**. It remains true during `createJob` (file upload) where the UI was designed for a single slot. URL jobs are tracked via `jobs[]` entries with `synthetic: true` and a `startedAt` field, never via the store-wide flag.
- **`cancelUrlTranscription(jobId?)` now takes an optional id**. Without an id it cancels all running URL jobs (legacy behaviour, preserved for backward compat). With an id it targets a specific runtime — used by `cancelJob(id)` which routes synthetic URL jobs through this path.
- **`cancelJob(jobId)`** detects synthetic URL jobs via `urlRuntimes.has(jobId)` and delegates, so the existing Processes hub / NoteProcessesPanel cancel buttons work for URL jobs too.
- **`reset()`** iterates `urlRuntimes` and disposes each entry instead of nulling a single controller.

### Added — Dialog closes on Start for URL, toast on completion

- **`handleStartInlineTranscription`** in `DictatePage.tsx` now closes the transcribe dialog and clears `noteTranscribeProcessIdRef` immediately after `void startTranscription()` when the input is a URL (detected via `!stagedTranscribeFile && !!stagedTranscribeUrl.trim()`). File jobs still keep the dialog open because they block on `createJob`.
- **i18n notification keys** `transcribe.notifyCompleted` / `notifyCancelled` / `notifyFailed` (EN + ES) — pushed into `useNotificationsStore` by `runUrlTranscription` on completion so the `NotificationToast` fires a floating success toast with the source host (`youtube.com`, etc.) regardless of which page the user moved to. The `NotificationBell` panel already aggregates `jobs` from the transcription store, so live URL jobs appear there automatically without any extra wiring.

### Fixed
- **URL transcription stuck at "Processing… 0%"** — the `/v1/transcribe/from_url` backend call is a single blocking HTTP request that does download + audio extraction + transcription with no streaming, so the client had nothing to render beyond a spinner and a `0%` counter. Until the backend grows SSE/job-polling for URL jobs, the client now creates a **synthetic `TranscriptionJob`** when a URL is submitted and advances its `stage` on a 1-second ticker through a plausible phase sequence: `openingLink → downloading → extracting → sending → processing`. The existing job-driven status card now renders a real stage label + detail line + elapsed-time counter, and the progress bar switches to an **indeterminate pulse animation** (`.wa-indeterminate`, `prefers-reduced-motion` aware) instead of a stuck `0%` bar. On success/cancel/timeout the synthetic job is cleaned up from the jobs list so it doesn't leak into the Processes hub.
- **"Cancelled or timed out." conflation** — user-initiated cancel and server timeout produced the same generic error, hiding which one actually happened. `cancelUrlTranscription` now sets a `urlAbortedByUser` flag read in the catch branch: user cancel → `transcribe.cancelledByUser` (no red status, just clean close). Timeout → `transcribe.timedOut` with the actual minute value interpolated ("No response from server after 15 min. Try again with a shorter clip or check your connection.").
- **URL client timeout bumped** from 180 s → 15 min (`URL_TIMEOUT_MS = 15 * 60_000`). 3 min was guaranteed to fire mid-transcription for any YouTube clip over ~4 min.
- **Missing i18n key `processes.openNote`** — the "Open note" button on `ProcessCard` was rendering the literal string `processes.openNote` because the key was never added to `i18n.ts`. Added EN ("Open note") + ES ("Abrir nota").
- **Mojibake pass (`DictatePage.tsx`, `i18n.ts`, `DebatePanel.tsx`)** — repaired 31 broken UTF-8 sequences left by prior cp1252 round-trips. Affected surfaces: the visible `Mic → System` toggle label (was rendering `Mic Ã¢â€ â€™ System`), history metadata bullet `•`, 6 translated strings containing Spanish `ó`/`ú` and em-dash (`—`), DebatePanel smart-quote regex, and 18 section-separator comments. Pattern: `python` bytewise replace of triple/quadruple-encoded hex sequences — no text re-translated.

### Changed
- **Note context menu split** — the in-editor right-click menu was rendering a full transcription form (URL input + language + 3 checkboxes + CTA + status card + redundant History/Audio/Retranscribe block) that forced a scrollbar and duplicated the top-bar utilities. The menu is now compact: `Edit` (copy/cut/paste/select all) + `Capture` (record/source/translate/subtitles) + a single `Transcribir archivo o enlace…` action that opens a new `transcribe-dialog` modal. The modal carries the entire form with its state intact. `menuHeight` clamp reduced from 680 → 520 accordingly. Removed the `LINKED AUDIO` block from the context menu since it duplicated the topbar `History / Audio / Retranscribe` entries.
- **Disabled-CTA affordance** — the `Start Transcription` button now exposes a `title` tooltip and an inline hint (`transcribe.needsInput`: "Sube un archivo o pega un enlace para iniciar") when neither a file nor URL is staged, so users understand why the CTA is inert.

### Added
- `TranscriptionJobStage` extended with `openingLink | downloading | extracting | sending` and matching `transcribe.stage*` / `transcribe.detail*` i18n keys (EN + ES).
- `urlStageForElapsed(ms)` helper — time-based heuristic that maps elapsed-millis to a synthetic stage; exported from `stores/transcription.ts` so it's testable in isolation.
- Elapsed-time counter on the URL status card (`Tiempo transcurrido: 1m 23s`) driven by a lightweight 1 s `useEffect` interval that only runs while `transcribeLoading && urlStartedAt`.
- CSS utility `.wa-indeterminate` (in `src/index.css`) — 1.6 s translateX loop with `prefers-reduced-motion` fallback to a 50 %-opacity full bar.
- i18n keys `transcribe.openDialog`, `transcribe.dialogTitle`, `transcribe.needsInput` (EN + ES).
- Phase E3 final surfaces: NotificationBell, FolderTreeRow inline buttons, AudioPlayer transport, transcript/note segmented control (custom two-button group), overlay widget plain-CSS port.

## [0.24.0-alpha] — 2026-04-16

### Changed + Added — Note card overhaul: no-reflow hover, portal folder picker, undo-delete, legacy title sanitizer

User hover-state audit of the grid card surfaced 5 actionable issues; all shipped in this release.

#### Added — Legacy title sanitizer (`lib/format-date.ts`)
New `sanitizeDisplayTitle(title)` helper recognizes the timestamp-formatted string `smartTitle()` used to auto-generate ("Note — Apr 16, 2026, 3:55 PM" / "Nota — 15 mar 2025, 15:55") via a regex and returns `''`. Pure display-layer fix — existing notes in the DB keep their stored title, but the UI renders `Untitled` until the user names them. Applied at every title render site (grid, list, editor header input). Opening a legacy note into edit mode also starts with an empty `title` state so the placeholder shows through.

#### Changed — Hover actions are now an absolute-positioned overlay
- Old layout: `[title ——— actions]` on the same flex row. On hover the folder `<select>` widened to fit its longest option name, squeezing the title and producing a per-hover reflow.
- New layout: title owns the full row (`pr-24` reserves space on the right), actions live in `absolute top-3 right-3` with `opacity-0 group-hover:opacity-100 focus-within:opacity-100`. Each button is a 28 × 28 round `bg-surface/90 backdrop-blur` pill so the cluster reads as distinct chrome and doesn't blend with the content underneath.
- Same treatment applied to the list row (`pr-28` + absolute overlay).

#### Added — `NoteCardActions` + `FolderPicker` portal component
- New inline helper `NoteCardActions` at the top of `DictatePage` encapsulates the overlay cluster per card (checkbox, folder trigger, delete). It owns the folder-picker open state and the button ref, so each card can anchor its own menu independently.
- New `components/notes/FolderPicker.tsx` — portal-based dropdown that replaces the native `<select>`. Features:
  - Renders via `createPortal(document.body)` so it escapes the card's rounded-overflow and can float over neighboring cards.
  - Smart viewport positioning: prefers below the trigger, flips above if there isn't room; horizontally clamped to stay onscreen.
  - First item is `No folder` / `Sin carpeta` with a `folder_off` icon — unambiguous "no folder" semantic (was "All Notes", which read like a filter).
  - Folders with duplicate names get suffixed with a short id fragment (`Untitled · abc12f`) so the user can tell them apart.
  - Closes on outside click, Escape, or pick. Checkmark on the currently-assigned folder.

#### Added — Folder chip in card meta footer
If `doc.folder_id` resolves to a folder, the meta row now shows `📁 FolderName` after the relative timestamp. Answers the "which folder does this note live in?" question without having to open the move menu.

#### Added — Undo-delete toast (Gmail style)
- Removed the single-note confirmation modal. Clicking the trash now:
  1. Hides the card immediately (filtered out of the grid via a `scheduledDeletes: Map<id, timer>` state).
  2. Surfaces a toast in the bottom-right (`z-[120]`, above the ActionDock) with the note title and an `Undo` button.
  3. Actually calls `deleteDocument(id)` on the server 5 seconds later if the user doesn't undo.
- Undo cancels the `setTimeout` and restores the card — no server round-trip.
- Bulk delete still uses the confirm dialog (higher-risk, user explicitly opted in by selecting notes).

## [0.23.0-alpha] — 2026-04-16

### Changed + Fixed — Note-view UX pass (audit fixes 1–18)

User: "identifica los errores de ui ux" → audit returned 20 issues → "arreglalos". This release ships 13 concrete fixes across the note editor, processes panel, debate panel, and color tag picker.

#### Critical (6/6)
- **#1 — Untitled instead of timestamp-as-title.** New notes created via "+ New note" or auto-draft no longer pre-fill `title: "Note — Apr 16, 2026, 3:55 PM"`. The title is stored as `""` and the input shows `Untitled` as placeholder (italic-muted). Display layer already falls back via `t('editor.untitled')` so grid cards, exports, and headers all render consistently. The timestamp moves to the meta footer where it belongs.
- **#2 — Processes panel collapsible.** `NoteProcessesPanel` now opens by default only when a process is active; closed otherwise. Header shows a chevron toggle + a compact counter (`3 · 1 active · 2 failed`). Reclaims ~90 px of vertical space on notes with only completed/failed processes.
- **#3 — Process status honesty.** When a job is in a terminal-with-error state (failed / canceled / interrupted), the detail label stops saying "Processing… · 0%" and prints the real status (`Failed`, `Canceled`, etc.) in red. The row no longer contradicts itself.
- **#4 — Deduplicated "Run now".** Removed the giant primary button from `DebatePanelEmptyState`. The input bar at the bottom owns the Run action; showing it twice created two competing CTAs.
- **#5 — "Play" label clarified.** Renamed to `Auto` with a loop icon (ON) / pause_circle icon (OFF) + a `title` tooltip explaining it's the auto-run loop, not audio playback. `aria-pressed` state added.
- **#6 — Save button hides when already saved.** The emerald "Saved ✓" badge already communicates the state; the prominent blue Save button is only rendered when `saved === false`. Prevents the double-affordance confusion.

#### Grave (7/12)
- **#7 — Color dots labeled.** The palette above the editor title now has `role="radiogroup"` + `aria-label` + a `title` that reads `Color tag — groups notes by color`. Each swatch has `role="radio"` + `aria-checked`. Screen readers and hover tooltips now explain what the dots do.
- **#8 — "Open Hub" → "Open Processes".** Less jargon. Uses `t('processes.openProcesses')` with `t('nav.processes')` as a locale fallback. Added a tiny `arrow_outward` icon so the button reads as "leave this view".
- **#10 — "No note context yet" → "Note is empty — using prompt only"** (EN) / "Nota vacía — usando solo el prompt" (ES). States the actual condition instead of vague "yet".
- **#11 — Provider chip is now interactive.** The `OpenAI` pill in the debate header got a dashed border, a dropdown caret, and a `title` tooltip — it reads unambiguously as "click to change provider". Clicking opens the same settings panel the gear button opens (the gear is now redundant but kept for keyboard flow).
- **#15 — Debate panel resize handle.** Left-edge drag handle (1.5 px wide with a 6 px hit zone, cursor `col-resize`). Width persisted in `useUiStore.debatePanelWidth`, clamped 280–720 px. Transition suppresses while dragging so it feels immediate.
- **#17 — Debate empty state shorter.** Copy reduced to one line (`220 px max-width`) + a smaller 32 px icon. No CTA — the input bar below owns that action.
- **#18 — Instruction textarea starts compact.** 36 px on mount when empty, grows up to 96 px as content arrives. Previously it always rendered at its max height.

#### Editor polish
- **#12 — Empty-note placeholder.** `MilkdownEditor` now exposes `data-empty` on its wrapper via a `MutationObserver` watching the ProseMirror doc. CSS paints the `placeholder` prop in italic-muted at the first-paragraph position. No DOM content inside the editor — undo / serialization stay untouched.

#### Skipped (intentional)
- **#9 — Mixed header button conventions.** On review the mix (Button primary / Button outline / Button ghost-icon) serves visual hierarchy: main action = primary, context toggles = outline, utility = ghost. No change.
- **#14 — "Duplicate color dot in header".** Not reproducible — the note-header color picker and the grid card don't appear simultaneously. Marked as false positive.
- **#13 — Phantom pill at top of TopBar.** Source not in our code (searched for all top-center rendering). Most likely an OS-level frameless-window hint from Chromium/Windows 11. Left for a separate investigation if it persists.

## [0.22.0-alpha] — 2026-04-16

### Changed + Added — UI/UX pass on notes home; in-note Ctrl+F search

User feedback: "identifica los errores de ui ux… arreglalo todo." Audit surfaced 20 issues; this release ships the critical + grave ones plus a missing feature (word search inside notes).

#### TopBar — widget-dock removed
- The dock's ghost placeholder and its filled state both read as clutter in the chrome strip. Removed outright from `TopBar.tsx`. The magnetic-snap docking behavior can return later as an ephemeral drop hint during overlay drag, not as permanent real estate. `TopBar` is now strictly theme toggle + notification bell.
- `AppShell` drops the `showWidgetDock` prop and the `useDocumentsStore` + `useUiStore` imports it no longer needs.

#### Theme toggle — NEXT convention
- `ThemeToggle.tsx`: the icon now shows the theme you will switch TO, not the one currently active. `light → dark_mode icon`; `dark → contrast icon (system)`; `system → light_mode icon`. Matches iOS, Android, Chrome, Slack, VS Code. Title + aria-label updated so the screen reader speaks the destination theme.

#### Timestamp unification (`lib/format-date.ts`)
- Rewrote `relativeDate()` with a single schedule: `< 1 min → "Just now"`; `< 1 h → "Xm ago"`; `< 24 h same day → "Xh ago"`; `yesterday → "Yesterday 3:12 PM"`; `< 7 days → "Monday 3:12 PM"`; `same year → "Mar 15, 3:12 PM"`; older → `"Mar 15, 2025, 3:12 PM"`. Spanish strings for every branch, no more fallbacks to English on a Spanish locale.
- New `stripMediaExtension(title)` drops `.m4a / .mp3 / .mp4 / .wav / .ogg / .webm / .flac / .aac / .mkv / .mov / .avi / .aiff` so imported-file notes ("Junta TSC 9 de Marzo.m4a") become readable titles ("Junta TSC 9 de Marzo").

#### Note cards — cleaner hierarchy
- Empty preview now reads `Empty` / `Sin contenido` in italic-muted instead of a literal `…`. Matches the way Notion, Linear, Bear render empty states.
- Removed the duplicate color dot on the right meta row of the grid card (the color was already implicit in the selection grouping — the dot was noise).
- `DICTATION` uppercase + `0.14em` tracking → sentence-cased (`Dictation` / via `capitalize`) with `0.02em` tracking and lower opacity (`text-muted/60`). Meta info no longer shouts at the same level as the preview.
- Titles now pass through `stripMediaExtension()` everywhere they render.

#### Notes home toolbar
- **"New note" primary CTA** added in the header row, aligned with the page title. No more hunting in the sidebar for the create action.
- **Subtitle replaced with a live count**: `23 notes · 4 folders` / `5 of 23 notes` when a filter is active. Actual info instead of generic copy.
- **Color filter** gets an explicit `All / Todos` button that clears the filter. Title on the whole group reads `Filter by color` on hover.
- **Grid / list toggle** becomes a segmented two-button control with `aria-pressed` state and an active-state background, so the current view is visible at a glance instead of relying on the icon-flip.
- **"Select visible"** now renders as `☐ Select` (icon + label) so its purpose is clear.
- **Search input** gets a Spanish/English aware placeholder (`Search by title, content, speaker…`) and an inline clear `×` button instead of sharing one with the color filter.

#### New — in-note word search (Ctrl/Cmd + F)
- `milkdown/plugins/wordSearch.ts`: ProseMirror plugin that opens a floating search pill in the top-right of the editor when the user presses `Ctrl/Cmd + F`. Scans the doc for matches (case-insensitive), paints yellow inline decorations, highlights the current match in orange, and jumps with Enter / Shift+Enter. Escape or the × button closes.
- Counter (`1/5`) next to the input. Auto-scroll to the current match uses a PM selection + `scrollIntoView` without polluting undo history (`addToHistory: false`).
- New CSS in `index.css` for `.wa-ws-match` / `.wa-ws-current` / `.wa-ws-toolbar`, all themable via the existing warm-stone tokens.

## [0.21.0-alpha] — 2026-04-16

### Changed — Dedicated TopBar chrome replaces the floating capsule + sidebar detour

User feedback after v0.20.2: "insisto en que tenemos mal diseñada la estructura de botones. No debemos tener las notificaciones en la barra lateral izquierda. No es un patrón de diseño que sea entendible para el usuario."

They're right — putting notifications in the left sidebar breaks the convention every productivity app (Notion, Slack, Linear, Gmail, GitHub) established: **global controls live in a top chrome strip**. The prior attempts (floating capsule at `top-2 right-[148px]` → sidebar footer) were both workarounds for a missing architectural piece.

#### New component: `TopBar`
- `components/shell/TopBar.tsx` — 48 px tall strip sitting between the sidebar and the page content. Owns:
  - **Drag region** spanning the full bar (window can be dragged by it).
  - **Widget-dock slot** centered horizontally, shown only on the notes home (`isNotesHome = page === 'dictate' && !currentDocument && !noteOpen`).
  - **Right cluster**: `ThemeToggle` + `NotificationBell`. `pr-[148px]` reserves space for the Windows min/max/close overlay. `no-drag` on interactive elements so clicks don't turn into drags.
- Border-bottom + `bg-surface-alt/40 backdrop-blur-sm` give it a clear visual separation from page content without shouting.

#### AppShell rewrite
- Old structure: `<main>` with a stack of absolutely-positioned floating strips layered via z-index (drag-region, capsule, widget-dock).
- New structure: vertical flex — `<TopBar />` then `{children}`. Clean, predictable, matches the app chrome metaphor users already know.
- Browser-mode banner (when not running in Electron) moved into the flex column and dropped its manual `mt-10` — the TopBar now provides the top spacer.

#### Sidebar cleanup
- Removed the `ThemeToggle` + `NotificationBell` cluster from the Sidebar footer (added in v0.20.0). Footer is back to its original Settings + UserMenu + VersionBadge shape.
- Removed unused `useSettingsStore` import.

#### Notification panel — smart vertical flip
With the bell back at the top, the panel now prefers to open **downward** (standard convention). Kept the flip-upward fallback in `NotificationsPanel.useLayoutEffect` for defensive cases (very short viewports where the bell sits too close to the bottom). Still portalled to `document.body` so it escapes every parent overflow.

#### Pages
- `pt-20 → pt-6` across `DictatePage`, `EditorPage`, `HistoryPage`, `LogsPage`, `ProcessesPage`, `ReaderPage`, `TranscribePage`. The TopBar's bottom border already separates it from page content, so pages only need 24 px of breathing room.

## [0.20.2-alpha] — 2026-04-16

### Fixed — Widget-dock truly hides inside notes; notifications open upward

User feedback after v0.20.1: "esto sigue apareciendo aunque esté dentro de una nota… las notificaciones ahí abajo, teniendo que hacer scroll en toda la aplicación para poder verlas por completo, no es una buena UI/UX. Las notificaciones tienen que estar arriba."

#### Fixed — Widget-dock hides inside a note (this time for real)
v0.20.1 gated the dock on `useDocumentsStore().currentDocument`, but `DictatePage` keeps its edit state in a local `useState<'list'|'edit'>('mode')` plus a local `docId` — it never writes to the documents store's `currentDocument`. The gate was checking the wrong signal.

- New `noteOpen` flag in `useUiStore` (not persisted — lives only for the session). `DictatePage` mirrors `mode === 'edit'` into it via `useEffect`, cleaning up to `false` on unmount so navigating away doesn't leave the flag stuck.
- `AppShell` now checks `page === 'dictate' && !currentDocument && !noteOpen`. Both signals feed in: EditorPage still uses `currentDocument`, DictatePage now uses `noteOpen`.

#### Fixed — Notifications panel opens UPWARD from the sidebar bell
When the bell lives in the sidebar footer (near the bottom of the window), a panel opening downward falls off the viewport and forces the user to scroll the whole app to see it. Rewrote the positioning logic in `NotificationsPanel.useLayoutEffect`:
- **Horizontal:** panel sits to the RIGHT of the bell (grows away from the rail) instead of aligning with the button's right edge. Clamped to the viewport when the right edge would overflow.
- **Vertical:** panel's BOTTOM aligns to just above the bell's top — opens UPWARD. Measured height via `panelRef.getBoundingClientRect()` on a second rAF pass so the position accounts for the actual rendered height; falls back to the max height (320 px matching Tailwind `max-h-80`) on first paint.
- **Viewport pin:** if the panel would overflow the top margin (very short viewports), pins to the top edge instead — panel stays fully visible.

## [0.20.1-alpha] — 2026-04-16

### Fixed — Notification panel escapes the sidebar; widget-dock only on the notes home

User feedback after v0.20.0: "las notificaciones al crear un nuevo quedaron escondidas y mal posicionadas. Las notificaciones no pueden estar ahí. Cuando estás dentro de una nota, el dock del widget no debe aparecer. Solamente aparece en el home principal."

Two issues from moving theme+bell to the Sidebar:

#### Fixed — NotificationsPanel now portals into `document.body`
Previously the panel used `absolute right-0 top-full` relative to the bell button's `relative` parent. Fine in the old AppShell capsule, but inside the Sidebar the panel anchored to the 56-px collapsed rail (or 256-px expanded) and got clipped by the sidebar's `overflow-y-auto`. Rewrite in `NotificationsPanel.tsx`:
- Panel now renders via `createPortal(..., document.body)` at `z-[300]`, escaping every parent's overflow.
- Position computed in `useLayoutEffect` from `button.getBoundingClientRect()`: preferred anchor is the button's bottom-right, clamped to the viewport. If the button is so close to the left edge that a right-aligned panel would go offscreen, the panel flips to align with the button's right edge instead.
- Repositions on `resize` + `scroll` (capture) so it follows the bell when the viewport shifts.
- Outside-click now checks both the bell's wrapper AND the portalled panel so clicking inside the panel doesn't close it.

#### Fixed — Widget-dock only appears on the notes home
The overlay widget's "drop here" slot was showing on every page, including inside open notes where it was pure clutter. `AppShell` now reads `useDocumentsStore().currentDocument` and `page`, and only mounts `<WidgetDock />` when `page === 'dictate' && !currentDocument` — i.e. the notes list home view. Inside a note (currentDocument set) or on secondary pages (Transcribe / History / Processes / Logs / Reader), the top strip is empty and the per-page header has the full width.

## [0.20.0-alpha] — 2026-04-16

### Changed — Top-area rearchitecture: global controls move to the Sidebar

User feedback after v0.19.5: "los botones de historia, copiar, descargar, salvar están todavía muy pegados a los botones de notificaciones, de modo claridad oscuro, al dock del widget. Todo este espacio aquí hay que rediseñarlo." Bumping `pt-12 → pt-16 → pt-20` was a band-aid; the structural problem was that two competing strips (global controls + per-page actions) both claimed the top-right of the main area.

#### What moved
- **Theme toggle + notification bell** — relocated from the floating `AppShell` capsule into the `Sidebar` footer, between the Settings button and the UserMenu. Convention match: Linear, Notion, Obsidian, Bear all keep global affordances in the sidebar rail. This frees the main area's top-right entirely for per-page action buttons (Save / History / Export …).
- **Widget dock** — centered horizontally in the top strip (`left-1/2 -translate-x-1/2`) with a `max-width: calc(100% - 296px)` guard so it never overlaps the Windows titlebar on the right or the sidebar on the left. It keeps the same 360 × 56 pill shape, still accepts magnetic snap + drag-out.
- **Removed** — the warm-stone controls capsule (`bg-[var(--theme-warm)] px-1.5 py-1 rounded-full`) that wrapped theme + bell at `top-2 right-[148px]`.

#### Page-side adjustments
- `pt-16 → pt-20` across `DictatePage`, `EditorPage`, `HistoryPage`, `LogsPage`, `ProcessesPage`, `ReaderPage`, `TranscribePage`. The widget-dock is 56 px tall at `top-2` (bottom edge y=64); `pt-20` (80 px) gives a comfortable 16 px gap. The per-page Save / History / Export / Copy buttons now own the main area's top-right without anything competing.
- `DictatePage` header comment updated to reflect the new reason.

#### Sidebar behavior
- New `sidebar-global-controls` strip between Settings and UserMenu. Flex row when expanded (`px-1 pt-1 gap-1`), flex column when the sidebar is collapsed (`flex-col gap-1 justify-center`) so the theme toggle and bell stack vertically in the 56-px-wide collapsed rail. Keeps both buttons accessible in both states.

## [0.19.8-alpha] — 2026-04-16

### Fixed — Code block highlighting actually applies (for real this time)

User feedback after v0.19.7: "seguimos igual". Picking "html" still produced no visible change.

Three compounding bugs hunted down:

1. **CSS used descendant selectors that never match decorations.** Rules like `.milkdown .hljs-tag .hljs-name` and `.milkdown .hljs-title.function_` expect nested `<span>` trees, but ProseMirror inline decorations produce a single `<span class="hljs-tag hljs-name">` — one element with multiple classes on it. The descendant selector (space) doesn't match a single-element compound; the compound selector (dot-chained) only matches if both classes appear on the same element. Rewrote the palette in `index.css` to use single-class selectors and added standalone `.hljs-tag`, `.hljs-name`, `.hljs-attr`, `.hljs-selector-class` so HTML / XML / CSS tokens get colored.

2. **`change` event on `<select>` gets swallowed inside PM's contenteditable subtree.** Added a parallel `input` listener as a belt-and-suspenders fallback. Both fire a shared `applyLanguage(pos, value)` helper, which dispatches the transaction.

3. **Attr-only transactions may not flip `tr.docChanged`.** `apply()` now also rebuilds when the transaction carries our plugin's meta flag (`tr.setMeta(KEY, { forceRebuild: true })`), which `applyLanguage` sets on every language pick. Belt + suspenders + forceRebuild — one of them is guaranteed to kick in.

Bonus: added explicit `HLJS_ALIAS` map (`html → xml`, `js → javascript`, `ts → typescript`, `sh → bash`, `py → python`, `rb → ruby`, `cs → csharp`, `yml → yaml`) so the picker's label always resolves to a real hljs grammar, never silently falling through to `highlightAuto`. `collectTokens` also now grabs ALL `hljs-*` classes on each element (not just the first), so compound CSS selectors can take effect.

## [0.19.7-alpha] — 2026-04-16

### Fixed — Language picker now actually applies

User feedback after v0.19.6: "el dropdown lo elijo en HTML y al final no sucede nada. Incluso no autocompleta, no hace nada."

Root cause — the language picker dispatched a `CustomEvent('wa-code-block-lang', { bubbles: true })` from inside a ProseMirror widget decoration, and the plugin listened for it on `view.dom`. In Electron's ProseMirror contenteditable context, custom events fired from inside widget subtrees don't reliably reach the outer `view.dom` listener (the widget's `contenteditable="false"` wrapper interferes with event bubbling). The `<select>` change handler ran, the CustomEvent dispatched, but the transaction never fired — so the `language` attribute stayed empty and highlighting never kicked in.

Fix in `codeBlockHighlight.ts`:
- Replaced the CustomEvent + `view.dom` listener plumbing with a **module-level `activeView` reference**. The plugin's `view()` hook stashes the editor view; the `<select>` change handler reads that reference directly and dispatches `setNodeAttribute` itself. Milkdown mounts one editor per process, so the shared reference is safe and the destroy callback clears it when the editor unmounts.
- Added `resolveCodeBlockPos(view, hintPos)`: if the baked-in `pos` from widget-build time no longer points to a code block (because earlier blocks got edited and shifted everything), we re-walk the doc and pick the first code block as a fallback. Prevents silent failures when users change languages after other edits.

## [0.19.6-alpha] — 2026-04-16

### Fixed + Added — Code blocks: real blank lines, syntax highlighting, language picker

User feedback after v0.19.4: "ahora no puedo dar 2 saltos de línea sin que salga de allí de ese cuadro de código. Y lo otro es que no tiene eslint [sic — syntax highlight], no detecta el lenguaje, así que para qué sirve."

Two bugs and one missing feature. All addressed:

#### Fixed — Plain Enter stays inside the fence
- Removed the `Enter` handler from `codeBlockExit.ts`. The previous behaviour exited the block on any Enter pressed at the end of a line that ended in `\n` — which in practice meant the SECOND Enter of any blank line kicked you out. Real code frequently needs two blank lines (Python top-level function separators, YAML document breaks), so auto-exit was wrong.
- Explicit exits remain: `Ctrl/Cmd+Enter`, `Shift+Enter`, `Escape`. Plus `Backspace` at position 0 of the fence still converts it back to a paragraph (delete path).

#### Added — Syntax highlighting via highlight.js
- New dependency: `highlight.js` v11 (common subset — 35 languages). Added to `apps/desktop/package.json`. Bundle impact: +56 KB gzipped on the main chunk (832 → 1001 KB minified, 248 → 305 KB gzipped). Acceptable for a desktop app.
- New plugin: `milkdown/plugins/codeBlockHighlight.ts`. For every `code_block` / `fence` node in the doc, it runs `hljs.highlight(text, { language })` when `node.attrs.language` is set, or `hljs.highlightAuto(text)` when it isn't. The hljs HTML output is walked to extract `(from, to, className)` ranges, which become `Decoration.inline` so ProseMirror re-renders with `.hljs-*` class spans. Pure decorations — no document mutation, no history / markdown impact.

#### Added — Language picker pill per block
- The same plugin emits a `Decoration.widget` at `pos + 1` of each code block: a tiny `<select>` in the top-right corner showing the current language (or "plain"). Changing it dispatches a custom `wa-code-block-lang` DOM event that bubbles to `view.dom`, where the plugin's `view()` hook catches it and calls `setNodeAttribute(pos, 'language', next)`.
- Options: `plain, bash, c, cpp, csharp, css, diff, go, html, java, javascript, json, kotlin, markdown, php, python, ruby, rust, scss, shell, sql, swift, typescript, xml, yaml`.
- CSS chrome (`index.css`): `pre` got `padding-top: 2.1rem` to leave room for the picker. The `<select>` is styled as a warm-stone pill with a custom arrow (no `appearance`), matching the ElevenLabs grammar.
- Language attribute also survives serialization: markdown output writes `` ```ts …  ``` `` because `code_block.toMarkdown` already uses `node.attrs.language`. Round-trip is non-destructive.

#### Added — hljs token palette (dual theme)
- Hand-tuned `.milkdown .hljs-*` token colors. Light theme uses warm saturated tones (magenta keyword, amber string, sky number, navy function title, italic muted comment); dark flips to the lighter counterparts via `html.dark` scope. Semantic roles (keyword/string/number/comment/function) stay consistent between themes — only hue lightness changes. Comments use `color-mix` with the base text token so they auto-adjust to each theme's muted tier.

## [0.19.5-alpha] — 2026-04-16

### Fixed — Vertical breathing room below the floating AppShell capsule

User feedback: "en algunas notas, sobre todo cuando hay botones arriba, salen encaramados de otros botones. No hay suficiente espacio desde el punto de vista vertical."

Root cause — the floating capsule (widget dock + theme toggle + notification bell) in `AppShell` sits at `top-2` (8 px) with an effective height of ~42 px, so its bottom edge lands at y≈50. Every page used `pt-12` (48 px) for the header, which meant the page header started **above** where the capsule ended. On transcription notes with lots of header buttons (Back + Saved + History + Audio + Retranscribe + Copy + Export + Save on one row), the two strips felt stacked right on top of each other.

- **Pages bumped from `pt-12` to `pt-16`** (48 → 64 px) across `DictatePage`, `EditorPage`, `HistoryPage`, `LogsPage`, `ProcessesPage`, `ReaderPage`, `TranscribePage`. That gives a clean ~14 px gap below the floating capsule so the page header reads as its own row. Comment on `DictatePage` updated to explain the constraint (capsule height, not just Windows titlebar).
- **DictatePage header row now wraps** gracefully. Added `flex-wrap gap-4` to the outer row and `flex-wrap justify-end` to the right-side button group so on narrower windows the History/Audio/Retranscribe/Copy/Export/Save buttons drop to a second line instead of colliding with the Back button on the left.

## [0.19.4-alpha] — 2026-04-16

### Fixed — Code block: deletable, toolbar button toggles off

User feedback after v0.19.3 shipped: "correcto, ya puedo salir de él, pero no puedo borrarlo". Exiting the fence was only half the job — once created, the block had no way out.

- **Backspace at start of fence now removes it** (`codeBlockExit.ts`). If the block is empty, it's replaced with a paragraph at the same position. If it has content, the fence is converted to a paragraph via `setBlockType`, preserving the lines so the user keeps the text without the code formatting. Matches the standard ProseMirror blockquote/list behaviour and how every other block on the toolbar behaves.
- **Toolbar code-block button is a real toggle** (`MilkdownEditor.tsx`). `toggleBlock('codeBlock')` now checks whether the cursor is already inside a `fence`/`code_block` node: if so it runs `turnIntoTextCommand` (lift back to paragraph); otherwise it runs `createCodeBlockCommand`. Same button creates and removes.

## [0.19.3-alpha] — 2026-04-16

### Changed — Milkdown polish: distinct headings, tighter toolbar, escapable code blocks

User feedback (three issues on one screenshot): "cuando le doy doble gato y espacio… el título no se ve claramente como título", "en la botonera hay cosas redundantes", "cuando inserto código después me captura todo el texto y no puedo salir de él".

- **Headings re-scaled for unambiguous hierarchy** (`src/index.css`). `.milkdown h1` → 2 rem / 800, bottom rule. `.milkdown h2` → 1.6 rem / 750, thinner bottom rule (`color-mix` with edge). `.milkdown h3` → 1.3 rem / 700. H4 added. Body content stays at 1 rem, so a heading visually dominates its paragraph instantly — matches Obsidian 2026 grammar.
- **Live-preview markers shrunk** to `0.65em` (was 0.85em) with `display: inline` + `white-space: pre` and tighter 0.25em right margin. Inside a 2 rem H1 the dimmed `# ` hint now sits quietly at ~1.3 rem — present but subordinated, so the title reads as the main element.
- **Toolbar: inline-code button removed** from `InlineToolbar`. Users can still type backticks; the button was visually indistinguishable from the code-block icon next to it. Code-block icon swapped `terminal` → `code_blocks` (Material Symbols); title updated to surface the new shortcut: "Code block (Ctrl+Enter to exit)".
- **Code-block escape keymap** (`milkdown/plugins/codeBlockExit.ts`). New `$prose` plugin handles `Ctrl/Cmd+Enter`, `Shift+Enter`, `Escape`, and double-Enter on a blank last line — all exit the fence into a fresh paragraph after the block. Fixes the "trapped inside the code block" complaint.

## [0.12.1] — 2026-04-15

### Changed — Phase E7: Note cards reshape (grid + table)
User feedback: "las tarjetas siguen estando toscas tanto en su version de tabla como de tarjetas." Previous passes tuned colors and shadows but kept the same chunky layout: four competing elements in the header (checkbox, warm-stone source icon chip, title, hover actions), a corner dot, and a stacked source label below the title.

Grid card rewritten to follow ElevenLabs hierarchy — **one primary focus (title), one secondary meta line, actions appear on hover**:
- Header row collapses to title + hover action group. Checkbox, folder-move select, and delete all hide by default (opacity-0) and reveal on `group-hover:opacity-100`.
- Source icon chip removed from the header — the icon now lives inline in the meta footer, one small glyph at 13 px.
- Corner dot removed; color accent becomes a subtle 6 px dot at the right end of the meta footer with 50 % opacity.
- Title: `text-[15.5px] font-normal leading-snug` (down from `font-medium` with uppercase label stacked below). `font-weight: 400` reads cleaner with the Geist family.
- Preview: `text-[13px] leading-[1.6] tracking-[0.14px] text-muted/85`, 3 lines.
- Meta footer: `icon · SOURCE · date · dot` in one compact line at `text-[11px] text-muted/70`, tracking `0.14em` on the ALL CAPS source label.
- Shadow stack simplified: `inset-border` at rest, adds `soft + warm` on hover. Removed the `outline` and `card` doubled layers.
- Radius `rounded-3xl` → `rounded-2xl` (less rounded corners read tighter on smaller cards).
- Grid gap `4 → 5` for more breathing between cards.

List / table row rewritten too:
- Single row: color dot (1.5 px) · title + preview (stacked, 2 lines) · meta chips (icon · source · date) · hover actions.
- Removed the warm-stone source icon chip, the title-adjacent uppercase badge, and the absolute corner dot.
- Row height matches the grid meta line sizing for visual coherence.

## [0.12.0] — 2026-04-15

### Changed — Phase E6: Whisper-thin icons, airy typography, thin scrollbars
User feedback: "los iconos de toda la app, sus distancias, sus tamaños de tipografía, todo se ve tosco. trabaja pensando en ElevenLabs."

ElevenLabs' distinctive trait is restraint: weight-300 display type, icons with thin strokes and slightly negative grade, letter-spacing that makes copy feel airy, scrollbars that barely exist. Phase E6 applies those levers globally.

- **Material Symbols weight** across the main window and overlay: **400 → 300**, `GRAD` **0 → −25** (thinner glyph strokes). `.fill-1` drops to 320 as well. The Google Fonts URL now requests the full axis range (`opsz 20..48, wght 100..700, FILL 0..1, GRAD −50..200`) so all widgets can vary.
- **Headings**: global `h1` / `h2` / `h3` / `h4` default to `font-weight: 300 / 300 / 400 / 500` with progressively tighter negative letter-spacing — matches ElevenLabs' whisper-thin display pattern.
- **Body smoothing**: added `-webkit-font-smoothing: antialiased`, `text-rendering: optimizeLegibility`, explicit `font-variation-settings: 'wght' 400` on body. Labels and `.wa-eyebrow` pick up `letter-spacing: 0.14em` for the ALL CAPS airy eyebrow feel.
- **Global scrollbar** redesigned (index.css): rounded-full thumb with 2 px transparent border via `background-clip: padding-box`, transparent track, `scrollbar-width: thin` + `scrollbar-color` on `*` for Firefox. Width dropped from chrome default to **8 px**. Replaces the chunky squared bar that was leaking through the rest of the redesign.
- **Sidebar density**: nav items tightened — icon size `20px → 17px`, gap `12px → 10px`, vertical padding `10px → 8px`, label size `13px → 12.5px`. Compact without losing the tap target.

### Changed — overlay widget scrollbar (Phase E5d)
User feedback: previous passes only changed colors on the widget, scrollbar still looked default/boxy.

- Added ElevenLabs-style custom scrollbars for `.widget-text`, `.widget-scroll`, and any element with `[data-scroll]` inside `.widget-expanded`.
  - Width: **6 px** (from default ~17 px chrome bar).
  - Track: fully transparent.
  - Thumb: rounded-full pill at `rgba(0, 0, 0, 0.14)` (light) / `rgba(255, 255, 255, 0.14)` (dark), with a 1 px transparent border via `background-clip: padding-box` so it reads as a thin capsule inset from the edge.
  - Hover thumb: warm-stone tint `rgba(78, 50, 23, 0.32)` in light, `rgba(255, 255, 255, 0.28)` in dark.
  - Firefox: `scrollbar-width: thin` + `scrollbar-color`.
- `.widget-text` also switched from hard `border: 1px solid var(--w-border)` to the inset-border shadow grammar used by the rest of the E5 surfaces, so the scrolling area aligns with the pill.

## [0.11.3] — 2026-04-15

### Changed — overlay widget tone-down (Phase E5c)
User feedback after 0.11.2: the widget felt off — shadow "exaggerated", surface too see-through, not yet the ElevenLabs grammar we sketched in `docs/design-system/elevenlabs.md`.

- Surface **near-opaque**:
  - Light: `--w-bg` 0.88 → 0.98, `--w-bg-strong` 0.96 → solid `#ffffff`, `--w-warm` 0.90 → 0.98.
  - Dark: `--w-bg` 0.74 → 0.96, `--w-bg-strong` 0.92 → solid, `--w-warm` 0.90 → 0.96.
- **Shadows dropped below 0.1 opacity** to match ElevenLabs' "surfaces barely exist" feel:
  - `--w-shadow-float` 0.10 / 0.45 → **0.05 / 0.25** (light / dark), with a second layer at 0.04 / 0.18 for definition.
  - `--w-shadow-card` and `--w-shadow-warm` tightened similarly.
- Removed the gaming-neon **primary glow** `0 0 44px -16px rgba(19,127,236,0.25)` from `.notch-pill` — replaced with the standard inset + outline + float stack.
- Dropped `backdrop-filter: blur(20px)` from `.notch-pill` and `blur(14px)` from `.widget-expanded`. With near-opaque backgrounds the blur added muddy glass artifacts and nothing else.

Net: the pill now reads like a thin, airy surface sitting just above the canvas, with just enough shadow to separate it.

## [0.11.2] — 2026-04-15

### Fixed — overlay widget invisible
Follow-up to 0.11.1: the widget was not appearing even after "Show widget" or "Reset position", and no errors landed in notifications. Root cause was the v0.11.1 CSS applying `padding: 14px` on `html, body, #root` simultaneously. Combined with the inline `box-sizing: border-box` + `width: 100%; height: 100%` from `overlay.html`, the three padded layers compounded into 42 px of inset. The widget's fixed `360×64` body then exceeded the content area and was clipped away by `overflow: hidden`. Result: the window opened correctly but its contents were fully masked out.

- `widget.css` now applies the 14 px transparent ring **only on `#root`**. html and body stay at 100% with zero padding, so the widget's inner 360 px width matches the post-padding content area exactly (388 − 28 = 360).
- No change to `OVERLAY_PAD` or the window-size math — just scoped the padding to the right container.

## [0.11.1] — 2026-04-15

### Fixed — overlay widget shadow + dropdown polish (Phase E5b)
User reported two issues on the rebuilt widget: the drop shadow read as a hard rectangle despite the rounded pill body, and the `<select>` dropdown still used the OS default styling.

- **Square-shadow bug.** The Electron `BrowserWindow` for the overlay was sized **exactly** to the widget's CSS box (360×64 / 360×120 / 760×84). When the pill drew a 18 px-offset / 40 px-blur drop shadow outside its rounded corners, the shadow was immediately clipped at the rectangular window bounds, leaving only the vertical/horizontal edges visible as sharp rectangles.
  - Added `OVERLAY_PAD = 14` in `widget-store.ts`. All three size constants now include a 14 px transparent ring on every side (e.g. 360×64 → 388×92).
  - `widget.css` adds `padding: 14px` on `html, body, #root` (box-sizing: border-box is already inline) so the widget body stays at its original inner size while the shadow bleeds into the new transparent zone.
  - Tightened `--w-shadow-float` from `0 18px 40px` to `0 6px 12px + 0 1px 3px` so the total extent fits within the 14 px ring in both light and dark.
- **Native `<select>` dropdown.** The `<option>` popup in `.notch-prompt-select` and `.widget-select` ignored the widget CSS.
  - Added `color-scheme: light` / `html.dark { color-scheme: dark }` so Chromium's native dropdown matches the theme.
  - Explicit `<option>` styling — `background: var(--w-bg-strong); color: var(--w-text)` for both selects.
  - Both selects now render their own caret via an SVG `background-image`, so `appearance: none` + the app's chevron look consistent across OSes.
  - `.widget-select` / `.widget-textarea` swapped the hard `border` for the ElevenLabs inset-border shadow; focus ring layered via a second shadow slot.

## [0.11.0] — 2026-04-15

### Changed — Phase E5: Overlay widget redesign
The floating widget (separate Vite entry, plain CSS at `src/overlay/widget.css`) previously ran a single dark-only palette with hardcoded rgba literals, so the main app's theme toggle had no visual effect on it. Phase E5 aligns the widget with `docs/design-system/elevenlabs.md`:

- **Dual-theme tokens** added. `:root` now defines the **light** palette (near-white canvas `rgba(255, 255, 255, 0.88)`, warm-stone accent `rgba(245, 242, 239, 0.9)`, muted black text, sub-0.1 opacity black outlines). `html.dark` overrides to the original dark palette. Extra tokens: `--w-warm`, `--w-shadow-inset`, `--w-shadow-outline`, `--w-shadow-card`, `--w-shadow-warm`, `--w-shadow-float`.
- **`overlay.html`**: default class switched from `dark` to `light`, bootstrap fallback now mirrors the main window (`s.theme || 'light'`, `system` respected). Font stack now Geist-first (`'Geist', 'Inter', system-ui`) plus the ElevenLabs body letter-spacing (`0.14px`) applied globally to the overlay root.
- **Surface migration** to multi-layered shadow grammar:
  - `.widget-drag-handle` — loses the hardcoded dark bg + border, now `var(--w-bg-strong)` + inset-border shadow.
  - `.notch-idle` — the tiny idle notch wears the warm-stone pill look (`var(--w-warm)` + inset + warm shadow) instead of the dark gradient with heavy drop shadow.
  - `.notch-pill` — expanded dictation pill: hardcoded white border + 0.6 black bg → `var(--w-bg)` + inset-border + float shadow + a subtle primary glow (`0 0 44px -16px rgba(19,127,236,0.25)`) that survives both themes.
  - `.widget-expanded` — container radius `16px` → `22px`, border removed, `shadow-float + shadow-inset` replaces the hard 0.45 black drop.
  - `.hover-btn:hover` — now shows the warm-stone inset hover instead of the `rgba(255,255,255,0.08)` wash (works in light + dark).
- **Cleanup of 15+ hardcoded rgba literals** across backdrops, tooltips, module popovers, and cards — all routed through `--w-*` tokens. The widget now follows the user's theme toggle immediately.

## [0.10.0] — 2026-04-15

### Changed — Phase E4: visible redesign pass
User feedback: previous Phase E waves added primitives + migrated a handful of CTAs but the surfaces they stare at most (notes list, sidebar brand, cards) still read "SaaS 2020". This pass tackles those.

- **Notes list header** (`DictatePage` list mode):
  - Title "Notes" goes from `text-3xl font-black tracking-tight` to `text-[44px] font-light tracking-[-0.02em]` — ElevenLabs-style whisper-thin display heading.
  - Container padding bumped to `px-10 pt-14 pb-6`, header margin to `mb-8` for the airy "breathing room" feel.
  - Subtitle wears `text-[15px] tracking-[0.14px]` — explicit body letter-spacing.
- **Search + filter row**: boxed `rounded-2xl border border-edge bg-surface/40` → `rounded-2xl bg-[var(--theme-warm)] shadow-[inset-border,warm]`. Search input itself becomes a pill (`rounded-full` + inset-border shadow + focus-ring via shadow layering). Color-filter strip + view toggle also pill-shaped with inset shadow.
- **Note cards** (grid view):
  - Harsh `border border-edge/80 border-l-4` replaced with multi-layered shadow stack (`inset-border + outline + soft`), radius bumped to `rounded-3xl`, min-height to `190px`.
  - Color accent moved from a heavy left-border strip to a small `w-2 h-2 rounded-full` dot in the top-right corner.
  - Source icon now a round warm-stone chip with inset border, not a square tile.
  - Title weight eased from `semibold` to `medium` with slight negative tracking; source label ALL CAPS badge made smaller (`text-[10px]`) with wider letter-spacing (`tracking-[0.1em]`).
  - Footer separator border removed for openness; hover lift gains a warm-tinted shadow.
- **Note cards** (list view): same shadow-stack migration + corner dot + round source chip.
- **Sidebar brand block**: square `rounded-xl` primary-tinted tile → round warm-stone chip with inset-border shadow. Wordmark switched to `font-light tracking-[-0.01em]`, workspace label to ALL CAPS with `tracking-[0.14em]`.
- **Sidebar nav items** (Notes, Processes, History, Logs, Settings): all go from `rounded-lg + primary/10` active state to `rounded-full + warm-stone + inset-border` active state. Non-active items lose the bg-surface hover for a lighter `bg-surface/70` wash. Typography lightened (`font-normal` baseline, `font-medium` active).

## [0.9.3] — 2026-04-15

### Fixed — critical (follow-up)
- **Render loop persisted** despite the v0.9.2 split-selector fix because of edge cases around HMR / two separate Zustand subscriptions on the same store. Hardened `ActionDock` to use a **single** subscription with `useShallow` from `zustand/react/shallow` so the consumer only re-renders when either `order` or the `items` map actually changes by shallow identity.
- `ActionEntry` tick replaced with `useReducer` (bounded 16-bit counter) — removes the `[_, tick] = useState(0)` antipattern that forced a new interval function identity on every render.
- `ErrorBoundary.componentDidCatch` now dedupes consecutive reports with the same `error.message` so a runtime loop can't amplify into a flood of duplicate log entries.

## [0.9.2] — 2026-04-15

### Fixed — critical
- **Infinite render loop on startup** (`Maximum update depth exceeded`). `ActionDock` was subscribing to the actions store with a selector that computed `s.order.map((id) => s.items[id]).filter(Boolean)` inline. The selector returned a brand-new array each render, which Zustand compares with `Object.is`, so the consumer kept re-rendering forever. Split into two stable selectors (`order` and `items` map) and derive the array inside `useMemo`.
- **Phase H** (planned milestone): switch dictation from 30 s chunked flushes to a true streaming pipeline (Deepgram or OpenAI streaming STT), so the typewriter reveal mirrors live audio instead of buffered chunks. Touches `dictation.ts` core + paste-anywhere flow — kept out of the spring sprint per agreement.

## [0.9.1] — 2026-04-15

### Changed — Phase E3 (second wave)
- `DictatePage` header utilities migrated to `<Button>`:
  - History / Audio / Retranscribe toggle pills → `variant="outline" size="sm"` with the new `active` prop replacing per-button active-state classes.
  - Copy and Export icon buttons → `variant="ghost" size="icon"`.
- `EditorPage` "Back to notes" button → `<Button variant="ghost" size="sm" leftIcon="arrow_back">`.
- No regressions — all 3 toggles still wire to `toggleUtilityPanel` and respect `data-testid` selectors for E2E.

## [0.9.0] — 2026-04-15

### Added — Phase E3 (first wave)
- `Button` primitive extended: new `chip` variant (rounded-full filter pill with `active` state), new `xs` and `icon` sizes, `active` prop with per-variant ACTIVE map for chip/outline/ghost/subtle.

### Changed
- `LogsPage`: filter chips and `Copy visible` / `Clear all` action buttons migrated to `<Button>` (`chip` + `outline` variants). 12 inline button blocks reduced to one component call each.
- `ChangelogModal`: copy-all and close icon buttons migrated to `<Button variant="ghost" size="icon">`.
- `SettingsModal`: ProviderCard action buttons (Connect / Cancel / Test / Disconnect / Finish auth / Test key) for both OpenAI and Claude migrated to `<Button>` — unified `primary`/`outline` variants. Overlay widget action buttons + Advanced Clear-logs + close-modal icon also migrated.
- All migrated surfaces inherit the ElevenLabs grammar in one place (pill radius, multi-layered shadows, `tracking-[0.14px]`, focus ring), removing per-button duplication.

## [0.8.0] — 2026-04-15

### Fixed — Phase G: gap closure
- **G1 — LLM panel save-first gate removed.** `DebatePanel` accepts an optional `ensureNoteId` prop. DictatePage wires it to `persistCurrentNote`. When the user toggles the AI panel on an unsaved draft, the panel triggers a silent autosave, waits for the new `noteId` to flow back through the existing `useEffect`, and honors the original open intent without forcing a manual "Save" click. The legacy `notes.processNeedsSave` notification only fires now if `ensureNoteId` is genuinely unavailable.
- **G2 — Typewriter blur survives TipTap.** New `RevealMark` (TipTap `Mark.create`) registered in `RichEditor`'s extension list whitelists `<span class="wa-reveal">`. StarterKit no longer flattens the spans, so the Phase C fade+blur transition (220 ms, opacity + filter) renders as designed.

### Notes
- **Phase G3** (real-time streaming for record-into-note) is intentionally deferred — see `[Unreleased]` Phase H. Tracking it as a milestone-sized change because it touches the dictation paste pipeline.

## [0.7.1] — 2026-04-15

### Fixed — Phase F: verification & cleanup
- `apps/desktop/src/pages/DictatePage.tsx:51` — `TRANSCRIBE_LANGUAGES` retyped as `ReadonlyArray<{ code; label?; labelKey? }>` so the TS discriminated union doesn't reject `option.label`/`option.labelKey` access at line 1369.
- `apps/desktop/src/stores/transcription.ts:477` — `audioUrl` initial value flipped from `null` → `undefined` to match the `TranscriptionJob` shape (`audioUrl?: string`).
- All four pre-existing TS errors that have been around since the `error handle` baseline are now resolved.

### Verified
- `pnpm tsc --noEmit` — **0 errors**
- `pnpm vitest run` — **251/252** passing (the one failure is a pre-existing clipboard debounce flake on the baseline; not introduced by this redesign).
- `pnpm vite build` — succeeds in ~11s, main bundle ~213 kB gzip.
- `pytest tests/` — **220/220** passing.

### Docs
- `docs/IMPORTANT/STATUS.md` updated with the spring-2026 redesign log + verification snapshot.
- `CLAUDE.md` "What was DONE" + "What's NEXT" rewritten to point at `REDESIGN-PLAN.md` and `CHANGELOG.md` as the per-version source of truth.

## [0.7.0] — 2026-04-15

### Added — Phase E2: Component rollout of ElevenLabs grammar
- `src/components/ui/Button.tsx` — pill-first Button primitive with 6 variants (`primary`, `pill`, `outline`, `ghost`, `subtle`, `danger`) and 3 sizes. Primary/pill variants carry the multi-layered warm shadow stack and lift on hover. Available for incremental adoption across pages.
- `src/components/ui/Card.tsx` — Card primitive with 3 variants (`default`, `warm`, `flat`) using the `shadow-inset-border + shadow-outline` / `+ shadow-warm` stacks — surfaces that "barely exist".
- Base typography in `src/index.css`: body inherits the Geist-first stack and carries the ElevenLabs `letter-spacing: 0.14px`; headings tighten to `-0.01em`; monospace family wired to `Geist Mono`.

### Changed
- Sidebar "Upgrade" button → pill (`rounded-full`) with `shadow-card` + hover lift.
- DictatePage "Save" button → pill with `shadow-card`, brightness-hover, subtle translate-y on hover, respects disabled state.
- ActionDock entries → `shadow-card + shadow-inset-border` stack replacing the old generic `shadow-lg`, radius bumped to `rounded-2xl`.

## [0.6.0] — 2026-04-15

### Added — Phase E1: Dual-theme foundation
- `<ThemeToggle />` in the AppShell topbar (cycles light → dark → system). Persists via `useSettingsStore` and triggers the existing `applyTheme` pipeline.
- ElevenLabs-inspired tokens in `src/index.css`: warm-stone surface (`--theme-warm`), multi-layered sub-0.1 opacity shadows (`--theme-shadow-inset-border`, `--theme-shadow-outline`, `--theme-shadow-card`, `--theme-shadow-warm`), pill radius (`--radius-pill: 9999px`), and matching Tailwind v4 `@theme` tokens (`shadow-card`, `shadow-warm`, `shadow-outline`, `shadow-inset-border`).
- Typography: Geist + Geist Mono loaded from Google Fonts and added first in the `--font-family-display` / `--font-family-mono` stacks with Inter as fallback (open-source per user choice).

### Changed
- Default theme is now **light** — `index.html` class, inline bootstrap fallback, and `useSettingsStore` initial state all flipped. Persisted preference still wins; `system` respects OS.
- Light palette refreshed to match ElevenLabs: `--theme-base` near-white, `--theme-surface` + `--theme-surface-alt` at `#f6f6f6` / `#f5f5f5`, `--theme-edge` `#e5e5e5`, warm accent added.

## [0.5.0] — 2026-04-15

### Added — Phase D: Settings rail
- Settings modal rewritten with a **left rail** of 9 sections: General, Account, AI providers, Hotkeys, Audio & Dictation, Transcription & Translation, Text-to-speech, Overlay & Widget, Advanced. Right pane scrollable, max-width capped, sticky header, Esc-to-close, click-outside-to-close.
- Each section lives in its own internal `Pane*` component under `SettingsModal.tsx` — easier to extend without touching siblings.
- New section `Advanced` scaffolded with a `Clear logs` action (wires into the notifications store).
- i18n keys for every section title + advanced labels (EN + ES).

### Changed
- SettingsModal layout: single-column stacked sections → rail (w-48) + pane (flex-1). Max width `max-w-4xl`, height `80vh` capped at 720px.
- All rows use a consistent `<Row label desc>{control}</Row>` pattern for density and alignment.

## [0.4.0] — 2026-04-15

### Added — Phase C: Typewriter reveal
- `src/lib/typewriter.ts` — editor-agnostic reveal queue. Splits incoming text into words, emits them at a configurable max-words-per-second (default 8 wps) via `setInterval`, and honors `prefers-reduced-motion` (inserts synchronously when the OS asks to reduce motion).
- `src/index.css` — `.wa-reveal` / `.wa-reveal-shown` classes with 220ms fade + blur(4px) → blur(0) transition. Respects `prefers-reduced-motion`.
- `DictatePage` wires the queue to the TipTap editor: each finalized dictation delta is enqueued instead of dumped in one paragraph, giving a "writing itself" rhythm. Each word is inserted as `<span class="wa-reveal">` and kicks into `.wa-reveal-shown` on the next animation frame.

### Changed
- Record-into-note flow no longer pastes 30 s of transcript at once — the chunk streams in word-by-word while flushes continue in the background.

## [0.3.0] — 2026-04-15

### Added — Phase B: Action System
- `src/stores/actions.ts` — **generic Action System** store. Any long-running user action registers an `ActionInstance` with label, status, progress, preview, and `pause/resume/stop/cancel` handlers. Terminal statuses auto-cleanup after a short grace window (8s for failed, 2.5s for completed/canceled).
- `src/components/actions/ActionPill.tsx` — `ActionDock` floating primitive (bottom-right, max 3 stacked, overflow badge). Each pill renders kind-specific icon + accent, live elapsed timer, progress bar, optional preview, and per-kind controls (pause/resume/stop/cancel/dismiss). Click toggles expansion or navigates to owning context.
- Kind palette: `mic` (red), `live` (primary), `transcribe` (primary), `tts`/`tts-read` (emerald), `ai-edit` (purple), `upload` (amber).
- Wired stores:
  - `dictation.ts` → registers `dictation.mic` on `start`, updates preview with last transcript slice, transitions to `finishing` on `stop`, `completed` on final chunk, `failed` on error, `canceled` on early reset.
  - `live.ts` → registers `live.meeting` with source sublabel; handlers wire into `stop`/`reset`.
  - `transcription.ts` → registers `transcribe.<jobId>` on `createJob` with cancel wired to the existing `AbortController`.
- `AppShell` mounts `<ActionDock />` so the dock is visible from every page.

### Fixed — B3 closure
- There is now always a visible widget with stop/cancel during recording, live meetings, and file transcription — the user no longer needs the right-click menu to halt an action.

## [0.2.0] — 2026-04-15

### Added
- `docs/IMPORTANT/REDESIGN-PLAN.md` — living redesign plan, referenced from `CLAUDE.md` session-start checklist.
- `ChangelogModal` — in-app modal that parses and renders `CHANGELOG.md` (via Vite `?raw` import). Replaces the prior GitHub link on the version badge.
- `vite.config.ts` `server.fs.allow` extended to the workspace root so `?raw` imports of top-level docs work.
- Type declarations for `*?raw` and `*.md` raw imports in `global.d.ts`.

### Changed
- `VersionBadge` now opens the local `ChangelogModal` instead of `openExternal` to a GitHub URL.
- `DictatePage` header: `pt-8` → `pt-12` so copy/export/save buttons never hide under native Windows min/max/close overlay.
- `DictatePage` editor column: `max-w-3xl` → `max-w-none 2xl:max-w-[1400px]` so the note editor uses the freed space when the sidebar is collapsed.
- `Sidebar` folder toolbar: removed the redundant voice-note button (voice recording stays reachable from the note context menu and the mic action).

### Fixed
- **B1 — Repaste fantasma**: `dictation.start()` no longer keeps prior `text` / `translatedText`; the main-process paste cache is cleared too. Silent/empty flush chunks are dropped instead of appending blanks that re-trigger the paste of stale content. `dictation.stop()` with no active recorder now forces idle, and the safety timeout clears the paste cache when no audio was captured.
- **B2 — Stale draft on "Nueva nota"**: `DictatePage.newNote()` and `openNote()` now call `dictation.reset()` and `live.reset()` before wiring editor state, preventing the previous session's transcript from being re-inserted into a fresh note.

## [0.1.0] — 2026-04-15

### Added
- **Logs page** (`LogsPage`) with copy-per-entry, Copy visible, Clear all, tone filter (error/warning/info/success/debug), and searchable history. Accessible from the sidebar nav (bug_report icon).
- **ErrorBoundary** around the whole `App` — unexpected React crashes now render a fallback with the error, stack trace, and Copy button.
- **Backend event bridge**: `backend.ts` broadcasts `start`/`error`/`exit` events through IPC; the renderer subscribes via `window.whisperall.backend.onEvent` and funnels them into the logs store.
- **Backend log tail**: new IPC `backend:log-tail` + UI disclosure in LogsPage to load and copy the last ~200 lines of `backend.log`.
- **Global window error hooks** (`error`, `unhandledrejection`) reported through `reportError`.
- `reportError(context, error)` helper in `stores/notifications` — every catch in `transcription`, `live`, and `tts` now pushes a detailed error notification.
- `src/stores/ui.ts` — UI preferences (sidebar collapse) persisted in localStorage.
- Sidebar: collapse/expand toggle, permanent **Procesos** entry, permanent **Logs** entry, version badge (`VersionBadge`) in footer.
- `docs/design-system/elevenlabs.md` — ElevenLabs-inspired design system reference for the rebrand.
- `CHANGELOG.md` (this file).
- i18n keys for `processes.*`, `nav.processes`, `nav.logs`, `sidebar.collapse/expand/version`, `theme.*` (EN + ES).
- Notification store extended with `detail`, `source`, `context`, tones `warning`/`debug`, localStorage persistence (up to 200 entries).

### Changed
- Sidebar: merged "Nueva nota"/"Voice Note" full-width buttons into compact icon actions next to the folder header — less redundancy with the top Notes nav.
- Notification toast/bell: support the 5 new tones (info/success/error/warning/debug).
- `CLAUDE.md`: removed dark-only mandate; added mandatory Versioning + CHANGELOG rule, mandatory error-visibility rule, dual-theme rule.
- `.claude/rules/code-style.md`: dual-theme replaces dark-only.
- `apps/desktop/package.json`: version bumped to `0.1.0`.

### Fixed
- Raw i18n keys leaking to UI in Processes filters and notification toggles (`processes.title`, `processes.desc`, `processes.filter.*`, `processes.notifyOnly`, `processes.notifySound`, `processes.notifyPerProcess`, `processes.notifyInherited`, `processes.stageTranscribe`, `processes.openTranscribe`, `processes.refresh`).
- `App.tsx` pre-existing TS error where `electron` was possibly undefined inside the hotkey callback.

## [0.0.1] — 2026-02-10

- Baseline of the v3 rewrite (M1–M16). See `docs/IMPORTANT/STATUS.md` for the full milestone log.
