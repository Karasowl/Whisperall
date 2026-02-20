import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockCreateDocument } = vi.hoisted(() => ({
  mockCreateDocument: vi.fn().mockResolvedValue({ id: 'doc-1' }),
}));

vi.mock('../../src/lib/api', () => ({
  api: {
    transcribe: {
      createJob: vi.fn(),
      registerChunk: vi.fn().mockResolvedValue({ ok: true }),
      run: vi.fn().mockResolvedValue({ id: 'job-1', status: 'completed', processed_chunks: 2, total_chunks: 2 }),
      getJob: vi.fn(),
      getResult: vi.fn(),
    },
  },
}));

vi.mock('../../src/lib/audio', () => ({
  splitFileIntoChunkParts: vi.fn(),
  getMicStream: vi.fn(),
  stopMicStream: vi.fn(),
  createRecorder: vi.fn(),
}));

vi.mock('../../src/stores/documents', () => ({
  useDocumentsStore: {
    getState: vi.fn(() => ({ createDocument: mockCreateDocument })),
  },
}));

vi.mock('../../src/stores/auth', () => ({
  useAuthStore: {
    getState: vi.fn(() => ({ user: { id: 'user-123' }, session: null })),
  },
}));

const mockUpload = vi.fn().mockResolvedValue({ error: null });
vi.mock('../../src/lib/supabase', () => ({
  getSupabase: vi.fn().mockReturnValue({
    storage: { from: () => ({ upload: mockUpload, getPublicUrl: () => ({ data: { publicUrl: 'https://example.com/original.wav' } }) }) },
    channel: () => ({ on: () => ({ subscribe: vi.fn() }) }),
    removeChannel: vi.fn(),
  }),
}));

import { resolveTranscriptionJobProgress, resolveTranscriptionJobStage, useTranscriptionStore } from '../../src/stores/transcription';
import { api } from '../../src/lib/api';
import { splitFileIntoChunkParts } from '../../src/lib/audio';

