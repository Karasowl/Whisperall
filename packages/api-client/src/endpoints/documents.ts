import type { ApiClient } from "../client";
import type { Document, CreateDocumentParams, UpdateDocumentParams } from "../types";

export function createDocumentsEndpoint(client: ApiClient) {
  return {
    list: (folderId?: string) => {
      const q = folderId ? `?folder_id=${encodeURIComponent(folderId)}` : "";
      return client.get<Document[]>(`/v1/documents${q}`);
    },
    get: (id: string) => client.get<Document>(`/v1/documents/${id}`),
    create: (params: CreateDocumentParams) => client.postJson<Document>("/v1/documents", params),
    update: (id: string, params: UpdateDocumentParams) => client.putJson<Document>(`/v1/documents/${id}`, params),
    delete: (id: string) => client.delete(`/v1/documents/${id}`),
  };
}
