import type { Tool, CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type {
  CreateDocumentParams,
  UpdateDocumentParams,
} from "@whisperall/api-client";
import { base64ToBlob } from "./audio.js";
import { formatError } from "./errors.js";

// ── Tool Definitions ────────────────────────────────────────

export const TOOLS: Tool[] = [
  {
    name: "whisperall_dictate",
    description: "Transcribe speech from an audio clip using OpenAI STT (gpt-4o-mini-transcribe). Returns the transcribed text.",
    inputSchema: {
      type: "object",
      properties: {
        audio_base64: { type: "string", description: "Base64-encoded audio (webm/wav). May include a data-URL prefix." },
        language: { type: "string", description: "ISO 639-1 language code (e.g. 'en', 'es'). Auto-detected if omitted." },
        prompt: { type: "string", description: "Optional context prompt to improve accuracy." },
      },
      required: ["audio_base64"],
    },
  },
  {
    name: "whisperall_live_transcribe",
    description: "Send an audio chunk for live meeting transcription. Returns the transcribed segment with optional translation.",
    inputSchema: {
      type: "object",
      properties: {
        audio_base64: { type: "string", description: "Base64-encoded audio chunk." },
        translate_to: { type: "string", description: "Target language code for inline translation (e.g. 'es', 'fr')." },
      },
      required: ["audio_base64"],
    },
  },
  {
    name: "whisperall_transcribe_url",
    description: "Transcribe audio/video from a URL. Supports diarization (speaker identification). Returns full transcript.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Public URL of the audio/video file." },
        language: { type: "string", description: "ISO 639-1 language code. Auto-detected if omitted." },
        enable_diarization: { type: "boolean", description: "Identify different speakers. Default: false." },
      },
      required: ["url"],
    },
  },
  {
    name: "whisperall_text_to_speech",
    description: "Convert text to speech using Google WaveNet. Returns a URL to the generated audio file.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to synthesize." },
        voice: { type: "string", description: "Voice name (e.g. 'en-US-Wavenet-D')." },
        language: { type: "string", description: "Language code (e.g. 'en-US')." },
      },
      required: ["text"],
    },
  },
  {
    name: "whisperall_translate",
    description: "Translate text to a target language using DeepL.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to translate." },
        target_language: { type: "string", description: "Target language code (e.g. 'ES', 'FR', 'DE')." },
      },
      required: ["text", "target_language"],
    },
  },
  {
    name: "whisperall_ai_edit",
    description: "AI-powered text editing: clean filler words, fix grammar, summarize, or apply custom transformations.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to edit (max 8000 chars)." },
        mode: { type: "string", description: "Edit mode: 'clean_fillers', 'fix_grammar', 'summarize', or custom." },
        prompt: { type: "string", description: "Custom instruction for the AI editor." },
      },
      required: ["text"],
    },
  },
  {
    name: "whisperall_list_documents",
    description: "List all saved documents/notes for the current user.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "whisperall_get_document",
    description: "Get a specific document by ID.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Document UUID." },
      },
      required: ["id"],
    },
  },
  {
    name: "whisperall_create_document",
    description: "Create a new document/note.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Document title." },
        content: { type: "string", description: "Document body text." },
        source: { type: "string", enum: ["dictation", "live", "transcription", "manual"], description: "Origin of the content." },
        tags: { type: "array", items: { type: "string" }, description: "Tags for organization." },
      },
      required: ["title", "content"],
    },
  },
  {
    name: "whisperall_update_document",
    description: "Update an existing document (partial update — only provided fields are changed).",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Document UUID." },
        title: { type: "string", description: "New title." },
        content: { type: "string", description: "New content." },
        tags: { type: "array", items: { type: "string" }, description: "New tags." },
      },
      required: ["id"],
    },
  },
  {
    name: "whisperall_delete_document",
    description: "Delete a document by ID.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Document UUID." },
      },
      required: ["id"],
    },
  },
  {
    name: "whisperall_get_usage",
    description: "Get current usage statistics and plan limits (STT seconds, TTS chars, translations, etc.).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "whisperall_get_history",
    description: "List recent activity across all WhisperAll modules (dictation, transcription, TTS, etc.).",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max entries to return (default 50, max 200)." },
      },
    },
  },
];

