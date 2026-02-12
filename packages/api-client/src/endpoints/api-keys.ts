import type { ApiClient } from "../client";
import type { ApiKey, CreateApiKeyParams, CreateApiKeyResponse } from "../types";

export function createApiKeysEndpoint(client: ApiClient) {
  return {
    create: (params?: CreateApiKeyParams) =>
      client.postJson<CreateApiKeyResponse>("/v1/auth/api-keys", params ?? {}),

    list: () =>
      client.get<ApiKey[]>("/v1/auth/api-keys"),

    revoke: (id: string) =>
      client.delete(`/v1/auth/api-keys/${id}`),
  };
}
