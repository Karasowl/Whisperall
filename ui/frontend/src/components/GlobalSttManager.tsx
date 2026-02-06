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
    const streamRef = useRef<MediaStream | null>(null);
    const startRef = useRef<number>(0);
    const chunksRef = useRef<Blob[]>([]);
    const streamActiveRef = useRef(false);
    const mimeTypeRef = useRef('audio/webm');
    const stoppingRef = useRef(false);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const rafRef = useRef<number | null>(null);

    const stopMediaStream = useCallback(() => {
        const stream = streamRef.current;
        if (!stream) return;
        try {
            stream.getTracks().forEach((track) => {
                try { track.stop(); } catch { }
            });
        } finally {
            streamRef.current = null;
        }
    }, []);

    // Load settings on mount
    useEffect(() => {
        getSTTSettings().then(setSttSettings).catch(() => { });
    }, []);

    // STOP function shared logic
    const performStop = useCallback(async () => {
        if (stoppingRef.current) return;
        if (!sessionId || !streamActiveRef.current) {
            stopMediaStream();
            return;
        }

        stoppingRef.current = true;
        streamActiveRef.current = false;

        // Always update widget/overlay state (even if overlay is hidden).
        window.electronAPI?.updateSttOverlayState?.('transcribing');

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
            window.electronAPI?.updateSttOverlayState?.('done');

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
            // If error, force reset state; hide only if overlay is enabled
            window.electronAPI?.updateSttOverlayState?.('idle');
            if (sttSettings.overlay_enabled) {
                window.electronAPI?.hideSttOverlay?.();
            }
        } finally {
            stopMediaStream();
            // Cleanup analyser + RAF
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
            if (analyserRef.current) {
                try { analyserRef.current.disconnect(); } catch { }
                analyserRef.current = null;
            }
            if (audioContextRef.current) {
                try { audioContextRef.current.close(); } catch { }
                audioContextRef.current = null;
            }
            window.electronAPI?.updateSttOverlayLevel?.(0);
            setSessionId(null);
            chunksRef.current = [];
            stoppingRef.current = false;
        }
    }, [sessionId, sttSettings, stopMediaStream]);

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
            streamRef.current = stream;

            // Audio level visualization for widget/overlay
            try {
                const audioContext = new AudioContext();
                try { await audioContext.resume(); } catch { }
                audioContextRef.current = audioContext;
                const source = audioContext.createMediaStreamSource(stream);
                const analyser = audioContext.createAnalyser();
                analyser.fftSize = 512;
                analyser.smoothingTimeConstant = 0.6;
                analyserRef.current = analyser;
                source.connect(analyser);

                const dataArray = new Uint8Array(analyser.frequencyBinCount);
                const tick = () => {
                    if (!streamActiveRef.current || !analyserRef.current) return;
                    analyser.getByteFrequencyData(dataArray);
                    let sumSquares = 0;
                    for (let i = 0; i < dataArray.length; i++) {
                        const v = dataArray[i] / 255;
                        sumSquares += v * v;
                    }
                    const rms = Math.sqrt(sumSquares / Math.max(1, dataArray.length));
                    const level = Math.min(1, rms * 1.8);
                    window.electronAPI?.updateSttOverlayLevel?.(level);
                    rafRef.current = requestAnimationFrame(tick);
                };
                rafRef.current = requestAnimationFrame(tick);
            } catch {
                // Non-blocking: visualization is optional.
            }

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
                stopMediaStream();
            };

            recorder.start(200); // Smaller chunks for responsiveness
            playActionSound('start');

            window.electronAPI?.updateSttOverlayState?.('recording');
            if (currentSettings.overlay_enabled) {
                window.electronAPI?.showSttOverlay?.();
            }
        } catch (err) {
            console.error('Failed to start global STT:', err);
            stopMediaStream();
            window.electronAPI?.hideSttOverlay?.();
        }
    }, [stopMediaStream]);

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

    useEffect(() => {
        return () => {
            stopMediaStream();
        };
    }, [stopMediaStream]);

    return null;
}
