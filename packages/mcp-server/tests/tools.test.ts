import { describe, it, expect, vi } from "vitest";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { base64ToBlob } from "../src/audio.js";
import { formatError } from "../src/errors.js";
import { TOOLS, handleTool, type WhisperAllApi } from "../src/tools.js";
import { ApiError } from "@whisperall/api-client";

/** Extract the text string from the first content block. */
function textOf(r: CallToolResult): string {
  const c = r.content[0];
  if (c.type !== "text") throw new Error(`Expected text, got ${c.type}`);
  return c.text;
}

// ── Helpers ─────────────────────────────────────────────────

function mockApi(): WhisperAllApi {
  return {
    dictate: { send: vi.fn().mockResolvedValue({ session_id: "s1", text: "hello", is_final: true }) },
    live: { sendChunk: vi.fn().mockResolvedValue({ segment_id: "seg1", text: "live text" }) },
    transcribe: { fromUrl: vi.fn().mockResolvedValue({ text: "transcript", segments: [] }) },
    tts: { synthesize: vi.fn().mockResolvedValue({ audio_url: "https://cdn/audio.mp3" }) },
    translate: { translate: vi.fn().mockResolvedValue({ text: "hola" }) },
    aiEdit: { edit: vi.fn().mockResolvedValue({ text: "cleaned text" }) },
    documents: {
      list: vi.fn().mockResolvedValue([{ id: "d1", title: "Note 1" }]),
      get: vi.fn().mockResolvedValue({ id: "d1", title: "Note 1", content: "body" }),
      create: vi.fn().mockResolvedValue({ id: "d2", title: "New" }),
      update: vi.fn().mockResolvedValue({ id: "d1", title: "Updated" }),
      delete: vi.fn().mockResolvedValue(undefined),
    },
    history: { list: vi.fn().mockResolvedValue([{ id: "h1", module: "dictate" }]) },
    usage: { get: vi.fn().mockResolvedValue({ plan: "free", usage: {} }) },
  };
}

const SAMPLE_B64 = Buffer.from("fake-audio-data").toString("base64");

// ── base64ToBlob ────────────────────────────────────────────

describe("base64ToBlob", () => {
  it("converts raw base64 to Blob", () => {
    const blob = base64ToBlob(SAMPLE_B64);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("audio/webm");
    expect(blob.size).toBe(15); // "fake-audio-data" = 15 bytes
  });

  it("strips data-URL prefix", () => {
    const blob = base64ToBlob(`data:audio/wav;base64,${SAMPLE_B64}`, "audio/wav");
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBe(15);
  });
});

// ── formatError ─────────────────────────────────────────────

describe("formatError", () => {
  it("formats ApiError 401", () => {
    const result = formatError(new ApiError(401, "Unauthorized", "AUTH_FAILED"));
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("expired");
  });

  it("formats ApiError 429", () => {
    const result = formatError(new ApiError(429, "Too many", "RATE_LIMIT"));
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("quota");
  });

  it("formats ApiError generic", () => {
    const result = formatError(new ApiError(500, "Server error", "INTERNAL"));
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("500");
  });

  it("formats TypeError", () => {
    const result = formatError(new TypeError("missing field"));
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Invalid input");
  });

  it("formats unknown error", () => {
    const result = formatError("something broke");
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("something broke");
  });
});

// ── Tool definitions ────────────────────────────────────────

describe("TOOLS", () => {
  it("has 13 tools", () => {
    expect(TOOLS).toHaveLength(13);
  });

  it("every tool has name, description, inputSchema", () => {
    for (const tool of TOOLS) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe("object");
    }
  });

  it("all tool names start with whisperall_", () => {
    for (const tool of TOOLS) {
      expect(tool.name).toMatch(/^whisperall_/);
    }
  });
});

// ── handleTool ──────────────────────────────────────────────

