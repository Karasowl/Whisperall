export type ExportFormat = 'txt' | 'md' | 'docx' | 'pdf';
export type ExportNoteItem = { title: string; html: string; updatedAt?: string | null };
export type RenderedExport = {
  filename: string;
  mime: string;
  content: string;
  printHtml: string | null;
};

function download(blob: Blob, filename: string): boolean {
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}

function sanitizeFilename(name: string): string {
  return (name || 'note').replace(/[<>:"/\\|?*]/g, '_').trim() || 'note';
}

function escapeText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function toPlain(html: string): string {
  const el = document.createElement('div');
  el.innerHTML = html;
  return el.textContent || '';
}

function toMarkdown(html: string): string {
  return html
    .replace(/<h[12][^>]*>(.*?)<\/h[12]>/gi, '## $1\n\n')
    .replace(/<h[3-6][^>]*>(.*?)<\/h[3-6]>/gi, '### $1\n\n')
    .replace(/<strong>(.*?)<\/strong>/gi, '**$1**')
    .replace(/<b>(.*?)<\/b>/gi, '**$1**')
    .replace(/<em>(.*?)<\/em>/gi, '*$1*')
    .replace(/<i>(.*?)<\/i>/gi, '*$1*')
    .replace(/<li>(.*?)<\/li>/gi, '- $1\n')
    .replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gi, '> $1\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<p>(.*?)<\/p>/gi, '$1\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function wrapWordDocument(title: string, bodyHtml: string): string {
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>${escapeText(title)}</title></head><body>${bodyHtml}</body></html>`;
}

function wrapPrintablePage(title: string, bodyHtml: string): string {
  return `<html><head><title>${escapeText(title)}</title><style>body{font-family:sans-serif;padding:2rem;max-width:900px;margin:0 auto;color:#111}h1{margin:0 0 1rem}h2{margin:1.5rem 0 .5rem}hr{border:none;border-top:1px solid #ddd;margin:1.5rem 0}.meta{font-size:.85rem;color:#555;margin:.25rem 0 1rem}</style></head><body>${bodyHtml}</body></html>`;
}

function toDisplayDate(updatedAt?: string | null): string {
  if (!updatedAt) return '';
  const d = new Date(updatedAt);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString();
}

function runExport(rendered: RenderedExport): boolean {
  if (rendered.printHtml) {
    const win = window.open('', '_blank');
    if (!win) return false;
    win.document.write(rendered.printHtml);
    win.document.close();
    win.print();
    return true;
  }
  return download(new Blob([rendered.content], { type: rendered.mime }), rendered.filename);
}

export function renderSingleNote(title: string, html: string, format: ExportFormat): RenderedExport {
  const safeTitle = sanitizeFilename(title);
  const resolvedTitle = title.trim() || 'note';
  switch (format) {
    case 'txt':
      return { filename: `${safeTitle}.txt`, mime: 'text/plain', content: toPlain(html), printHtml: null };
    case 'md':
      return { filename: `${safeTitle}.md`, mime: 'text/markdown', content: `# ${resolvedTitle}\n\n${toMarkdown(html)}`, printHtml: null };
    case 'docx':
      return { filename: `${safeTitle}.doc`, mime: 'application/msword', content: wrapWordDocument(resolvedTitle, html), printHtml: null };
    case 'pdf':
      return {
        filename: `${safeTitle}.pdf`,
        mime: 'application/pdf',
        content: '',
        printHtml: wrapPrintablePage(resolvedTitle, `<h1>${escapeText(resolvedTitle)}</h1>${html}`),
      };
    default:
      return { filename: `${safeTitle}.txt`, mime: 'text/plain', content: toPlain(html), printHtml: null };
  }
}

export function renderCombinedNotes(bundleTitle: string, notes: ExportNoteItem[], format: ExportFormat): RenderedExport | null {
  if (!notes.length) return null;
  const resolvedTitle = bundleTitle.trim() || 'notes-export';
  const safeTitle = sanitizeFilename(resolvedTitle);

  switch (format) {
    case 'txt': {
      const sections = notes.map((note, idx) => {
        const heading = `[${idx + 1}] ${note.title || `Note ${idx + 1}`}`;
        const updated = toDisplayDate(note.updatedAt);
        const body = toPlain(note.html).trim() || '(empty)';
        const meta = updated ? `Updated: ${updated}\n` : '';
        return `${heading}\n${meta}${'-'.repeat(72)}\n${body}`;
      }).join('\n\n');
      return {
        filename: `${safeTitle}.txt`,
        mime: 'text/plain',
        content: `${resolvedTitle}\nNotes: ${notes.length}\nGenerated: ${new Date().toLocaleString()}\n\n${sections}`,
        printHtml: null,
      };
    }
    case 'md': {
      const sections = notes.map((note, idx) => {
        const heading = `## ${idx + 1}. ${note.title || `Note ${idx + 1}`}`;
        const updated = toDisplayDate(note.updatedAt);
        const meta = updated ? `\n_Updated: ${updated}_\n` : '\n';
        return `${heading}${meta}\n${toMarkdown(note.html)}\n`;
      }).join('\n---\n\n');
      return {
        filename: `${safeTitle}.md`,
        mime: 'text/markdown',
        content: `# ${resolvedTitle}\n\n${sections}`,
        printHtml: null,
      };
    }
    case 'docx': {
      const body = notes.map((note, idx) => {
        const label = escapeText(note.title || `Note ${idx + 1}`);
        const updated = toDisplayDate(note.updatedAt);
        const meta = updated ? `<p class="meta">Updated: ${escapeText(updated)}</p>` : '';
        return `<h2>${idx + 1}. ${label}</h2>${meta}${note.html}`;
      }).join('<hr/>');
      return {
        filename: `${safeTitle}.doc`,
        mime: 'application/msword',
        content: wrapWordDocument(resolvedTitle, `<h1>${escapeText(resolvedTitle)}</h1>${body}`),
        printHtml: null,
      };
    }
    case 'pdf': {
      const body = notes.map((note, idx) => {
        const label = escapeText(note.title || `Note ${idx + 1}`);
        const updated = toDisplayDate(note.updatedAt);
        const meta = updated ? `<p class="meta">Updated: ${escapeText(updated)}</p>` : '';
        return `<section><h2>${idx + 1}. ${label}</h2>${meta}${note.html}</section>`;
      }).join('<hr/>');
      return {
        filename: `${safeTitle}.pdf`,
        mime: 'application/pdf',
        content: '',
        printHtml: wrapPrintablePage(resolvedTitle, `<h1>${escapeText(resolvedTitle)}</h1>${body}`),
      };
    }
    default:
      return null;
  }
}

export function exportNote(title: string, html: string, format: ExportFormat): boolean {
  return runExport(renderSingleNote(title, html, format));
}

export function exportNotesBundle(bundleTitle: string, notes: ExportNoteItem[], format: ExportFormat): boolean {
  const rendered = renderCombinedNotes(bundleTitle, notes, format);
  if (!rendered) return false;
  return runExport(rendered);
}
