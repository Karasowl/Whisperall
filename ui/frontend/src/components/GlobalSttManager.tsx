'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
    startStt,
    stopStt,
    cancelStt,
    finalizeStt,
    partialStt,
    getSTTSettings,
    STTSettings,
    getProviderSelection,
    ServiceProviderInfo,
} from '@/lib/api';
import { playActionSound } from '@/lib/actionSounds';
import { setLastSttTranscript } from '@/lib/sttHelper';

export function GlobalSttManager() {
    const pathname = usePathname();
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [sttSettings, setSttSettings] = useState<STTSettings>({
        auto_punctuation: true,
        filler_removal: true,
        backtrack: true,
        smart_formatting: true,
        language: 'auto',
        transcription_mode: 'final',
        hotkey_mode: 'toggle',
        auto_paste: false,
        overlay_enabled: true,
    });

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const startRef = useRef<number>(0);
    const chunksRef = useRef<Blob[]>([]);
    const streamActiveRef = useRef(false);
    const mimeTypeRef = useRef('audio/webm');

    // Load settings on mount
    useEffect(() => {
        getSTTSettings().then(setSttSettings).catch(() => { });
    }, []);

    // STOP function shared logic
    const performStop = useCallback(async () => {
        if (!sessionId) return;
        if (!streamActiveRef.current) return;

        // Stop recorder
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
        }
        streamActiveRef.current = false;

        // Show Transcribing state
        if (sttSettings.overlay_enabled) {
            window.electronAPI?.updateSttOverlayState?.('transcribing');
        }

        try {
            const mimeType = mimeTypeRef.current;
            let result;

            // Finalize
            if (sttSettings.transcription_mode === 'live') {
                result = await finalizeStt(sessionId);
            } else {
                const blob = new Blob(chunksRef.current, { type: mimeType });
                result = await stopStt(sessionId, blob, sttSettings.language || 'auto');
            }

            setLastSttTranscript(result.text);
            window.electronAPI?.setLastSttTranscript?.(result.text);

            // Show Done state (with Undo)
            if (sttSettings.overlay_enabled) {
                window.electronAPI?.updateSttOverlayState?.('done');
            }

            // Hide after a moment (handled by widget logic, but we enforce cleanup)
            // Actually widget handles timeout for IDLE.

            // PASTE LOGIC
            // Important: Release focus from widget before pasting!
            // 'done' state keeps widget visible/focused?
            // Wait, 'done' state is just visual. The user might want to interact.
            // If auto_paste is on, we MUST paste.
            if (result.text) {
                // If auto_paste is true, the Main process handles pasting via 'stt-paste'
                // We can trigger it here manually if needed, or rely on 'result' return.
                // But main.js doesn't auto-paste unless we tell it.
                // page.tsx logic: window.electronAPI?.pasteLastTranscript?.(result.text);
                if (sttSettings.auto_paste) {
                    // Hide to return focus
                    window.electronAPI?.hideSttOverlay?.();
                    // Delay paste
                    setTimeout(() => {
                        window.electronAPI?.pasteLastTranscript?.(result.text);
                    }, 100);
                }
            }

            playActionSound('complete');
        } catch (err) {
            console.error('Global STT Error:', err);
            // If error, force hide
            window.electronAPI?.hideSttOverlay?.();
        } finally {
            setSessionId(null);
            chunksRef.current = [];
        }
    }, [sessionId, sttSettings]);

    const startRecording = useCallback(async () => {
        try {
            // Refresh settings
            const currentSettings = await getSTTSettings();
            setSttSettings(currentSettings);

            const session = await startStt(currentSettings.language || 'auto');
            setSessionId(session.session_id);

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';

            const recorder = new MediaRecorder(stream, { mimeType });
            mediaRecorderRef.current = recorder;
            chunksRef.current = [];
            mimeTypeRef.current = mimeType;
            streamActiveRef.current = true;

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data);
            };

            recorder.onstop = () => {
                stream.getTracks().forEach(t => t.stop());
            };

            recorder.start(1000);
            playActionSound('start');

            if (currentSettings.overlay_enabled) {
                window.electronAPI?.showSttOverlay?.();
                window.electronAPI?.updateSttOverlayState?.('recording');
            }
        } catch (err) {
            console.error('Failed to start global STT:', err);
            window.electronAPI?.hideSttOverlay?.();
        }
    }, []);

    useEffect(() => {
        // If on /dictate page, do NOT listen to global hotkeys to avoid conflict
        if (pathname === '/dictate') return;

        const handleHotkey = (e: Event) => {
            const action = (e as CustomEvent).detail;

            if (action === 'dictate-toggle') {
                if (streamActiveRef.current) {
                    performStop();
                } else {
                    startRecording();
                }
            } else if (action === 'dictate-start') {
                if (!streamActiveRef.current) startRecording();
            } else if (action === 'dictate-stop') {
                if (streamActiveRef.current) performStop();
            }
        };

        window.addEventListener('hotkey-action', handleHotkey as EventListener);
        return () => window.removeEventListener('hotkey-action', handleHotkey as EventListener);
    }, [pathname, startRecording, performStop]);

    return null;
}
