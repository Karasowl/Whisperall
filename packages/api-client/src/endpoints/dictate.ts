import type { ApiClient } from "../client";
import type { DictateParams, DictateResponse } from "../types";

export function createDictateEndpoint(client: ApiClient) {
  return {
    async send(params: DictateParams): Promise<DictateResponse> {
      const form = new FormData();
      const ext = params.audio.type?.includes("webm") ? "webm" : "wav";
      form.append("audio", params.audio, `audio.${ext}`);
      if (params.session_id) form.append("session_id", params.session_id);
      if (params.is_final !== undefined) form.append("is_final", String(params.is_final));
      if (params.language) form.append("language", params.language);
      if (params.prompt) form.append("prompt", params.prompt);
      return client.postFormData<DictateResponse>("/v1/dictate", form);
    },
  };
}
