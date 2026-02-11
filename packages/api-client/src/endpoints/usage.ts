import type { ApiClient } from "../client";
import type { UsageResponse } from "../types";

export function createUsageEndpoint(client: ApiClient) {
  return {
    get: () => client.get<UsageResponse>("/v1/usage"),
  };
}
