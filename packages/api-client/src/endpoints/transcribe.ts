import type { ApiClient } from "../client";
import type {
  TranscribeJobParams,
  TranscribeChunkParams,
  TranscribeRunParams,
  TranscribeJobResponse,
  TranscribeResultResponse,
} from "../types";

export function createTranscribeEndpoint(client: ApiClient) {
  return {
    async createJob(params: TranscribeJobParams): Promise<TranscribeJobResponse> {
      return client.postJson<TranscribeJobResponse>("/v1/transcribe/jobs", params);
    },

    async registerChunk(jobId: string, params: TranscribeChunkParams): Promise<{ ok: boolean }> {
      return client.postJson<{ ok: boolean }>(`/v1/transcribe/jobs/${jobId}/chunks`, params);
    },

    async run(jobId: string, params?: TranscribeRunParams): Promise<TranscribeJobResponse> {
      return client.postJson<TranscribeJobResponse>(`/v1/transcribe/jobs/${jobId}/run`, params ?? {});
    },

    async getJob(jobId: string): Promise<TranscribeJobResponse> {
      return client.get<TranscribeJobResponse>(`/v1/transcribe/jobs/${jobId}`);
    },

    async getResult(jobId: string): Promise<TranscribeResultResponse> {
      return client.get<TranscribeResultResponse>(`/v1/transcribe/jobs/${jobId}/result`);
    },
  };
}
