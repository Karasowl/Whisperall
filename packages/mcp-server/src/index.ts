#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  ApiClient,
  createDictateEndpoint,
  createLiveEndpoint,
  createTranscribeEndpoint,
  createTTSEndpoint,
  createTranslateEndpoint,
  createAiEditEndpoint,
  createDocumentsEndpoint,
  createHistoryEndpoint,
  createUsageEndpoint,
} from "@whisperall/api-client";
import { TOOLS, handleTool } from "./tools.js";
import type { WhisperAllApi } from "./tools.js";

// ── Config from environment ─────────────────────────────────

const baseUrl = process.env.WHISPERALL_API_URL;
const token = process.env.WHISPERALL_API_TOKEN;

if (!baseUrl) {
  process.stderr.write("Error: WHISPERALL_API_URL environment variable is required.\n");
  process.exit(1);
}
if (!token) {
  process.stderr.write("Error: WHISPERALL_API_TOKEN environment variable is required.\n");
  process.exit(1);
}

// ── Wire API client (same pattern as apps/desktop/src/lib/api.ts) ──

const client = new ApiClient({ baseUrl, token });

const api: WhisperAllApi = {
  dictate: createDictateEndpoint(client),
  live: createLiveEndpoint(client),
  transcribe: createTranscribeEndpoint(client),
  tts: createTTSEndpoint(client),
  translate: createTranslateEndpoint(client),
  aiEdit: createAiEditEndpoint(client),
  documents: createDocumentsEndpoint(client),
  history: createHistoryEndpoint(client),
  usage: createUsageEndpoint(client),
};

// ── MCP Server ──────────────────────────────────────────────

const server = new Server(
  { name: "whisperall", version: "0.0.1" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  return handleTool(name, args ?? {}, api);
});

// ── Start ───────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
process.stderr.write("WhisperAll MCP server running on stdio\n");
