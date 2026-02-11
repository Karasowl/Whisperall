import {
  ApiClient,
  createDictateEndpoint,
  createLiveEndpoint,
  createTranscribeEndpoint,
  createTTSEndpoint,
  createTranslateEndpoint,
  createAiEditEndpoint,
  createDocumentsEndpoint,
  createHistoryEndpoint,
  createUsageEndpoint,
} from '@whisperall/api-client';
import { getSupabase } from './supabase';

const API_URL = (import.meta.env.VITE_API_URL as string) || 'http://127.0.0.1:8080';

const client = new ApiClient({
  baseUrl: API_URL,
  tokenProvider: async () => {
    const sb = getSupabase();
    if (!sb) return undefined;
    try {
      const { data } = await sb.auth.getSession();
      const session = data.session;
      if (!session) return undefined;

      const nowSec = Math.floor(Date.now() / 1000);
      const expiresAt = session.expires_at ?? 0;
      if (expiresAt > 0 && expiresAt - nowSec <= 60) {
        const { data: refreshed, error } = await sb.auth.refreshSession();
        if (error) return undefined;
        return refreshed.session?.access_token;
      }

      return session.access_token;
    } catch {
      return undefined;
    }
  },
});

export function setApiToken(token: string | undefined): void {
  client.setToken(token);
}

export const api = {
  dictate: createDictateEndpoint(client),
  live: createLiveEndpoint(client),
  transcribe: createTranscribeEndpoint(client),
  tts: createTTSEndpoint(client),
  translate: createTranslateEndpoint(client),
  aiEdit: createAiEditEndpoint(client),
  documents: createDocumentsEndpoint(client),
  history: createHistoryEndpoint(client),
  usage: createUsageEndpoint(client),
};
