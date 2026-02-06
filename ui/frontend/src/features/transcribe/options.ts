import type { DiarizationMode } from '@/lib/api';
import type { DiarizationDevice, DiarizationSafetyMode } from './types';

export const LANGUAGE_OPTIONS = [
  { value: 'auto', label: 'Auto-detect' },
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'it', label: 'Italian' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'ru', label: 'Russian' },
  { value: 'zh', label: 'Chinese' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'ar', label: 'Arabic' },
  { value: 'hi', label: 'Hindi' },
];

export const WHISPER_MODEL_OPTIONS = [
  { value: 'tiny', label: 'Tiny', description: 'Fastest, less accurate' },
  { value: 'base', label: 'Base', description: 'Good balance' },
  { value: 'small', label: 'Small', description: 'Better accuracy' },
  { value: 'medium', label: 'Medium', description: 'High accuracy' },
  { value: 'large-v3', label: 'Large V3', description: 'Best accuracy' },
  { value: 'distil-large-v3', label: 'Distil Large V3', description: 'Near-large accuracy, faster' },
];

export const DIARIZATION_MODE_OPTIONS: { value: DiarizationMode; label: string; description: string }[] = [
  {
    value: 'auto',
    label: 'Auto',
    description: 'Prefer AI if available, otherwise use basic clustering',
  },
  {
    value: 'pyannote',
    label: 'AI (pyannote)',
    description: 'Best accuracy, requires HuggingFace access',
  },
  {
    value: 'basic',
    label: 'Basic',
    description: 'No HuggingFace token required',
  },
];

export const SAFETY_MODE_OPTIONS: { value: DiarizationSafetyMode; label: string; description: string }[] = [
  { value: 'safe', label: 'Laptop-safe', description: 'Cooler, slower, lower spikes' },
  { value: 'balanced', label: 'Balanced', description: 'Moderate load and speed' },
  { value: 'performance', label: 'Performance', description: 'Fastest, hottest' },
];

export const SAFETY_DEVICE_OPTIONS: { value: DiarizationDevice; label: string; description: string }[] = [
  { value: 'cpu', label: 'CPU only', description: 'Lowest GPU heat' },
  { value: 'gpu', label: 'GPU', description: 'Faster, hotter' },
  { value: 'auto', label: 'Auto', description: 'Let backend decide' },
];

export const PREVIEW_SEGMENT_LIMIT = 200;

