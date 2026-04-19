import type { ApiClient, RequestOpts } from "../client";
import type {
  TranscribeJobParams,
  TranscribeChunkParams,
  TranscribeRunParams,
  TranscribeUrlParams,
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

    async fromUrl(params: TranscribeUrlParams, opts?: RequestOpts): Promise<TranscribeResultResponse> {
      return client.postJson<TranscribeResultResponse>("/v1/transcribe/from-url", params, opts);
    },

    /**
     * Chunked URL transcription (Option B). Server downloads the media,
     * transcodes + splits with ffmpeg, uploads chunks, and creates a
     * `transcribe_jobs` row. Client then runs the same `/jobs/:id/run`
     * batch loop as the file upload flow — no more single-blob 25 MB cap
     * or provider timeout for long videos.
     */
    async fromUrlAsJob(params: TranscribeUrlParams, opts?: RequestOpts): Promise<TranscribeJobResponse> {
      return client.postJson<TranscribeJobResponse>("/v1/transcribe/from-url-job", params, opts);
    },
  };
}