// ── API shape (mirrors api.ts wiring) ───────────────────────

export type WhisperAllApi = {
  dictate: { send: (p: { audio: Blob; language?: string; prompt?: string }) => Promise<unknown> };
  live: { sendChunk: (p: { audio: Blob; translate_to?: string }) => Promise<unknown> };
  transcribe: { fromUrl: (p: { url: string; language?: string; enable_diarization?: boolean }) => Promise<unknown> };
  tts: { synthesize: (p: { text: string; voice?: string; language?: string }) => Promise<unknown> };
  translate: { translate: (p: { text: string; target_language: string }) => Promise<unknown> };
  aiEdit: { edit: (p: { text: string; mode?: string; prompt?: string }) => Promise<unknown> };
  documents: {
    list: () => Promise<unknown>;
    get: (id: string) => Promise<unknown>;
    create: (p: CreateDocumentParams) => Promise<unknown>;
    update: (id: string, p: UpdateDocumentParams) => Promise<unknown>;
    delete: (id: string) => Promise<void>;
  };
  history: { list: (limit?: number) => Promise<unknown> };
  usage: { get: () => Promise<unknown> };
};

// ── Handler ─────────────────────────────────────────────────

function ok(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

export async function handleTool(
  name: string,
  args: Record<string, unknown>,
  api: WhisperAllApi,
): Promise<CallToolResult> {
  try {
    switch (name) {
      // ── Audio tools ───────────────────────────────────
      case "whisperall_dictate":
        return ok(await api.dictate.send({
          audio: base64ToBlob(args.audio_base64 as string),
          language: args.language as string | undefined,
          prompt: args.prompt as string | undefined,
        }));

      case "whisperall_live_transcribe":
        return ok(await api.live.sendChunk({
          audio: base64ToBlob(args.audio_base64 as string),
          translate_to: args.translate_to as string | undefined,
        }));

      case "whisperall_transcribe_url":
        return ok(await api.transcribe.fromUrl({
          url: args.url as string,
          language: args.language as string | undefined,
          enable_diarization: args.enable_diarization as boolean | undefined,
        }));

      // ── Text tools ────────────────────────────────────
      case "whisperall_text_to_speech":
        return ok(await api.tts.synthesize({
          text: args.text as string,
          voice: args.voice as string | undefined,
          language: args.language as string | undefined,
        }));

      case "whisperall_translate":
        return ok(await api.translate.translate({
          text: args.text as string,
          target_language: args.target_language as string,
        }));

      case "whisperall_ai_edit":
        return ok(await api.aiEdit.edit({
          text: args.text as string,
          mode: args.mode as string | undefined,
          prompt: args.prompt as string | undefined,
        }));

      // ── Document tools ────────────────────────────────
      case "whisperall_list_documents":
        return ok(await api.documents.list());

      case "whisperall_get_document":
        return ok(await api.documents.get(args.id as string));

      case "whisperall_create_document":
        return ok(await api.documents.create({
          title: args.title as string,
          content: args.content as string,
          source: args.source as CreateDocumentParams["source"],
          tags: args.tags as string[] | undefined,
        }));

      case "whisperall_update_document": {
        const { id, ...updates } = args;
        return ok(await api.documents.update(id as string, updates as UpdateDocumentParams));
      }

      case "whisperall_delete_document":
        await api.documents.delete(args.id as string);
        return ok({ status: "deleted" });

      // ── Info tools ────────────────────────────────────
      case "whisperall_get_usage":
        return ok(await api.usage.get());

      case "whisperall_get_history":
        return ok(await api.history.list(args.limit as number | undefined));

      default:
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (e) {
    return formatError(e);
  }
}
