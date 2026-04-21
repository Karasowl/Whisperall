import { beforeEach, describe, expect, it } from 'vitest';
import { useTranslatorStore } from '../../src/stores/translator';

function reset() {
  useTranslatorStore.setState({
    visible: false,
    dragging: false,
    resizing: false,
    status: 'idle',
    lastOcrText: '',
    lastTranslation: '',
    consecFailures: 0,
    bounds: null,
  });
}

describe('translator store', () => {
  beforeEach(reset);

  it('defaults to idle + hidden + no failures', () => {
    const s = useTranslatorStore.getState();
    expect(s.visible).toBe(false);
    expect(s.dragging).toBe(false);
    expect(s.resizing).toBe(false);
    expect(s.status).toBe('idle');
    expect(s.consecFailures).toBe(0);
    expect(s.bounds).toBeNull();
  });

  it('setVisible toggles visibility flag', () => {
    useTranslatorStore.getState().setVisible(true);
    expect(useTranslatorStore.getState().visible).toBe(true);
    useTranslatorStore.getState().setVisible(false);
    expect(useTranslatorStore.getState().visible).toBe(false);
  });

  it('setDragging and setResizing track interaction state', () => {
    useTranslatorStore.getState().setDragging(true);
    useTranslatorStore.getState().setResizing(true);
    const s = useTranslatorStore.getState();
    expect(s.dragging).toBe(true);
    expect(s.resizing).toBe(true);
  });

  it('incFailures bumps and resetFailures zeroes', () => {
    const s = useTranslatorStore.getState();
    s.incFailures();
    s.incFailures();
    s.incFailures();
    expect(useTranslatorStore.getState().consecFailures).toBe(3);
    useTranslatorStore.getState().resetFailures();
    expect(useTranslatorStore.getState().consecFailures).toBe(0);
  });

  it('setStatus accepts all documented statuses', () => {
    const statuses = ['idle', 'capturing', 'reading', 'translating', 'no-text', 'error'] as const;
    for (const s of statuses) {
      useTranslatorStore.getState().setStatus(s);
      expect(useTranslatorStore.getState().status).toBe(s);
    }
  });

  it('setOcrText and setTranslation update lastOcrText / lastTranslation', () => {
    useTranslatorStore.getState().setOcrText('hola');
    useTranslatorStore.getState().setTranslation('hello');
    const s = useTranslatorStore.getState();
    expect(s.lastOcrText).toBe('hola');
    expect(s.lastTranslation).toBe('hello');
  });

  it('setBounds stores current window bounds', () => {
    useTranslatorStore.getState().setBounds({ x: 100, y: 200, width: 420, height: 180 });
    expect(useTranslatorStore.getState().bounds).toEqual({ x: 100, y: 200, width: 420, height: 180 });
  });
});
