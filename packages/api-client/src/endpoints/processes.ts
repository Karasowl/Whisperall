import type { ApiClient } from "../client";
import type { ListProcessesParams, ProcessRecord, UpdateProcessParams, UpsertProcessParams } from "../types";

export function createProcessesEndpoint(client: ApiClient) {
  return {
    list: (params: ListProcessesParams = {}) => {
      const query = new URLSearchParams();
      if (params.status) query.set("status", params.status);
      if (params.process_type) query.set("process_type", params.process_type);
      if (params.document_id) query.set("document_id", params.document_id);
      if (params.limit != null) query.set("limit", String(params.limit));
      const suffix = query.toString();
      return client.get<ProcessRecord[]>(`/v1/processes${suffix ? `?${suffix}` : ""}`);
    },
    get: (id: string) => client.get<ProcessRecord>(`/v1/processes/${id}`),
    upsert: (id: string, params: UpsertProcessParams) => client.putJson<ProcessRecord>(`/v1/processes/${id}`, params),
    update: (id: string, params: UpdateProcessParams) => client.patchJson<ProcessRecord>(`/v1/processes/${id}`, params),
    delete: (id: string) => client.delete(`/v1/processes/${id}`),
  };
}
