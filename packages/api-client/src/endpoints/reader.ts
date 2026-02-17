import type { ApiClient } from "../client";
import type {
  CreateReaderAnnotationParams,
  CreateReaderBookmarkParams,
  ReaderAnnotation,
  ReaderDocument,
  ReaderImportFileParams,
  ReaderImportResponse,
  ReaderImportUrlParams,
  ReaderProgress,
  ReaderProgressUpsertParams,
  ReaderBookmark,
  UpdateReaderAnnotationParams,
} from "../types";

function toBoolString(v: boolean | undefined): string {
  return v ? "true" : "false";
}

export function createReaderEndpoint(client: ApiClient) {
  return {
    async importFile(params: ReaderImportFileParams): Promise<ReaderImportResponse> {
      const form = new FormData();
      const name = params.filename || (params.file instanceof File ? params.file.name : "upload.bin");
      form.append("file", params.file, name);
      form.append("force_ocr", toBoolString(params.force_ocr));
      form.append("save", toBoolString(params.save ?? true));
      if (params.language_hint) form.append("language_hint", params.language_hint);
      return client.postFormData<ReaderImportResponse>("/v1/reader/import-file", form);
    },

    async importUrl(params: ReaderImportUrlParams): Promise<ReaderImportResponse> {
      return client.postJson<ReaderImportResponse>("/v1/reader/import-url", params);
    },

    async listDocuments(opts?: { limit?: number; cursor?: string; q?: string }): Promise<ReaderDocument[]> {
      const sp = new URLSearchParams();
      if (opts?.limit) sp.set("limit", String(opts.limit));
      if (opts?.cursor) sp.set("cursor", opts.cursor);
      if (opts?.q) sp.set("q", opts.q);
      const qs = sp.toString();
      return client.get<ReaderDocument[]>(`/v1/reader/documents${qs ? `?${qs}` : ""}`);
    },

    async upsertProgress(documentId: string, params: ReaderProgressUpsertParams): Promise<ReaderProgress> {
      return client.putJson<ReaderProgress>(`/v1/reader/progress/${documentId}`, params);
    },

    async getProgress(documentId: string): Promise<ReaderProgress> {
      return client.get<ReaderProgress>(`/v1/reader/progress/${documentId}`);
    },

    async listBookmarks(documentId: string): Promise<ReaderBookmark[]> {
      return client.get<ReaderBookmark[]>(`/v1/reader/bookmarks/${documentId}`);
    },

    async createBookmark(params: CreateReaderBookmarkParams): Promise<ReaderBookmark> {
      return client.postJson<ReaderBookmark>("/v1/reader/bookmarks", params);
    },

    async deleteBookmark(bookmarkId: string): Promise<void> {
      return client.delete(`/v1/reader/bookmarks/${bookmarkId}`);
    },

    async listAnnotations(documentId: string): Promise<ReaderAnnotation[]> {
      return client.get<ReaderAnnotation[]>(`/v1/reader/annotations/${documentId}`);
    },

    async createAnnotation(params: CreateReaderAnnotationParams): Promise<ReaderAnnotation> {
      return client.postJson<ReaderAnnotation>("/v1/reader/annotations", params);
    },

    async updateAnnotation(annotationId: string, params: UpdateReaderAnnotationParams): Promise<ReaderAnnotation> {
      return client.patchJson<ReaderAnnotation>(`/v1/reader/annotations/${annotationId}`, params);
    },

    async deleteAnnotation(annotationId: string): Promise<void> {
      return client.delete(`/v1/reader/annotations/${annotationId}`);
    },
  };
}
