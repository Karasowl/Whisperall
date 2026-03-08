import { describe, expect, it } from 'vitest';
import { mapLocalProcessToProcess, mapTranscriptionJobToProcess, processMatchesFilter, processStatusFromTranscriptionJob } from '../../src/lib/processes';
import type { LocalProcess } from '../../src/stores/processes';
import type { TranscriptionJob } from '../../src/stores/transcription';

function job(partial: Partial<TranscriptionJob>): TranscriptionJob {
  return { id: 'job-1', status: 'processing', processed_chunks: 1, total_chunks: 4, ...partial };
}

describe('processes helpers', () => {
  it('maps transcription stage to unified process status', () => {
    expect(processStatusFromTranscriptionJob(job({ stage: 'queued' }))).toBe('queued');
    expect(processStatusFromTranscriptionJob(job({ stage: 'processing' }))).toBe('running');
    expect(processStatusFromTranscriptionJob(job({ stage: 'paused' }))).toBe('paused');
    expect(processStatusFromTranscriptionJob(job({ stage: 'canceled' as const }))).toBe('canceled');
    expect(processStatusFromTranscriptionJob(job({ stage: 'failed' }))).toBe('failed');
    expect(processStatusFromTranscriptionJob(job({ stage: 'completed' }))).toBe('completed');
  });

  it('maps transcription jobs into process cards', () => {
    const mapped = mapTranscriptionJobToProcess(job({ filename: 'call.mp3', stage: 'processing', documentId: 'doc-7' }));
    expect(mapped.title).toBe('call.mp3');
    expect(mapped.status).toBe('running');
    expect(mapped.pct).toBe(25);
    expect(mapped.documentId).toBe('doc-7');
    expect(mapped.stageLabelKey).toBe('transcribe.stageProcessing');
  });

  it('maps local processes into process cards', () => {
    const local: LocalProcess = {
      id: 'lp-1',
      type: 'note_import',
      title: 'my-file.md',
      status: 'running',
      stageLabelKey: 'processes.stageImport',
      done: 0,
      total: 1,
      pct: 0,
      documentId: 'doc-7',
      error: null,
      createdAt: '2026-02-20T00:00:00Z',
      updatedAt: '2026-02-20T00:00:00Z',
    };
    const mapped = mapLocalProcessToProcess(local);
    expect(mapped.type).toBe('note_import');
    expect(mapped.stageLabelKey).toBe('processes.stageImport');
  });

  it('filters items by selected process filter', () => {
    const item = mapTranscriptionJobToProcess(job({ stage: 'failed' }));
    expect(processMatchesFilter(item, 'all')).toBe(true);
    expect(processMatchesFilter(item, 'failed')).toBe(true);
    expect(processMatchesFilter(item, 'running')).toBe(false);
  });
});
