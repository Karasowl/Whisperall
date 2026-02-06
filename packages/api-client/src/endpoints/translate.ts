import type { ApiClient } from "../client";
import type { TranslateParams, TranslateResponse } from "../types";

export function createTranslateEndpoint(client: ApiClient) {
  return {
    async translate(params: TranslateParams): Promise<TranslateResponse> {
      return client.postJson<TranslateResponse>("/v1/translate", params);
    },
  };
}
