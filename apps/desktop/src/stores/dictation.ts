import { create } from 'zustand';
import { api } from '../lib/api';
import { getMicStream, stopMicStream, forceReleaseMic, isMicActive, createLiveRecorder, type LiveRecorder } from '../lib/audio';
import { electron } from '../lib/electron';
import { useSettingsStore } from './settings';
import { requestPlanRefresh } from './plan';
import { useActionsStore, endAction } from './actions';

export type DictationStatus = 'idle' | 'recording' | 'processing' | 'done' | 'error';

export type DictationState = {
  status: DictationStatus;
  text: string;
  translatedText: string;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
  reset: () => void;
  setText: (text: string) => void;
};

const FLUSH_MS = 30_000;
const ACTION_ID = 'dictation.mic';
let liveRec: LiveRecorder | null = null;
let pendingFlushes = 0;
// Guards against rapid-toggle races where stop() fires before start()'s
// getMicStream resolves, leaving the mic orphaned.
let startInFlight = false;
let pendingAbort = false;

export const useDictationStore = create<DictationState>((set, get) => ({
  status: 'idle',
  text: '',
  translatedText: '',
  error: null,

  start: async () => {
    if (get().status === 'recording') return;
    if (startInFlight) { pendingAbort = true; return; }
    startInFlight = true;
    pendingAbort = false;
    try {
      // B1 fix — always clear prior result before a new cycle so we never
      // re-paste / re-insert text from a previous session.
      pendingFlushes = 0;
      set({ status: 'recording', text: '', translatedText: '', error: null });
      electron?.setDictationText('');

      // Register in the Action System so there's always a visible stop/cancel
      // control, regardless of which page the user is on.
      useActionsStore.getState().register({
        id: ACTION_ID,
        kind: 'mic',
        status: 'starting',
        label: 'Recording dictation',
        canPause: false, canResume: false, canStop: true, canCancel: true,
        stop: () => { useDictationStore.getState().stop(); },
        cancel: () => { useDictationStore.getState().reset(); endAction(ACTION_ID, 'canceled'); },
      });

      const deviceId = useSettingsStore.getState().audioDevice;
      const stream = await getMicStream(deviceId);
      if (pendingAbort) {
        // User toggled off while getUserMedia was resolving — release and bail.
        stream.getTracks().forEach((t) => { try { t.stop(); } catch { /* ignore */ } });
        forceReleaseMic();
        set({ status: 'idle' });
        useActionsStore.getState().remove(ACTION_ID);
        return;
      }
      useActionsStore.getState().update(ACTION_ID, { status: 'running' });

      liveRec = createLiveRecorder(stream, async (blob) => {
        // Auto-flush: send each 30s chunk to API while recording continues
        pendingFlushes++;
        try {
          const prompt = get().text.slice(-200);
          const res = await api.dictate.send({ audio: blob, prompt: prompt || undefined });
          const chunkText = (res.text ?? '').trim();
          // B1 guard — silent/empty chunk must not mutate text or re-emit paste cache.
          if (!chunkText) {
            return;
          }
          const newText = get().text + (get().text ? ' ' : '') + chunkText;
          requestPlanRefresh();

          let translated = '';
          const { translateEnabled, translateTo } = useSettingsStore.getState();
          if (translateEnabled && translateTo) {
            try {
              const tr = await api.translate.translate({ text: chunkText, target_language: translateTo });
              translated = get().translatedText + (get().translatedText ? ' ' : '') + tr.text;
              requestPlanRefresh();
            } catch { /* best-effort */ }
          }

          set({ text: newText, translatedText: translated || get().translatedText });
          electron?.setDictationText(newText);
          useActionsStore.getState().update(ACTION_ID, {
            preview: { text: newText.slice(-160) },
          });
        } catch (err) {
          console.warn('[dictation] flush error:', (err as Error).message);
          set({ error: (err as Error).message });
        } finally {
          pendingFlushes--;
          if (get().status === 'processing' && pendingFlushes <= 0) {
            set({ status: 'done' });
            endAction(ACTION_ID, 'completed');
          }
        }
      }, FLUSH_MS);
    } catch (err) {
      // Any failure must release the mic so Bluetooth can switch back to A2DP.
      forceReleaseMic();
      set({ status: 'error', error: (err as Error).message });
      endAction(ACTION_ID, 'failed', (err as Error).message);
    } finally {
      startInFlight = false;
      pendingAbort = false;
    }
  },

  stop: () => {
    // If a start is still racing, flag it for abort so the start path releases
    // the mic as soon as getUserMedia resolves.
    if (startInFlight) {
      pendingAbort = true;
      return;
    }
    if (!liveRec) {
      // Not actually recording — force clean idle + safety net for any
      // orphaned mic (e.g. stream acquired but recorder creation failed).
      if (isMicActive()) forceReleaseMic();
      set({ status: 'idle' });
      endAction(ACTION_ID, 'canceled');
      return;
    }
    liveRec.stop(); // triggers final chunk via onstop
    liveRec = null;
    forceReleaseMic();
    set({ status: 'processing' });
    useActionsStore.getState().update(ACTION_ID, { status: 'finishing', canStop: false, canCancel: false });
    // Safety: if no final chunk arrives (empty recording), force done and
    // ensure main-process paste cache matches current state (avoids repaste).
    setTimeout(() => {
      if (get().status === 'processing') {
        set({ status: 'done' });
        if (!get().text) electron?.setDictationText('');
        endAction(ACTION_ID, 'completed');
      }
    }, 3000);
  },

  reset: () => {
    pendingAbort = true; // abort any in-flight start.
    if (liveRec) { try { liveRec.stop(); } catch { /* ignore */ } liveRec = null; }
    pendingFlushes = 0;
    forceReleaseMic();
    set({ status: 'idle', text: '', translatedText: '', error: null });
    electron?.setDictationText('');
    useActionsStore.getState().remove(ACTION_ID);
  },

  setText: (text) => set({ text }),
}));
