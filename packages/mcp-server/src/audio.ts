/** Convert a base64-encoded audio string to a Blob for the api-client. */
export function base64ToBlob(b64: string, mime = "audio/webm"): Blob {
  // Strip optional data-URL prefix (e.g. "data:audio/webm;base64,")
  const raw = b64.includes(",") ? b64.split(",")[1] : b64;
  const bytes = Buffer.from(raw, "base64");
  return new Blob([bytes], { type: mime });
}
