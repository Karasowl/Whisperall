import { useEffect, useState } from 'react';
import type { TTSVoice } from '@whisperall/api-client';
import { api } from './api';

let cached: TTSVoice[] | null = null;
let inFlight: Promise<TTSVoice[]> | null = null;

async function fetchVoices(): Promise<TTSVoice[]> {
  if (cached) return cached;
  if (!inFlight) {
    inFlight = api.tts.voices()
      .then((res) => {
        cached = (res?.voices ?? []).filter((v): v is TTSVoice => !!v?.name);
        return cached;
      })
      .catch(() => {
        // Don't cache failures; allow retry on next open.
        return [];
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

export function useTtsVoices(): { voices: TTSVoice[]; loading: boolean } {
  const [voices, setVoices] = useState<TTSVoice[]>(cached ?? []);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    let alive = true;
    void fetchVoices().then((v) => {
      if (!alive) return;
      setVoices(v);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  return { voices, loading };
}

export function getTtsVoiceLabel(v: TTSVoice): string {
  return v.label || v.name;
}
