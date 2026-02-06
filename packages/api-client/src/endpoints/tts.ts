import type { ApiClient } from "../client";
import type { TTSParams, TTSResponse } from "../types";

export function createTTSEndpoint(client: ApiClient) {
  return {
    async synthesize(params: TTSParams): Promise<TTSResponse> {
      return client.postJson<TTSResponse>("/v1/tts", params);
    },
  };
}
