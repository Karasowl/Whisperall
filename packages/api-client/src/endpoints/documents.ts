import type { ApiClient } from "../client";
import type {
  DocumentDebateSearchResponse,
  DocumentDebateStateResponse,
  CreateDocumentParams,
  CreateDocumentTranscriptionParams,
  Document,
  DocumentTranscriptionEntry,
  UpsertDocumentDebateStateParams,
  UpdateDocumentParams,
} from "../types";

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
    listTranscriptions: (documentId: string, blockId?: string) =>
      client.get<DocumentTranscriptionEntry[]>(
        `/v1/documents/${documentId}/transcriptions${blockId ? `?block_id=${encodeURIComponent(blockId)}` : ''}`,
      ),
    createTranscription: (documentId: string, params: CreateDocumentTranscriptionParams) =>
      client.postJson<DocumentTranscriptionEntry>(`/v1/documents/${documentId}/transcriptions`, params),
    deleteTranscription: (documentId: string, entryId: string) =>
      client.delete(`/v1/documents/${documentId}/transcriptions/${entryId}`),
    getDebateState: (documentId: string) =>
      client.get<DocumentDebateStateResponse>(`/v1/documents/${documentId}/debate-state`),
    upsertDebateState: (documentId: string, params: UpsertDocumentDebateStateParams) =>
      client.putJson<DocumentDebateStateResponse>(`/v1/documents/${documentId}/debate-state`, params),
    searchDebateWeb: (documentId: string, query: string, limit = 6) =>
      client.postJson<DocumentDebateSearchResponse>(`/v1/documents/${documentId}/debate/web-search`, { query, limit }),
  };
}
