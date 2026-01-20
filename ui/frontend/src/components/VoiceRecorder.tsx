'use client';

import { useState, useRef, useEffect } from 'react';
import { Mic, Square, Loader2, Clock, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SelectMenu } from '@/components/SelectMenu';

interface VoiceRecorderProps {
  onRecordingComplete: (audioBlob: Blob, duration: number) => void;
  disabled?: boolean;
}

interface AudioDevice {
  deviceId: string;
  label: string;
}

export default function VoiceRecorder({ onRecordingComplete, disabled }: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Microphone selection
  const [microphones, setMicrophones] = useState<AudioDevice[]>([]);
  const [selectedMic, setSelectedMic] = useState<string>('');
  const [showMicSelector, setShowMicSelector] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Load available microphones
  useEffect(() => {
    const loadMicrophones = async () => {
      try {
        // Request permission first to get device labels
        await navigator.mediaDevices.getUserMedia({ audio: true });

        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices
          .filter(device => device.kind === 'audioinput')
          .map(device => ({
            deviceId: device.deviceId,
            label: device.label || `Microphone ${device.deviceId.slice(0, 8)}`,
          }));

        setMicrophones(audioInputs);

        // Set default microphone
        if (audioInputs.length > 0 && !selectedMic) {
          setSelectedMic(audioInputs[0].deviceId);
        }
      } catch (err) {
        console.log('Could not enumerate devices:', err);
      }
    };

    loadMicrophones();

    // Listen for device changes
    navigator.mediaDevices.addEventListener('devicechange', loadMicrophones);
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', loadMicrophones);
    };
  }, []);

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const startRecording = async () => {
    setError(null);
    setIsPreparing(true);

    try {
      const constraints: MediaStreamConstraints = {
        audio: selectedMic ? {
          deviceId: { exact: selectedMic },
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        } : {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      // Use WAV-compatible format if available, otherwise webm
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        onRecordingComplete(blob, duration);

        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      };

      mediaRecorder.start(100); // Collect data every 100ms
      setIsRecording(true);
      setIsPreparing(false);
      setDuration(0);

      // Start timer
      timerRef.current = setInterval(() => {
        setDuration(d => d + 1);
      }, 1000);

    } catch (err: any) {
      setIsPreparing(false);
      if (err.name === 'NotAllowedError') {
        setError('Microphone access denied. Please allow microphone access in your browser.');
      } else if (err.name === 'NotFoundError') {
        setError('No microphone found. Please connect a microphone.');
      } else if (err.name === 'OverconstrainedError') {
        setError('Selected microphone not available. Please choose another.');
        setSelectedMic('');
      } else {
        setError('Failed to start recording: ' + err.message);
      }
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const selectedMicLabel = microphones.find(m => m.deviceId === selectedMic)?.label || 'Default';

  return (
    <div className="space-y-3">
      {error && (
        <div className="glass-card p-3 border-red-500/30 bg-red-500/10 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Microphone selector */}
      {microphones.length > 1 && (
        <div className="flex items-center gap-2 text-sm">
          <button
            type="button"
            onClick={() => setShowMicSelector(!showMicSelector)}
            className="flex items-center gap-1 text-slate-400 hover:text-slate-100"
          >
            <Settings className="w-4 h-4" />
            <span className="truncate max-w-[200px]">{selectedMicLabel}</span>
          </button>
        </div>
      )}

      {showMicSelector && microphones.length > 1 && (
        <div className="glass p-3 rounded-lg">
          <SelectMenu
            label="Select Microphone"
            value={selectedMic}
            options={microphones.map((mic) => ({
              value: mic.deviceId,
              label: mic.label,
            }))}
            onChange={(value) => {
              setSelectedMic(value);
              setShowMicSelector(false);
            }}
          />
        </div>
      )}

      <div className="flex items-center gap-4">
        {!isRecording ? (
          <button
            onClick={startRecording}
            disabled={disabled || isPreparing}
            className={cn(
              "btn btn-primary",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            {isPreparing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Preparing...
              </>
            ) : (
              <>
                <Mic className="w-5 h-5" />
                Start Recording
              </>
            )}
          </button>
        ) : (
          <button
            onClick={stopRecording}
            className="btn btn-secondary"
          >
            <Square className="w-5 h-5 fill-current" />
            Stop Recording
          </button>
        )}

        {isRecording && (
          <div className="flex items-center gap-2 text-red-600">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
            </span>
            <Clock className="w-4 h-4" />
            <span className="font-mono text-lg">{formatDuration(duration)}</span>
          </div>
        )}
      </div>

      {isRecording && (
        <p className="text-sm text-slate-400">
          Recording... Speak clearly into your microphone.
        </p>
      )}

      {!isRecording && (
        <p className="text-xs text-slate-400">
          Record 5-15 seconds of clear speech for best voice cloning results.
        </p>
      )}
    </div>
  );
}
