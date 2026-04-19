import { useEffect, useRef, useCallback } from 'react';
import { Widget } from '../overlay/Widget';
import { useWidgetStore } from '../overlay/widget-store';
import { electron } from '../lib/electron';
import '../overlay/widget.css';

/**
 * Persistent dock slot for the Widget in the AppShell topbar.
 *
 * Shape matches the widget pill exactly (360 × 56 px, rounded-full).
 * When empty: ghost placeholder with subtle dashed outline.
 * When filled: `<Widget docked />` always expanded.
 *
 * The ONLY way to dock/undock is via the grip handle:
 *  - Drag the floating overlay near the slot → magnetic snap (handled by Electron IPC)
 *  - Drag the grip handle out of the slot → undock to overlay at cursor
 *
 * No click-to-dock, no undock button — all interaction is through the drag handle.
 */

// Exact dimensions of the notch-pill in widget.css.
const PILL_W = 360;
const PILL_H = 56;

export function WidgetDock() {
  const docked = useWidgetStore((s) => s.docked);
  const setDocked = useWidgetStore((s) => s.setDocked);
  const slotRef = useRef<HTMLDivElement>(null);

  // Report dock zone screen bounds so Electron can compute snap distance.
  useEffect(() => {
    const el = slotRef.current;
    if (!el || !electron?.setDockZone) return;
    const report = () => {
      const rect = el.getBoundingClientRect();
      electron!.setDockZone({
        x: Math.round(window.screenX + rect.left),
        y: Math.round(window.screenY + rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });
    };
    report();
    window.addEventListener('resize', report);
    return () => {
      window.removeEventListener('resize', report);
      electron?.setDockZone(null);
    };
  }, [docked]);

  // Listen for magnetic snap from Electron main process.
  useEffect(() => {
    if (!electron?.onSnapDock) return;
    return electron.onSnapDock(() => {
      if (!useWidgetStore.getState().docked) {
        useWidgetStore.getState().setDocked(true);
      }
    });
  }, []);

  // Called by Widget when the user drags the grip handle out of the dock.
  const handleDragOut = useCallback((screenX: number, screenY: number) => {
    setDocked(false);
    electron?.undockToPosition(screenX, screenY);
  }, [setDocked]);

  if (docked) {
    return (
      <div
        ref={slotRef}
        className="wa-widget-dock"
        style={{ width: PILL_W, height: PILL_H, borderRadius: 9999 }}
        data-testid="widget-dock-filled"
      >
        <Widget docked onDragOut={handleDragOut} />
      </div>
    );
  }

  // Ghost slot — exact pill shape, dashed border.
  // No click handler: docking only via magnetic snap.
  return (
    <div
      ref={slotRef}
      data-testid="widget-dock-empty"
      className="border-2 border-dashed border-edge/30 grid place-items-center"
      style={{ width: PILL_W, height: PILL_H, borderRadius: 9999 }}
    >
      <div className="flex items-center gap-2 text-text-quaternary">
        <span className="material-symbols-outlined text-[16px]">drag_indicator</span>
        <span className="text-[10px] tracking-[0.14px]">drag widget here</span>
      </div>
    </div>
  );
}
