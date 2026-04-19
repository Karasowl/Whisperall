// Word-by-word reveal queue for the note editor, with fade+blur animation.
// Agnostic to the editor implementation — the caller provides a `write(word)`
// callback that performs the actual insertion (e.g. into TipTap via
// `editor.commands.insertContent(word)`).

export type RevealOpts = {
  /** Max words per second emitted. Default 8. */
  maxWps?: number;
  /** Callback used to insert a word into the editor. Return the inserted text. */
  write: (word: string) => void;
  /** Optional hook called after a word lands, with the DOM root so callers can
   *  apply the reveal class to the freshly inserted span. */
  onWrote?: (word: string) => void;
};

export type RevealQueue = {
  enqueue: (text: string) => void;
  flushSync: () => void;
  dispose: () => void;
  /** True if the OS asks to reduce motion — caller can skip animations. */
  reducedMotion: boolean;
};

function splitWords(text: string): string[] {
  // Keep whitespace glued to the following word so line breaks / spacing stay
  // natural when re-emitted.
  const out: string[] = [];
  const re = /(\s+|\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) out.push(m[0]);
  return out;
}

function prefersReducedMotion(): boolean {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch { return false; }
}

export function createRevealQueue(opts: RevealOpts): RevealQueue {
  const reduced = prefersReducedMotion();
  const maxWps = Math.max(1, Math.min(60, opts.maxWps ?? 8));
  const intervalMs = Math.round(1000 / maxWps);
  const queue: string[] = [];
  let timer: ReturnType<typeof setInterval> | null = null;

  const write = (word: string) => {
    opts.write(word);
    opts.onWrote?.(word);
  };

  const ensureTimer = () => {
    if (timer || reduced) return;
    timer = setInterval(() => {
      const next = queue.shift();
      if (next === undefined) {
        if (timer) { clearInterval(timer); timer = null; }
        return;
      }
      write(next);
    }, intervalMs);
  };

  const flushSync = () => {
    while (queue.length) {
      const next = queue.shift();
      if (next !== undefined) write(next);
    }
    if (timer) { clearInterval(timer); timer = null; }
  };

  return {
    enqueue: (text) => {
      if (!text) return;
      const words = splitWords(text);
      if (reduced) {
        for (const w of words) write(w);
        return;
      }
      queue.push(...words);
      ensureTimer();
    },
    flushSync,
    dispose: () => {
      queue.length = 0;
      if (timer) { clearInterval(timer); timer = null; }
    },
    reducedMotion: reduced,
  };
}
