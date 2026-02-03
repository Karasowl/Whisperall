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

        streamActiveRef.current = false;

        // Show Transcribing state
        if (sttSettings.overlay_enabled) {
            window.electronAPI?.updateSttOverlayState?.('transcribing');
        }

        try {
            const mimeType = mimeTypeRef.current;
            let audioBlob: Blob;

            // Wait for MediaRecorder to stop and collect all chunks
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                audioBlob = await new Promise<Blob>((resolve) => {
                    const recorder = mediaRecorderRef.current!;

                    // Capture any remaining data
                    const originalOnDataAvailable = recorder.ondataavailable;
                    recorder.ondataavailable = (e) => {
                        if (e.data.size > 0) chunksRef.current.push(e.data);
                        if (originalOnDataAvailable) originalOnDataAvailable.call(recorder, e);
                    };

                    recorder.onstop = () => {
                        // Now all chunks are collected
                        const blob = new Blob(chunksRef.current, { type: mimeType });
                        const durationMs = startRef.current ? Date.now() - startRef.current : 0;
                        const totalSize = chunksRef.current.reduce((sum, chunk) => sum + chunk.size, 0);
                        console.log('[STT] Created audio blob:', blob.size, 'bytes from', chunksRef.current.length, 'chunks');
                        console.log('[STT] Chunk total size:', totalSize, 'bytes', 'Duration(ms):', durationMs);
                        resolve(blob);
                    };

                    recorder.stop();
                });
            } else {
                // Recorder already stopped, use whatever chunks we have
                audioBlob = new Blob(chunksRef.current, { type: mimeType });
            }

            let result;

            // Use a Promise race to prevent hanging indefinitely
            const sttPromise = (async () => {
                if (sttSettings.transcription_mode === 'live') {
                    return await finalizeStt(sessionId);
                } else {
                    return await stopStt(sessionId, audioBlob, sttSettings.language || 'auto');
                }
            })();

            // 60 second timeout for transcription
            const timeoutPromise = new Promise<{ text: string, raw_text?: string }>((_, reject) => {
                setTimeout(() => reject(new Error('Transcription request timed out')), 60000);
            });

            result = await Promise.race([sttPromise, timeoutPromise]);

            // DEBUG: Log the transcription result
            console.log('[STT] Transcription result:', result);
            console.log('[STT] Text received:', result.text);
            if ('meta' in result && result.meta) {
                console.log('[STT] Provider meta:', result.meta);
            }

            if (!result.text || result.text.trim() === '') {
                console.warn('[STT] Warning: Transcription returned empty text!');
            }

            setLastSttTranscript(result.text);

            // Verify Electron API is available
            console.log('[STT] Electron API available:', !!window.electronAPI);
            console.log('[STT] setLastSttTranscript available:', !!window.electronAPI?.setLastSttTranscript);

            window.electronAPI?.setLastSttTranscript?.(result.text);

            // Show Done state
            if (sttSettings.overlay_enabled) {
                window.electronAPI?.updateSttOverlayState?.('done');
            }

            // PASTE LOGIC
            if (result.text) {
                console.log('[STT] Auto-paste enabled:', sttSettings.auto_paste);
                if (sttSettings.auto_paste) {
                    // Hide to return focus
                    window.electronAPI?.hideSttOverlay?.();

                    // Force reset state to idle when hiding so it's clean next time
                    window.electronAPI?.updateSttOverlayState?.('idle');

                    // Delay paste to allow focus to return to previous window
                    setTimeout(() => {
                        window.electronAPI?.pasteLastTranscript?.(result.text);
                    }, 300);
                }
            }

            playActionSound('complete');
        } catch (err) {
            console.error('Global STT Error:', err);
            // If error, force hide and reset state
            window.electronAPI?.updateSttOverlayState?.('idle');
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

            // Request high quality audio
            // Use configured device ID if available
            const audioConstraints: MediaTrackConstraints = {
                channelCount: 1,
                sampleRate: 48000,
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            };

            if (currentSettings.input_device_id && currentSettings.input_device_id !== 'default') {
                audioConstraints.deviceId = { exact: currentSettings.input_device_id };
            }

            const stream = await navigator.mediaDevices.getUserMedia({
                audio: audioConstraints
            });

            // Prefer opus
            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                ? 'audio/webm;codecs=opus'
                : 'audio/webm';

            // High bitrate for better quality
            const options = {
                mimeType,
                audioBitsPerSecond: 128000
            };

            const recorder = new MediaRecorder(stream, options);
            mediaRecorderRef.current = recorder;
            chunksRef.current = [];
            mimeTypeRef.current = mimeType;
            streamActiveRef.current = true;
            startRef.current = Date.now();

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data);
            };

            recorder.onstop = () => {
                stream.getTracks().forEach(t => t.stop());
            };

            recorder.start(200); // Smaller chunks for responsiveness
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
