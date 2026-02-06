import { describe, it, expect, beforeEach } from 'vitest';
import { useWidgetStore, PILL_SIZE, EXPANDED_SIZE } from '../../src/overlay/widget-store';

function reset() {
  useWidgetStore.setState({
    mode: 'pill',
    dictateStatus: 'idle',
    text: '',
    error: null,
    dragging: false,
  });
}

describe('widget-store', () => {
  beforeEach(reset);

  describe('constants', () => {
    it('exports pill and expanded sizes', () => {
      expect(PILL_SIZE).toEqual({ width: 72, height: 12 });
      expect(EXPANDED_SIZE).toEqual({ width: 320, height: 200 });
    });
  });

  describe('mode transitions', () => {
    it('starts in pill mode', () => {
      expect(useWidgetStore.getState().mode).toBe('pill');
    });

    it('expand switches to expanded', () => {
      useWidgetStore.getState().expand();
      expect(useWidgetStore.getState().mode).toBe('expanded');
    });

    it('collapse switches to pill and resets dictation', () => {
      useWidgetStore.getState().expand();
      useWidgetStore.getState().startDictation();
      useWidgetStore.getState().collapse();
      const s = useWidgetStore.getState();
      expect(s.mode).toBe('pill');
      expect(s.dictateStatus).toBe('idle');
    });

    it('toggle flips mode', () => {
      useWidgetStore.getState().toggle();
      expect(useWidgetStore.getState().mode).toBe('expanded');
      useWidgetStore.getState().toggle();
      expect(useWidgetStore.getState().mode).toBe('pill');
    });
  });

  describe('dictation state machine', () => {
    it('startDictation expands and sets recording', () => {
      useWidgetStore.getState().startDictation();
      const s = useWidgetStore.getState();
      expect(s.mode).toBe('expanded');
      expect(s.dictateStatus).toBe('recording');
      expect(s.error).toBeNull();
    });

    it('stopDictation transitions from recording to processing', () => {
      useWidgetStore.getState().startDictation();
      useWidgetStore.getState().stopDictation();
      expect(useWidgetStore.getState().dictateStatus).toBe('processing');
    });

    it('stopDictation is no-op if not recording', () => {
      useWidgetStore.getState().stopDictation();
      expect(useWidgetStore.getState().dictateStatus).toBe('idle');
    });

    it('setProcessing sets processing status', () => {
      useWidgetStore.getState().setProcessing();
      expect(useWidgetStore.getState().dictateStatus).toBe('processing');
    });

    it('setDone sets text and done status', () => {
      useWidgetStore.getState().startDictation();
      useWidgetStore.getState().stopDictation();
      useWidgetStore.getState().setDone('Hello world');
      const s = useWidgetStore.getState();
      expect(s.dictateStatus).toBe('done');
      expect(s.text).toBe('Hello world');
    });

    it('setError sets error status', () => {
      useWidgetStore.getState().startDictation();
      useWidgetStore.getState().setError('Mic failed');
      const s = useWidgetStore.getState();
      expect(s.dictateStatus).toBe('error');
      expect(s.error).toBe('Mic failed');
    });

    it('resetDictation clears text, error, and status', () => {
      useWidgetStore.getState().startDictation();
      useWidgetStore.getState().setError('Mic failed');
      useWidgetStore.getState().resetDictation();
      const s = useWidgetStore.getState();
      expect(s.dictateStatus).toBe('idle');
      expect(s.text).toBe('');
      expect(s.error).toBeNull();
    });
  });

  describe('drag state', () => {
    it('setDragging updates dragging flag', () => {
      expect(useWidgetStore.getState().dragging).toBe(false);
      useWidgetStore.getState().setDragging(true);
      expect(useWidgetStore.getState().dragging).toBe(true);
      useWidgetStore.getState().setDragging(false);
      expect(useWidgetStore.getState().dragging).toBe(false);
    });
  });

  describe('full dictation flow', () => {
    it('idle → recording → processing → done', () => {
      const { startDictation, stopDictation, setDone } = useWidgetStore.getState();
      startDictation();
      expect(useWidgetStore.getState().dictateStatus).toBe('recording');
      stopDictation();
      expect(useWidgetStore.getState().dictateStatus).toBe('processing');
      setDone('Transcribed text');
      expect(useWidgetStore.getState().dictateStatus).toBe('done');
      expect(useWidgetStore.getState().text).toBe('Transcribed text');
    });

    it('idle → recording → error → reset → idle', () => {
      const { startDictation, setError, resetDictation } = useWidgetStore.getState();
      startDictation();
      setError('Network error');
      expect(useWidgetStore.getState().dictateStatus).toBe('error');
      resetDictation();
      expect(useWidgetStore.getState().dictateStatus).toBe('idle');
      expect(useWidgetStore.getState().error).toBeNull();
    });
  });
});
