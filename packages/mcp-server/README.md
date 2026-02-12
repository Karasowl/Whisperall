# @whisperall/mcp-server

MCP server that exposes WhisperAll's voice AI tools to any MCP-compatible client (Claude Desktop, Cursor, Windsurf, Continue, etc.).

## Setup

```bash
# From monorepo root
pnpm install
```

## Getting Your API Key

1. Sign in at [whisperall.com/dashboard](https://whisperall.com/dashboard)
2. Scroll to **API Keys** section
3. Click **Create Key**, give it a name
4. Copy the key (starts with `wsp_live_`) — it's shown only once
5. Paste it as `WHISPERALL_API_TOKEN` in your MCP client config

All API calls made through the MCP server consume your account's usage quota.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `WHISPERALL_API_URL` | Yes | WhisperAll API base URL (e.g. `https://whisperall-api.vercel.app`) |
| `WHISPERALL_API_TOKEN` | Yes | API key from your dashboard (`wsp_live_...`) |

## Client Configuration

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "whisperall": {
      "command": "pnpm",
      "args": ["--filter", "@whisperall/mcp-server", "start"],
      "cwd": "/path/to/Whisperall",
      "env": {
        "WHISPERALL_API_TOKEN": "wsp_live_your_key_here",
        "WHISPERALL_API_URL": "https://whisperall-api.vercel.app"
      }
    }
  }
}
```

### Cursor / Windsurf / Other MCP Clients

Same config format — adjust the config file location per client.

## Available Tools (13)

### Audio / Speech
- **whisperall_dictate** — Transcribe speech from audio (OpenAI STT)
- **whisperall_live_transcribe** — Send audio chunk for live meeting transcription
- **whisperall_transcribe_url** — Transcribe audio/video from a URL with optional diarization

### Text Processing
- **whisperall_text_to_speech** — Convert text to speech (Google WaveNet)
- **whisperall_translate** — Translate text (DeepL)
- **whisperall_ai_edit** — AI text editing (clean fillers, fix grammar, summarize)

### Documents
- **whisperall_list_documents** — List all saved documents
- **whisperall_get_document** — Get a document by ID
- **whisperall_create_document** — Create a new document
- **whisperall_update_document** — Update an existing document
- **whisperall_delete_document** — Delete a document

### Info
- **whisperall_get_usage** — Current usage stats and plan limits
- **whisperall_get_history** — Recent activity across all modules

## Development

```bash
cd packages/mcp-server
pnpm test          # run tests
pnpm typecheck     # type-check
pnpm start         # run server (stdio)
```
