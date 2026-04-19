import { $mark } from '@milkdown/utils';

/**
 * Transient mark wrapping each word written by the typewriter reveal queue
 * (`<span class="wa-reveal">word</span>`). The mark carries no persistent
 * meaning — its only purpose is to let the CSS fade+blur animation target
 * the DOM while the word is first painted.
 *
 * On markdown serialization, the mark is ignored: we write only the text.
 * That keeps the on-disk markdown clean (no wa-reveal spans ever persisted).
 * On parse, the mark never matches — it only ever appears via runtime
 * `editor.insertHtmlAtCursor('<span class="wa-reveal">…')` calls.
 */
export const revealMark = $mark('reveal', () => ({
  inclusive: false,
  spanning: true,
  parseDOM: [{ tag: 'span.wa-reveal' }],
  toDOM: () => ['span', { class: 'wa-reveal' }, 0],
  parseMarkdown: {
    match: () => false,
    runner: () => {},
  },
  toMarkdown: {
    match: (mark) => mark.type.name === 'reveal',
    // Drop the mark wrapper; emit only the underlying text through the
    // default text runner on the next pass.
    runner: () => {},
  },
}));
