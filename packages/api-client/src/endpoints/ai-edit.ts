import type { ApiClient } from "../client";
import type { AiEditParams, AiEditResponse } from "../types";

export function createAiEditEndpoint(client: ApiClient) {
  return {
    async edit(params: AiEditParams): Promise<AiEditResponse> {
      return client.postJson<AiEditResponse>("/v1/ai-edit", params);
    },
  };
}
