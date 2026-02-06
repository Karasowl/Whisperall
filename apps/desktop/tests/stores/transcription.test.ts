import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/lib/api', () => ({
  api: {
    transcribe: {
      createJob: vi.fn(),
      getJob: vi.fn(),
      getResult: vi.fn(),
    },
  },
}));

vi.mock('../../src/lib/supabase', () => ({
  getSupabase: vi.fn().mockReturnValue(null),
}));

import { useTranscriptionStore } from '../../src/stores/transcription';
import { api } from '../../src/lib/api';

const mockCreateJob = vi.mocked(api.transcribe.createJob);
const mockGetJob = vi.mocked(api.transcribe.getJob);
const mockGetResult = vi.mocked(api.transcribe.getResult);

describe('Transcription store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTranscriptionStore.setState({
      jobs: [],
      activeJobId: null,
      segments: [],
      fullText: '',
      loading: false,
      error: null,
    });
  });

  it('starts with empty state', () => {
    const state = useTranscriptionStore.getState();
    expect(state.jobs).toHaveLength(0);
    expect(state.activeJobId).toBeNull();
    expect(state.loading).toBe(false);
  });

  it('createJob adds a job to the list', async () => {
    mockCreateJob.mockResolvedValue({
      id: 'job-1',
      status: 'pending',
      processed_chunks: 0,
      total_chunks: 1,
    });

    const file = new File(['audio'], 'test.wav', { type: 'audio/wav' });
    await useTranscriptionStore.getState().createJob(file);

    const state = useTranscriptionStore.getState();
    expect(state.jobs).toHaveLength(1);
    expect(state.jobs[0].id).toBe('job-1');
    expect(state.jobs[0].filename).toBe('test.wav');
    expect(state.activeJobId).toBe('job-1');
    expect(state.loading).toBe(false);
  });

  it('createJob sets error on failure', async () => {
    mockCreateJob.mockRejectedValue(new Error('API error: 500'));

    const file = new File(['audio'], 'test.wav', { type: 'audio/wav' });
    await useTranscriptionStore.getState().createJob(file);

    expect(useTranscriptionStore.getState().error).toBe('API error: 500');
    expect(useTranscriptionStore.getState().loading).toBe(false);
  });

  it('pollJob updates job status', async () => {
    useTranscriptionStore.setState({
      jobs: [{ id: 'job-1', status: 'pending', processed_chunks: 0, total_chunks: 3 }],
    });

    mockGetJob.mockResolvedValue({
      id: 'job-1',
      status: 'processing',
      processed_chunks: 2,
      total_chunks: 3,
    });

    await useTranscriptionStore.getState().pollJob('job-1');

    const job = useTranscriptionStore.getState().jobs[0];
    expect(job.status).toBe('processing');
    expect(job.processed_chunks).toBe(2);
  });

  it('pollJob auto-loads result when completed', async () => {
    useTranscriptionStore.setState({
      jobs: [{ id: 'job-1', status: 'processing', processed_chunks: 2, total_chunks: 3 }],
    });

    mockGetJob.mockResolvedValue({
      id: 'job-1',
      status: 'completed',
      processed_chunks: 3,
      total_chunks: 3,
    });

    mockGetResult.mockResolvedValue({
      text: 'full transcript',
      segments: [{ start: 0, end: 1, text: 'full', speaker: 'A' }],
    });

    await useTranscriptionStore.getState().pollJob('job-1');

    expect(useTranscriptionStore.getState().fullText).toBe('full transcript');
    expect(useTranscriptionStore.getState().segments).toHaveLength(1);
  });

  it('setActiveJob updates activeJobId', () => {
    useTranscriptionStore.getState().setActiveJob('job-2');
    expect(useTranscriptionStore.getState().activeJobId).toBe('job-2');
  });

  it('reset clears all state', () => {
    useTranscriptionStore.setState({
      jobs: [{ id: 'j1', status: 'completed', processed_chunks: 1, total_chunks: 1 }],
      activeJobId: 'j1',
      fullText: 'text',
      segments: [{ start: 0, end: 1, text: 'a' }],
    });

    useTranscriptionStore.getState().reset();

    const state = useTranscriptionStore.getState();
    expect(state.jobs).toHaveLength(0);
    expect(state.activeJobId).toBeNull();
    expect(state.fullText).toBe('');
  });

  it('subscribeToRealtime returns noop when supabase not configured', () => {
    const unsub = useTranscriptionStore.getState().subscribeToRealtime();
    expect(typeof unsub).toBe('function');
    unsub(); // should not throw
  });

  it('pollJob sets error on failure', async () => {
    useTranscriptionStore.setState({
      jobs: [{ id: 'job-1', status: 'processing', processed_chunks: 1, total_chunks: 3 }],
    });

    mockGetJob.mockRejectedValue(new Error('Connection refused'));

    await useTranscriptionStore.getState().pollJob('job-1');

    expect(useTranscriptionStore.getState().error).toBe('Connection refused');
  });

  it('loadResult sets error on failure', async () => {
    mockGetResult.mockRejectedValue(new Error('Not found'));

    await useTranscriptionStore.getState().loadResult('job-1');

    expect(useTranscriptionStore.getState().error).toBe('Not found');
  });
});
