import type { ApiClient } from "../client";
import type { HistoryEntry } from "../types";

export function createHistoryEndpoint(client: ApiClient) {
  return {
    list: (limit = 50) => client.get<HistoryEntry[]>(`/v1/history?limit=${limit}`),
  };
}