describe("handleTool", () => {
  it("whisperall_dictate — passes Blob to api", async () => {
    const api = mockApi();
    const result = await handleTool("whisperall_dictate", { audio_base64: SAMPLE_B64, language: "en" }, api);
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(textOf(result))).toHaveProperty("text", "hello");
    const call = (api.dictate.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.audio).toBeInstanceOf(Blob);
    expect(call.language).toBe("en");
  });

  it("whisperall_live_transcribe", async () => {
    const api = mockApi();
    const result = await handleTool("whisperall_live_transcribe", { audio_base64: SAMPLE_B64 }, api);
    expect(JSON.parse(textOf(result))).toHaveProperty("segment_id", "seg1");
  });

  it("whisperall_transcribe_url", async () => {
    const api = mockApi();
    const result = await handleTool("whisperall_transcribe_url", { url: "https://example.com/audio.mp3" }, api);
    expect(JSON.parse(textOf(result))).toHaveProperty("text", "transcript");
  });

  it("whisperall_text_to_speech", async () => {
    const api = mockApi();
    const result = await handleTool("whisperall_text_to_speech", { text: "hello world" }, api);
    expect(JSON.parse(textOf(result))).toHaveProperty("audio_url");
  });

  it("whisperall_translate", async () => {
    const api = mockApi();
    const result = await handleTool("whisperall_translate", { text: "hello", target_language: "ES" }, api);
    expect(JSON.parse(textOf(result))).toHaveProperty("text", "hola");
  });

  it("whisperall_ai_edit", async () => {
    const api = mockApi();
    const result = await handleTool("whisperall_ai_edit", { text: "um like hello" }, api);
    expect(JSON.parse(textOf(result))).toHaveProperty("text", "cleaned text");
  });

  it("whisperall_list_documents", async () => {
    const api = mockApi();
    const result = await handleTool("whisperall_list_documents", {}, api);
    const data = JSON.parse(textOf(result));
    expect(data).toHaveLength(1);
    expect(data[0]).toHaveProperty("id", "d1");
  });

  it("whisperall_get_document", async () => {
    const api = mockApi();
    const result = await handleTool("whisperall_get_document", { id: "d1" }, api);
    expect(JSON.parse(textOf(result))).toHaveProperty("content", "body");
  });

  it("whisperall_create_document", async () => {
    const api = mockApi();
    const result = await handleTool("whisperall_create_document", { title: "New", content: "text" }, api);
    expect(JSON.parse(textOf(result))).toHaveProperty("id", "d2");
  });

  it("whisperall_update_document", async () => {
    const api = mockApi();
    const result = await handleTool("whisperall_update_document", { id: "d1", title: "Updated" }, api);
    expect(JSON.parse(textOf(result))).toHaveProperty("title", "Updated");
  });

  it("whisperall_delete_document", async () => {
    const api = mockApi();
    const result = await handleTool("whisperall_delete_document", { id: "d1" }, api);
    expect(JSON.parse(textOf(result))).toHaveProperty("status", "deleted");
  });

  it("whisperall_get_usage", async () => {
    const api = mockApi();
    const result = await handleTool("whisperall_get_usage", {}, api);
    expect(JSON.parse(textOf(result))).toHaveProperty("plan", "free");
  });

  it("whisperall_get_history", async () => {
    const api = mockApi();
    const result = await handleTool("whisperall_get_history", { limit: 10 }, api);
    const data = JSON.parse(textOf(result));
    expect(data[0]).toHaveProperty("module", "dictate");
    expect((api.history.list as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(10);
  });

  it("unknown tool returns error", async () => {
    const api = mockApi();
    const result = await handleTool("whisperall_nonexistent", {}, api);
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Unknown tool");
  });

  it("api error is caught and formatted", async () => {
    const api = mockApi();
    (api.dictate.send as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ApiError(401, "Unauthorized", "AUTH_FAILED"),
    );
    const result = await handleTool("whisperall_dictate", { audio_base64: SAMPLE_B64 }, api);
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("expired");
  });
});
