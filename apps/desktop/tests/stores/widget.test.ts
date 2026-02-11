import { describe, it, expect, beforeEach } from 'vitest';
import {
  useWidgetStore, OVERLAY_BASE_SIZE, EXPANDED_SIZE, SUBTITLE_SIZE,
} from '../../src/overlay/widget-store';

function reset() {
  useWidgetStore.setState({
    mode: 'pill',
    activeModule: 'dictate',
    dictateStatus: 'idle',
    text: '',
    translatedText: '',
    error: null,
    dragging: false,
  });
}

describe('widget-store', () => {
  beforeEach(reset);

  describe('constants', () => {
    it('exports size constants', () => {
      expect(OVERLAY_BASE_SIZE).toEqual({ width: 280, height: 100 });
      expect(EXPANDED_SIZE).toEqual({ width: 260, height: 148 });
      expect(SUBTITLE_SIZE).toEqual({ width: 600, height: 56 });
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

    it('toggle flips pill/hover to expanded and back', () => {
      useWidgetStore.getState().toggle();
      expect(useWidgetStore.getState().mode).toBe('expanded');
      useWidgetStore.getState().toggle();
      expect(useWidgetStore.getState().mode).toBe('pill');
    });

    it('toggle from hover goes to expanded', () => {
      useWidgetStore.getState().hoverIn();
      useWidgetStore.getState().toggle();
      expect(useWidgetStore.getState().mode).toBe('expanded');
    });
  });

  describe('hover transitions', () => {
    it('hoverIn transitions pill to hover', () => {
      useWidgetStore.getState().hoverIn();
      expect(useWidgetStore.getState().mode).toBe('hover');
    });

    it('hoverIn is no-op when not in pill mode', () => {
      useWidgetStore.getState().expand();
      useWidgetStore.getState().hoverIn();
      expect(useWidgetStore.getState().mode).toBe('expanded');
    });

    it('hoverOut transitions hover back to pill', () => {
      useWidgetStore.getState().hoverIn();
      useWidgetStore.getState().hoverOut();
      expect(useWidgetStore.getState().mode).toBe('pill');
    });

    it('hoverOut is no-op when not in hover mode', () => {
      useWidgetStore.getState().expand();
      useWidgetStore.getState().hoverOut();
      expect(useWidgetStore.getState().mode).toBe('expanded');
    });
  });

  describe('dictation state machine', () => {
    it('startDictation sets dictating mode and recording', () => {
      useWidgetStore.getState().startDictation();
      const s = useWidgetStore.getState();
      expect(s.mode).toBe('dictating');
      expect(s.dictateStatus).toBe('recording');
      expect(s.activeModule).toBe('dictate');
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

    it('setDone sets text, done status, and switches to expanded', () => {
      useWidgetStore.getState().startDictation();
      useWidgetStore.getState().stopDictation();
      useWidgetStore.getState().setDone('Hello world');
      const s = useWidgetStore.getState();
      expect(s.dictateStatus).toBe('done');
      expect(s.text).toBe('Hello world');
      expect(s.mode).toBe('expanded');
    });

    it('setError sets error status and switches to expanded', () => {
      useWidgetStore.getState().startDictation();
      useWidgetStore.getState().setError('Mic failed');
      const s = useWidgetStore.getState();
      expect(s.dictateStatus).toBe('error');
      expect(s.error).toBe('Mic failed');
      expect(s.mode).toBe('expanded');
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
    it('idle → dictating → processing → done (expanded)', () => {
      const { startDictation, stopDictation, setDone } = useWidgetStore.getState();
      startDictation();
      expect(useWidgetStore.getState().mode).toBe('dictating');
      expect(useWidgetStore.getState().dictateStatus).toBe('recording');
      stopDictation();
      expect(useWidgetStore.getState().dictateStatus).toBe('processing');
      setDone('Transcribed text');
      expect(useWidgetStore.getState().dictateStatus).toBe('done');
      expect(useWidgetStore.getState().text).toBe('Transcribed text');
      expect(useWidgetStore.getState().mode).toBe('expanded');
    });

    it('idle → dictating → error (expanded) → reset → idle', () => {
      const { startDictation, setError, resetDictation } = useWidgetStore.getState();
      startDictation();
      setError('Network error');
      expect(useWidgetStore.getState().dictateStatus).toBe('error');
      expect(useWidgetStore.getState().mode).toBe('expanded');
      resetDictation();
      expect(useWidgetStore.getState().dictateStatus).toBe('idle');
      expect(useWidgetStore.getState().error).toBeNull();
    });
  });

  describe('module switching', () => {
    it('switchModule sets activeModule and expands', () => {
      useWidgetStore.getState().switchModule('reader');
      const s = useWidgetStore.getState();
      expect(s.activeModule).toBe('reader');
      expect(s.mode).toBe('expanded');
    });

    it('switchModule to subtitles sets subtitles mode', () => {
      useWidgetStore.getState().switchModule('subtitles');
      const s = useWidgetStore.getState();
      expect(s.activeModule).toBe('subtitles');
      expect(s.mode).toBe('subtitles');
    });

    it('setTranslatedText updates translatedText', () => {
      useWidgetStore.getState().setTranslatedText('Hola mundo');
      expect(useWidgetStore.getState().translatedText).toBe('Hola mundo');
    });
  });
});