const mockCreateJob = vi.mocked(api.transcribe.createJob);
const mockGetJob = vi.mocked(api.transcribe.getJob);
const mockGetResult = vi.mocked(api.transcribe.getResult);
const mockSplit = vi.mocked(splitFileIntoChunkParts);

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
      diarization: true,
      aiSummary: false,
      punctuation: true,
      language: 'auto',
      stagedFile: null,
      stagedUrl: '',
      savedDocumentId: null,
      sourceAudioUrl: null,
      urlStartedAt: null,
    });
  });

  it('starts with empty state', () => {
    const state = useTranscriptionStore.getState();
    expect(state.jobs).toHaveLength(0);
    expect(state.activeJobId).toBeNull();
    expect(state.loading).toBe(false);
  });

  it('createJob splits file, uploads chunks, registers, and runs', async () => {
    const chunkBlob = new Blob(['wav-data'], { type: 'audio/wav' });
    mockSplit.mockResolvedValue([
      { blob: chunkBlob, durationSeconds: 120, rmsLevel: 0.01 },
      { blob: chunkBlob, durationSeconds: 120, rmsLevel: 0.01 },
    ]);
    mockCreateJob.mockResolvedValue({
      id: 'job-1', status: 'pending', processed_chunks: 0, total_chunks: 2,
    });
    mockGetResult.mockResolvedValue({ text: 'done', segments: [] });

    const file = new File(['audio'], 'test.wav', { type: 'audio/wav' });
    await useTranscriptionStore.getState().createJob(file);

    expect(useTranscriptionStore.getState().jobs[0]?.id).toBe('job-1');
    expect(mockSplit).toHaveBeenCalledWith(file, { chunkDurationMs: 120000, channels: 2 });
    expect(mockCreateJob).toHaveBeenCalledWith(expect.objectContaining({ total_chunks: 2 }));
    expect(mockUpload).toHaveBeenCalledTimes(3);
    expect(mockUpload).toHaveBeenNthCalledWith(
      2,
      'user-123/chunks/job-1/0.wav',
      expect.any(ArrayBuffer),
      { contentType: 'audio/wav' },
    );
    expect(api.transcribe.registerChunk).toHaveBeenCalledTimes(2);
    expect(api.transcribe.registerChunk).toHaveBeenNthCalledWith(
      1,
      'job-1',
      expect.objectContaining({ index: 0, duration_seconds: 120, rms_level: 0.01, chunk_bytes: expect.any(Number) }),
    );
    expect(api.transcribe.run).toHaveBeenCalledWith('job-1', { max_chunks: 5 });
    const job = useTranscriptionStore.getState().jobs[0];
    expect(resolveTranscriptionJobStage(job)).toBe('completed');
  });

  it('createJob preserves non-wav chunk content type and extension', async () => {
    const m4aChunk = new Blob(['m4a-data'], { type: 'audio/mp4' });
    mockSplit.mockResolvedValue([{ blob: m4aChunk, durationSeconds: 120, rmsLevel: 0.01 }]);
    mockCreateJob.mockResolvedValue({
      id: 'job-1', status: 'pending', processed_chunks: 0, total_chunks: 1,
    });
    mockGetResult.mockResolvedValue({ text: 'done', segments: [] });

    const file = new File(['audio'], 'meeting.m4a', { type: 'audio/mp4' });
    await useTranscriptionStore.getState().createJob(file);

    expect(mockUpload).toHaveBeenCalledWith(
      'user-123/chunks/job-1/0.m4a',
      expect.any(ArrayBuffer),
      { contentType: 'audio/mp4' },
    );
  });

  it('createJob sets error on failure', async () => {
    mockSplit.mockResolvedValue([{ blob: new Blob(['x']), durationSeconds: 0, rmsLevel: 0 }]);
    mockCreateJob.mockRejectedValue(new Error('API error: 500'));

    const file = new File(['audio'], 'test.wav', { type: 'audio/wav' });
    await useTranscriptionStore.getState().createJob(file);

    expect(useTranscriptionStore.getState().error).toBe('API error: 500');
    expect(useTranscriptionStore.getState().loading).toBe(false);
  });

  it('marks job paused when run returns plan limit', async () => {
    const chunkBlob = new Blob(['wav-data'], { type: 'audio/wav' });
    mockSplit.mockResolvedValue([{ blob: chunkBlob, durationSeconds: 120, rmsLevel: 0.01 }]);
    mockCreateJob.mockResolvedValue({
      id: 'job-1', status: 'pending', processed_chunks: 0, total_chunks: 1,
    });
    vi.mocked(api.transcribe.run).mockRejectedValueOnce(
      new Error('API error 429: Plan limit exceeded for transcribe_seconds'),
    );

    const file = new File(['audio'], 'limited.wav', { type: 'audio/wav' });
    await useTranscriptionStore.getState().createJob(file);

    const job = useTranscriptionStore.getState().jobs.find((j) => j.id === 'job-1');
    expect(job?.status).toBe('paused');
    expect(useTranscriptionStore.getState().error).toContain('monthly transcription limit');
  });

  it('marks job failed for generic 500 even if message mentions transcribe_seconds', async () => {
    const chunkBlob = new Blob(['wav-data'], { type: 'audio/wav' });
    mockSplit.mockResolvedValue([{ blob: chunkBlob, durationSeconds: 120, rmsLevel: 0.01 }]);
    mockCreateJob.mockResolvedValue({
      id: 'job-1', status: 'pending', processed_chunks: 0, total_chunks: 1,
    });
    vi.mocked(api.transcribe.run).mockRejectedValueOnce(
      new Error('API error 500: function increment_usage(p_user_id, p_transcribe_seconds) does not exist'),
    );

    const file = new File(['audio'], 'broken.wav', { type: 'audio/wav' });
    await useTranscriptionStore.getState().createJob(file);

    const job = useTranscriptionStore.getState().jobs.find((j) => j.id === 'job-1');
    expect(job?.status).toBe('failed');
    expect(useTranscriptionStore.getState().error).toContain('function increment_usage');
    expect(useTranscriptionStore.getState().error).not.toContain('monthly transcription limit');
  });

  it('startTranscription resumes active paused job when no new input', async () => {
    mockGetResult.mockResolvedValue({ text: 'resumed text', segments: [] });
    useTranscriptionStore.setState({
      jobs: [{ id: 'job-paused', status: 'paused', processed_chunks: 1, total_chunks: 3 }],
      activeJobId: 'job-paused',
      stagedFile: null,
      stagedUrl: '',
    });

    await useTranscriptionStore.getState().startTranscription();

    expect(api.transcribe.run).toHaveBeenCalledWith('job-paused', { max_chunks: 5 });
    expect(useTranscriptionStore.getState().fullText).toBe('resumed text');
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

  it('loadResult saves formatted paragraphs in note content', async () => {
    useTranscriptionStore.setState({
      jobs: [{ id: 'job-1', status: 'completed', processed_chunks: 1, total_chunks: 1, filename: 'call.m4a' }],
    });

    mockGetResult.mockResolvedValue({
      text: 'Speaker 1: Hola\n\nSpeaker 2: Buenas',
      segments: [],
    });

    await useTranscriptionStore.getState().loadResult('job-1');

    expect(mockCreateDocument).toHaveBeenCalledWith({
      title: 'call.m4a',
      content: '<p>Speaker 1: Hola</p><p><br></p><p>Speaker 2: Buenas</p>',
      source: 'transcription',
      source_id: 'job-1',
      audio_url: undefined,
    });
    expect(useTranscriptionStore.getState().savedDocumentId).toBe('doc-1');
  });

  it('setActiveJob updates activeJobId', () => {
    useTranscriptionStore.getState().setActiveJob('job-2');
    expect(useTranscriptionStore.getState().activeJobId).toBe('job-2');
  });

  it('resolveTranscriptionJobProgress uses upload counters while uploading', () => {
    const progress = resolveTranscriptionJobProgress({
      id: 'job-1',
      status: 'pending',
      processed_chunks: 0,
      total_chunks: 10,
      stage: 'uploading',
      uploadedChunks: 4,
      uploadTotalChunks: 8,
    });
    expect(progress.done).toBe(4);
    expect(progress.total).toBe(8);
    expect(progress.pct).toBe(50);
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

  it('subscribeToRealtime returns unsubscribe function', () => {
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

  it('setLanguage changes language', () => {
    useTranscriptionStore.getState().setLanguage('es');
    expect(useTranscriptionStore.getState().language).toBe('es');
  });

  it('setDiarization toggles diarization', () => {
    useTranscriptionStore.getState().setDiarization(false);
    expect(useTranscriptionStore.getState().diarization).toBe(false);
  });

  it('setAiSummary toggles AI summary', () => {
    useTranscriptionStore.getState().setAiSummary(true);
    expect(useTranscriptionStore.getState().aiSummary).toBe(true);
  });

  it('setPunctuation toggles punctuation', () => {
    useTranscriptionStore.getState().setPunctuation(false);
    expect(useTranscriptionStore.getState().punctuation).toBe(false);
  });

  it('reset restores settings defaults', () => {
    useTranscriptionStore.getState().setLanguage('fr');
    useTranscriptionStore.getState().setDiarization(false);
    useTranscriptionStore.getState().setAiSummary(true);

    useTranscriptionStore.getState().reset();

    const s = useTranscriptionStore.getState();
    expect(s.language).toBe('auto');
    expect(s.diarization).toBe(true);
    expect(s.aiSummary).toBe(false);
    expect(s.punctuation).toBe(true);
    expect(s.savedDocumentId).toBeNull();
  });
});
