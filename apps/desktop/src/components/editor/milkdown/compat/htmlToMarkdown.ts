import TurndownService from 'turndown';

/**
 * Converts legacy HTML note content to canonical markdown.
 *
 * Custom rules:
 *  - `<section class="wa-transcription-block">…</section>` → passes through
 *    as raw HTML block (CommonMark allows HTML blocks at the block level).
 *    The Milkdown schema has a parse rule matching this selector so it
 *    round-trips via the schema.
 *  - `<div class="wa-transcription-body">…</div>` → pass-through.
 *  - `<span class="wa-reveal">X</span>` → emits X only (the wa-reveal wrapper
 *    is a transient animation state; never persist it).
 *  - `<mark>`, `<u>` → raw HTML (highlight + underline marks parse them back).
 */
let service: TurndownService | null = null;

function getService(): TurndownService {
  if (service) return service;
  service = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
    strongDelimiter: '**',
    linkStyle: 'inlined',
    blankReplacement: (_content, node) => {
      // Drop empty <p> and <p><br></p> artifacts from safeHtmlParagraphs.
      const el = node as HTMLElement;
      if (el.nodeName === 'P' && !el.textContent?.trim()) return '';
      return '';
    },
  });

  // Keep our custom chrome verbatim (wa-transcription-block section).
  service.addRule('keep-transcription-block', {
    filter: (node) => {
      const el = node as HTMLElement;
      return (
        el.nodeName === 'SECTION' && el.classList?.contains('wa-transcription-block') === true
      );
    },
    replacement: (_content, node) => (node as HTMLElement).outerHTML ?? '',
  });

  // Strip transient reveal wrapper, keep inner text.
  service.addRule('strip-wa-reveal', {
    filter: (node) => node.nodeName === 'SPAN' && (node as HTMLElement).classList?.contains('wa-reveal'),
    replacement: (content) => content,
  });

  // Keep <mark> as raw HTML — highlight mark parses it back.
  service.addRule('keep-mark', {
    filter: (node) => node.nodeName === 'MARK',
    replacement: (content) => `<mark>${content}</mark>`,
  });

  // Keep <u> as raw HTML — underline mark parses it back.
  service.addRule('keep-u', {
    filter: (node) => node.nodeName === 'U',
    replacement: (content) => `<u>${content}</u>`,
  });

  return service;
}

/** Quick sniff: does this string start with HTML we should convert? */
export function looksLikeHtmlNote(content: string): boolean {
  return /^\s*<(p|h[1-6]|ul|ol|section|div|blockquote|pre)\b/i.test(content);
}

/** Convert legacy HTML note content to markdown. Pass-through if already markdown. */
export function htmlToMarkdown(html: string): string {
  if (!html) return '';
  if (!looksLikeHtmlNote(html)) return html;
  try {
    // Pre-pass: drop obvious empty paragraphs added by safeHtmlParagraphs.
    const cleaned = html.replace(/<p>\s*<br\s*\/?>\s*<\/p>/gi, '').replace(/&nbsp;/g, ' ');
    return getService().turndown(cleaned);
  } catch {
    // Fallback: return the original; Milkdown's CommonMark will tolerate raw HTML.
    return html;
  }
}
