import { describe, it, expect, beforeEach } from 'vitest';
import { useWidgetStore, OVERLAY_BAR_SIZE, OVERLAY_DICTATING_SIZE, SUBTITLE_SIZE } from '../../src/overlay/widget-store';

function reset() {
  useWidgetStore.setState({
    mode: 'bar',
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

  it('exports updated size constants', () => {
    expect(OVERLAY_BAR_SIZE).toEqual({ width: 360, height: 64 });
    expect(OVERLAY_DICTATING_SIZE).toEqual({ width: 360, height: 120 });
    expect(SUBTITLE_SIZE).toEqual({ width: 760, height: 84 });
  });

  it('starts in bar mode', () => {
    expect(useWidgetStore.getState().mode).toBe('bar');
  });

  it('collapse resets to bar and idle dictate status', () => {
    useWidgetStore.getState().startDictation();
    useWidgetStore.getState().collapse();
    const s = useWidgetStore.getState();
    expect(s.mode).toBe('bar');
    expect(s.dictateStatus).toBe('idle');
  });

  it('dictation flow transitions to dictating and processing', () => {
    useWidgetStore.getState().startDictation();
    expect(useWidgetStore.getState().mode).toBe('dictating');
    expect(useWidgetStore.getState().dictateStatus).toBe('recording');
    useWidgetStore.getState().stopDictation();
    expect(useWidgetStore.getState().dictateStatus).toBe('processing');
  });

  it('setDone and setError return to bar mode', () => {
    useWidgetStore.getState().setDone('ok');
    expect(useWidgetStore.getState().mode).toBe('bar');
    useWidgetStore.getState().setError('failed');
    expect(useWidgetStore.getState().mode).toBe('bar');
    expect(useWidgetStore.getState().dictateStatus).toBe('error');
  });

  it('switchModule keeps compact mode for reader/translator', () => {
    useWidgetStore.getState().switchModule('reader');
    expect(useWidgetStore.getState().mode).toBe('bar');
    expect(useWidgetStore.getState().activeModule).toBe('reader');
  });

  it('switchModule subtitles sets subtitles mode', () => {
    useWidgetStore.getState().switchModule('subtitles');
    expect(useWidgetStore.getState().mode).toBe('subtitles');
    expect(useWidgetStore.getState().activeModule).toBe('subtitles');
  });

  it('setTranslatedText and setDragging update state', () => {
    useWidgetStore.getState().setTranslatedText('hola');
    useWidgetStore.getState().setDragging(true);
    expect(useWidgetStore.getState().translatedText).toBe('hola');
    expect(useWidgetStore.getState().dragging).toBe(true);
  });
});
