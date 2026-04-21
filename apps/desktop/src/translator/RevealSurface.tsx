import { useEffect, useRef } from 'react';
import { createRevealQueue, type RevealQueue } from '../lib/typewriter';

type Props = {
  /** Latest translated paragraph. Changes trigger a fresh reveal. */
  text: string;
  /** Words per second for the typewriter reveal. */
  wordsPerSecond?: number;
};

/**
 * Reveal surface — renders the translated paragraph word-by-word with a
 * blur-fade per word (`wa-reveal`) plus a subtle left-to-right mask sweep
 * on the paragraph for the "magical/scientific" feel the user asked for.
 * Respects `prefers-reduced-motion` via the typewriter queue.
 */
export function RevealSurface({ text, wordsPerSecond = 10 }: Props): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const queueRef = useRef<RevealQueue | null>(null);
  const prevTextRef = useRef<string>('');

  useEffect(() => {
    return () => {
      queueRef.current?.dispose();
      queueRef.current = null;
    };
  }, []);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    if (text === prevTextRef.current) return;
    prevTextRef.current = text;

    // Rebuild the queue per paragraph so we can reset the DOM without racing
    // against in-flight writes from the previous paragraph.
    queueRef.current?.dispose();
    node.innerHTML = '';

    if (!text) return;

    // Trigger the mask-sweep animation by toggling a class on the node.
    node.classList.remove('translator-sweep');
    // Force reflow so the next add restarts the animation.
    void node.offsetWidth;
    node.classList.add('translator-sweep');

    const queue = createRevealQueue({
      maxWps: wordsPerSecond,
      write: (word) => {
        const span = document.createElement('span');
        span.className = 'wa-reveal';
        span.textContent = word;
        node.appendChild(span);
        // Next frame — let the browser paint the blurred starting state
        // before we transition to the shown state.
        requestAnimationFrame(() => span.classList.add('wa-reveal-shown'));
      },
    });
    queue.enqueue(text);
    queueRef.current = queue;
  }, [text, wordsPerSecond]);

  return (
    <div
      ref={containerRef}
      className="translator-reveal"
      data-testid="translator-reveal"
      aria-live="polite"
    />
  );
}
