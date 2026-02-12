import { ApiError } from "@whisperall/api-client";

export type McpErrorResult = {
  content: Array<{ type: "text"; text: string }>;
  isError: true;
};

/** Format any thrown error into an MCP-friendly tool result. */
export function formatError(e: unknown): McpErrorResult {
  let msg: string;

  if (e instanceof ApiError) {
    const status = e.status;
    if (status === 401) msg = "Authentication failed — token expired or invalid.";
    else if (status === 403) msg = "Forbidden — insufficient permissions.";
    else if (status === 429) msg = "Rate limit or plan quota exceeded.";
    else msg = `API error ${status}: ${e.message}`;
  } else if (e instanceof TypeError) {
    msg = `Invalid input: ${e.message}`;
  } else {
    msg = String(e);
  }

  return { content: [{ type: "text", text: msg }], isError: true };
}
