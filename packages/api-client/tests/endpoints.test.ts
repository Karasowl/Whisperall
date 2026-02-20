import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "./setup";
import { ApiClient } from "../src/client";
import { createTTSEndpoint } from "../src/endpoints/tts";
import { createTranslateEndpoint } from "../src/endpoints/translate";
import { createAiEditEndpoint } from "../src/endpoints/ai-edit";
import { createTranscribeEndpoint } from "../src/endpoints/transcribe";
import { createDictateEndpoint } from "../src/endpoints/dictate";
import { createLiveEndpoint } from "../src/endpoints/live";
import { createDocumentsEndpoint } from "../src/endpoints/documents";

const BASE = "http://localhost:8080";

function makeClient() {
  return new ApiClient({ baseUrl: BASE, token: "test-token" });
}

describe("TTS endpoint", () => {
  it("sends text and voice, returns audio_url", async () => {
    let capturedBody: unknown;
    server.use(
      http.post(`${BASE}/v1/tts`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ audio_url: "https://cdn.example.com/a.mp3" });
      })
    );

    const tts = createTTSEndpoint(makeClient());
    const res = await tts.synthesize({ text: "hello", voice: "en-US-WaveNet-D" });

    expect(res.audio_url).toBe("https://cdn.example.com/a.mp3");
    expect(capturedBody).toEqual({ text: "hello", voice: "en-US-WaveNet-D" });
  });
});

describe("Translate endpoint", () => {
  it("sends text and target_language, returns translated text", async () => {
    let capturedBody: unknown;
    server.use(
      http.post(`${BASE}/v1/translate`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ text: "hola" });
      })
    );

    const translate = createTranslateEndpoint(makeClient());
    const res = await translate.translate({ text: "hello", target_language: "ES" });

    expect(res.text).toBe("hola");
    expect(capturedBody).toEqual({ text: "hello", target_language: "ES" });
  });
});

describe("AI Edit endpoint", () => {
  it("sends text and mode, returns cleaned text", async () => {
    let capturedBody: unknown;
    server.use(
      http.post(`${BASE}/v1/ai-edit`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ text: "cleaned" });
      })
    );

    const aiEdit = createAiEditEndpoint(makeClient());
    const res = await aiEdit.edit({ text: "um hello", mode: "clean_fillers" });

    expect(res.text).toBe("cleaned");
    expect(capturedBody).toEqual({ text: "um hello", mode: "clean_fillers" });
  });
});

describe("Transcribe endpoint", () => {
  it("createJob sends params and returns job", async () => {
    let capturedBody: unknown;
    server.use(
      http.post(`${BASE}/v1/transcribe/jobs`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({
          id: "job-1", status: "pending", processed_chunks: 0, total_chunks: 3,
        });
      })
    );

    const transcribe = createTranscribeEndpoint(makeClient());
    const res = await transcribe.createJob({ total_chunks: 3, language: "en" });

    expect(res.id).toBe("job-1");
    expect(res.total_chunks).toBe(3);
    expect(capturedBody).toEqual({ total_chunks: 3, language: "en" });
  });

  it("registerChunk sends chunk data", async () => {
    let capturedBody: unknown;
    server.use(
      http.post(`${BASE}/v1/transcribe/jobs/job-1/chunks`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ ok: true });
      })
    );

    const transcribe = createTranscribeEndpoint(makeClient());
    const res = await transcribe.registerChunk("job-1", { index: 0, storage_path: "audio/c0.wav" });

    expect(res.ok).toBe(true);
    expect(capturedBody).toEqual({ index: 0, storage_path: "audio/c0.wav" });
  });

  it("run triggers processing", async () => {
    server.use(
      http.post(`${BASE}/v1/transcribe/jobs/job-1/run`, () => {
        return HttpResponse.json({
          id: "job-1", status: "processing", processed_chunks: 2, total_chunks: 3,
        });
      })
    );

    const transcribe = createTranscribeEndpoint(makeClient());
    const res = await transcribe.run("job-1", { max_chunks: 5 });

    expect(res.status).toBe("processing");
    expect(res.processed_chunks).toBe(2);
  });

  it("run works without params", async () => {
    let capturedBody: unknown;
    server.use(
      http.post(`${BASE}/v1/transcribe/jobs/job-1/run`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({
          id: "job-1", status: "processing", processed_chunks: 0, total_chunks: 3,
        });
      })
    );

    const transcribe = createTranscribeEndpoint(makeClient());
    const res = await transcribe.run("job-1");

    expect(res.status).toBe("processing");
    expect(capturedBody).toEqual({});
  });

  it("getJob returns status", async () => {
    server.use(
      http.get(`${BASE}/v1/transcribe/jobs/job-1`, () => {
        return HttpResponse.json({
          id: "job-1", status: "completed", processed_chunks: 3, total_chunks: 3,
        });
      })
    );

    const transcribe = createTranscribeEndpoint(makeClient());
    const res = await transcribe.getJob("job-1");

    expect(res.status).toBe("completed");
  });

  it("getResult returns transcript", async () => {
    server.use(
      http.get(`${BASE}/v1/transcribe/jobs/job-1/result`, () => {
        return HttpResponse.json({
          text: "full transcript text",
          segments: [{ start: 0, end: 1, text: "full", speaker: "A" }],
        });
      })
    );

    const transcribe = createTranscribeEndpoint(makeClient());
    const res = await transcribe.getResult("job-1");

    expect(res.text).toBe("full transcript text");
    expect(res.segments).toHaveLength(1);
  });
});

