import { marked } from 'marked';

// Marked config: GFM (GitHub-flavored) + linebreak handling.
marked.setOptions({
  gfm: true,
  breaks: true,
  // Don't include headerIds or silent mangling; those trip TipTap's parser.
});

/** Heuristic: does this text look like markdown worth converting? */
export function looksLikeMarkdown(text: string): boolean {
  if (!text || text.length < 2) return false;
  // Markdown signals: headings, bold, italic, code, lists, blockquotes, links.
  const signals = [
    /^#{1,6}\s+\S/m,                 // # heading
    /\*\*[^*\n]+\*\*/,                // **bold**
    /(?<!\*)\*[^*\n]+\*(?!\*)/,       // *italic*
    /`[^`\n]+`/,                      // `code`
    /^[-*+]\s+\S/m,                    // - list
    /^\d+\.\s+\S/m,                    // 1. list
    /^>\s+\S/m,                        // > blockquote
    /^```/m,                           // ``` code block
    /\[[^\]]+\]\([^)]+\)/,             // [text](url)
    /^---+$/m,                         // --- hr
  ];
  return signals.some((re) => re.test(text));
}

/** Convert markdown text to HTML TipTap can ingest. */
export function markdownToHtml(md: string): string {
  const html = marked.parse(md, { async: false }) as string;
  return html;
}
