import type { ApiClient } from "../client";
import type { LiveChunkParams, LiveChunkResponse } from "../types";

export function createLiveEndpoint(client: ApiClient) {
  return {
    async sendChunk(params: LiveChunkParams): Promise<LiveChunkResponse> {
      const form = new FormData();
      const ext = params.audio.type?.includes("webm") ? "webm" : "wav";
      form.append("audio", params.audio, `audio.${ext}`);
      if (params.session_id) form.append("session_id", params.session_id);
      if (params.chunk_index !== undefined) form.append("chunk_index", String(params.chunk_index));
      if (params.translate_to) form.append("translate_to", params.translate_to);
      return client.postFormData<LiveChunkResponse>("/v1/live/chunk", form);
    },
  };
}