describe("Dictate endpoint", () => {
  it("sends audio as FormData", async () => {
    let contentType = "";
    server.use(
      http.post(`${BASE}/v1/dictate`, ({ request }) => {
        contentType = request.headers.get("content-type") ?? "";
        return HttpResponse.json({
          session_id: "sid-1", text: "hello world", is_final: false,
        });
      })
    );

    const dictate = createDictateEndpoint(makeClient());
    const blob = new Blob([new Uint8Array(100)], { type: "audio/wav" });
    const res = await dictate.send({ audio: blob, language: "en" });

    expect(res.text).toBe("hello world");
    expect(res.session_id).toBe("sid-1");
    expect(contentType).toContain("multipart/form-data");
  });

  it("includes all optional params when provided", async () => {
    let capturedForm: FormData | null = null;
    server.use(
      http.post(`${BASE}/v1/dictate`, async ({ request }) => {
        capturedForm = await request.formData();
        return HttpResponse.json({ session_id: "s1", text: "ok", is_final: true });
      })
    );

    const dictate = createDictateEndpoint(makeClient());
    const blob = new Blob([new Uint8Array(10)], { type: "audio/wav" });
    await dictate.send({
      audio: blob,
      session_id: "s1",
      is_final: true,
      language: "es",
      prompt: "context text",
    });

    expect(capturedForm!.get("session_id")).toBe("s1");
    expect(capturedForm!.get("is_final")).toBe("true");
    expect(capturedForm!.get("language")).toBe("es");
    expect(capturedForm!.get("prompt")).toBe("context text");
  });
});

describe("Live endpoint", () => {
  it("sends chunk as FormData with translate_to", async () => {
    server.use(
      http.post(`${BASE}/v1/live/chunk`, () => {
        return HttpResponse.json({
          segment_id: "seg-1", text: "live text", translated_text: "texto en vivo",
        });
      })
    );

    const live = createLiveEndpoint(makeClient());
    const blob = new Blob([new Uint8Array(50)], { type: "audio/wav" });
    const res = await live.sendChunk({ audio: blob, translate_to: "ES" });

    expect(res.text).toBe("live text");
    expect(res.translated_text).toBe("texto en vivo");
    expect(res.segment_id).toBe("seg-1");
  });

  it("includes session_id and chunk_index when provided", async () => {
    let capturedForm: FormData | null = null;
    server.use(
      http.post(`${BASE}/v1/live/chunk`, async ({ request }) => {
        capturedForm = await request.formData();
        return HttpResponse.json({ segment_id: "s2", text: "ok" });
      })
    );

    const live = createLiveEndpoint(makeClient());
    const blob = new Blob([new Uint8Array(50)], { type: "audio/wav" });
    await live.sendChunk({ audio: blob, session_id: "sess-1", chunk_index: 5 });

    expect(capturedForm!.get("session_id")).toBe("sess-1");
    expect(capturedForm!.get("chunk_index")).toBe("5");
  });
});

describe("Documents endpoint", () => {
  it("creates and lists transcription history entries", async () => {
    let capturedBody: unknown;
    server.use(
      http.post(`${BASE}/v1/documents/doc-1/transcriptions`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({
          id: "h-1",
          document_id: "doc-1",
          user_id: "u-1",
          block_id: "block-1",
          source: "audio",
          language: "es",
          diarization: true,
          text: "hola",
          segments: [{ text: "hola", speaker: "Speaker 1" }],
          audio_url: "https://cdn.example.com/a.mp3",
          created_at: "2026-02-20T00:00:00Z",
          updated_at: "2026-02-20T00:00:00Z",
        });
      }),
      http.get(`${BASE}/v1/documents/doc-1/transcriptions`, () => {
        return HttpResponse.json([
          {
            id: "h-1",
            document_id: "doc-1",
            user_id: "u-1",
            block_id: "block-1",
            source: "audio",
            language: "es",
            diarization: true,
            text: "hola",
            segments: [{ text: "hola", speaker: "Speaker 1" }],
            audio_url: "https://cdn.example.com/a.mp3",
            created_at: "2026-02-20T00:00:00Z",
            updated_at: "2026-02-20T00:00:00Z",
          },
        ]);
      })
    );

    const documents = createDocumentsEndpoint(makeClient());
    const created = await documents.createTranscription("doc-1", {
      block_id: "block-1",
      source: "audio",
      language: "es",
      diarization: true,
      text: "hola",
      segments: [{ text: "hola", speaker: "Speaker 1" }],
      audio_url: "https://cdn.example.com/a.mp3",
    });
    const listed = await documents.listTranscriptions("doc-1");

    expect(created.id).toBe("h-1");
    expect(created.block_id).toBe("block-1");
    expect(listed).toHaveLength(1);
    expect((capturedBody as { diarization: boolean }).diarization).toBe(true);
  });

  it("supports filtering transcription history by block_id", async () => {
    let hitFiltered = false;
    server.use(
      http.get(`${BASE}/v1/documents/doc-1/transcriptions?block_id=block-2`, () => {
        hitFiltered = true;
        return HttpResponse.json([]);
      }),
    );

    const documents = createDocumentsEndpoint(makeClient());
    await documents.listTranscriptions("doc-1", "block-2");
    expect(hitFiltered).toBe(true);
  });
});
