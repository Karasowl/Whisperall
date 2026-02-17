import type { ApiClient } from "../client";
import type { Folder, CreateFolderParams, UpdateFolderParams } from "../types";

export function createFoldersEndpoint(client: ApiClient) {
  return {
    list: () => client.get<Folder[]>("/v1/folders"),
    create: (params: CreateFolderParams) => client.postJson<Folder>("/v1/folders", params),
    update: (id: string, params: UpdateFolderParams) => client.putJson<Folder>(`/v1/folders/${id}`, params),
    delete: (id: string) => client.delete(`/v1/folders/${id}`),
  };
}
