import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

/**
 * Electron replacement for `window.prompt()`.
 *
 * Electron's renderer explicitly disables the synchronous modal dialogs
 * (`alert`, `confirm`, `prompt`) because they block the main process on
 * sandboxed BrowserWindows — you get `[window.error] prompt() is and will
 * not be supported.` in the dev console and nothing happens. This helper
 * renders a small portal-based modal with an input field and resolves a
 * promise with the entered text, or `null` on Cancel / Escape / backdrop
 * click. Drop-in async replacement: `const v = await promptText({...})`.
 *
 * Not coupled to any feature — used by speaker-rename in DictatePage /
 * EditorPage and annotation prompts in ReaderPage.
 */
export function promptText(opts: {
  message: string;
  defaultValue?: string;
  placeholder?: string;
  okLabel?: string;
  cancelLabel?: string;
}): Promise<string | null> {
  return new Promise((resolve) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const close = (result: string | null) => {
      try { root.unmount(); } catch { /* ignore */ }
      try { container.remove(); } catch { /* ignore */ }
      resolve(result);
    };
    root.render(<PromptModal {...opts} onClose={close} />);
  });
}

type ModalProps = {
  message: string;
  defaultValue?: string;
  placeholder?: string;
  okLabel?: string;
  cancelLabel?: string;
  onClose: (result: string | null) => void;
};

function PromptModal({ message, defaultValue, placeholder, okLabel, cancelLabel, onClose }: ModalProps) {
  const [value, setValue] = useState(defaultValue ?? '');
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(null); }
      if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        // Let the input's native Enter handler fire first if it's focused —
        // but our form is single-line so we submit regardless.
        e.stopPropagation();
        onClose(value);
      }
    };
    // `capture: true` so the modal's Escape wins over any parent listener
    // (the JobDetailModal/Processes hub also listens for Escape).
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [value, onClose]);
  return (
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(null); }}
      data-testid="prompt-modal"
    >
      <div className="w-full max-w-md rounded-2xl border border-edge bg-surface shadow-2xl overflow-hidden">
        <div className="px-5 py-4">
          <p className="mb-3 text-sm text-text/90">{message}</p>
          <input
            autoFocus
            type="text"
            value={value}
            placeholder={placeholder}
            onChange={(e) => setValue(e.target.value)}
            className="w-full rounded-md border border-edge bg-base px-3 py-2 text-sm text-text outline-none transition-colors focus:border-primary"
            data-testid="prompt-modal-input"
          />
        </div>
        <div className="flex justify-end gap-2 border-t border-edge px-4 py-3">
          <button
            type="button"
            onClick={() => onClose(null)}
            className="rounded-lg border border-edge px-3 py-1.5 text-xs text-muted transition-colors hover:text-text"
            data-testid="prompt-modal-cancel"
          >
            {cancelLabel ?? 'Cancel'}
          </button>
          <button
            type="button"
            onClick={() => onClose(value)}
            className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/15"
            data-testid="prompt-modal-ok"
          >
            {okLabel ?? 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
}
