export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function safeHtmlParagraphs(text: string): string {
  return text.split('\n').map((l) => `<p>${escapeHtml(l) || '<br>'}</p>`).join('');
}

type ImportTocEntry = { id: string; title: string; level: number };
type BlockSegment = { start?: number; end?: number; speaker?: string; text: string };
type TranscriptionBlockSource = 'mic' | 'system' | 'audio';
type TranscriptionBlockArgs = {
  blockId?: string;
  source: TranscriptionBlockSource;
  text: string;
  title?: string;
  language?: string;
  diarization?: boolean;
  audioUrl?: string | null;
  segments?: BlockSegment[];
};

const BLOCK_SOURCE_LABEL: Record<TranscriptionBlockSource, string> = {
  mic: 'Mic',
  system: 'System',
  audio: 'Audio',
};

function normalizeBlockText(text: string): string {
  return text.split('\n').map((line) => line.trim()).join('\n').trim();
}

function safeAttr(value: string): string {
  return escapeHtml(value).replace(/"/g, '&quot;');
}

function truncateBlockText(text: string, maxChars = 4000): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars).trimEnd()}\n...`;
}

export type ParsedTranscriptionBlock = {
  blockId: string | null;
  source: string;
  title: string;
  text: string;
};

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
}

function getAttr(attrs: string, name: string): string | null {
  const m = attrs.match(new RegExp(`${name}="([^"]+)"`, 'i'));
  return m?.[1] ?? null;
}

function plainFromHtml(html: string): string {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
  );
}

function stripUnsafeHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
    .trim();
}

export function buildImportedNoteHtml(args: {
  text: string;
  richHtml?: string | null;
  toc?: ImportTocEntry[] | null;
  indexTitle?: string;
}): string {
  const body = stripUnsafeHtml(args.richHtml || '') || safeHtmlParagraphs(args.text || '');
  const toc = (args.toc || []).filter((item) => item?.id && item?.title);
  if (toc.length === 0) return body;

  const tocItems = toc.map((item) => {
    const level = Math.max(1, Math.min(3, Number(item.level) || 1));
    const indent = level > 1 ? ` style="margin-left:${(level - 1) * 14}px"` : '';
    return `<li${indent}><a href="#${escapeHtml(item.id)}">${escapeHtml(item.title)}</a></li>`;
  }).join('');
  const title = escapeHtml(args.indexTitle || 'Index');
  return `<details open><summary><strong>${title}</strong></summary><ol>${tocItems}</ol></details>${body}`;
}

export function buildTranscriptionBlockHtml(args: TranscriptionBlockArgs): string {
  const text = truncateBlockText(normalizeBlockText(args.text));
  if (!text) return '';
  const sourceLabel = BLOCK_SOURCE_LABEL[args.source];
  const heading = escapeHtml(args.title?.trim() || `${sourceLabel} Transcription`);
  const metaParts = [
    `Source: ${sourceLabel}`,
    args.language ? `Lang: ${args.language}` : null,
    args.diarization == null ? null : `Diarization: ${args.diarization ? 'on' : 'off'}`,
    args.segments?.length ? `Segments: ${args.segments.length}` : null,
  ].filter(Boolean) as string[];
  const metaLine = escapeHtml(metaParts.join(' • '));
  const audioLink = args.audioUrl
    ? `<p class="wa-transcription-link"><a href="${safeAttr(args.audioUrl)}" target="_blank" rel="noopener noreferrer">Open audio</a></p>`
    : '';
  const blockAttr = args.blockId ? ` data-block-id="${safeAttr(args.blockId)}"` : '';
  return [
    `<section data-whisperall-block="transcription" data-source="${safeAttr(args.source)}"${blockAttr} class="wa-transcription-block">`,
    `<h3>${heading}</h3>`,
    `<p class="wa-transcription-meta">${metaLine}</p>`,
    audioLink,
    '<div class="wa-transcription-body">',
    safeHtmlParagraphs(text),
    '</div>',
    '</section>',
    '<p><br></p>',
  ].join('');
}

export function extractTranscriptionBlocksFromHtml(html: string): ParsedTranscriptionBlock[] {
  const blocks: ParsedTranscriptionBlock[] = [];
  const re = /<section\b([^>]*)data-whisperall-block="transcription"([^>]*)>([\s\S]*?)<\/section>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const attrs = `${match[1] ?? ''} ${match[2] ?? ''}`;
    const body = match[3] ?? '';
    const source = getAttr(attrs, 'data-source') ?? 'audio';
    const blockId = getAttr(attrs, 'data-block-id');
    const title = plainFromHtml((body.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i)?.[1] ?? '')).trim();
    const textHtml = body.match(/<div[^>]*class="[^"]*wa-transcription-body[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? '';
    const text = plainFromHtml(textHtml);
    blocks.push({ blockId, source, title, text });
  }
  return blocks;
}

export function replaceTranscriptionBlockInHtml(html: string, blockId: string, replacementSectionHtml: string): string {
  const re = /<section\b[^>]*data-whisperall-block="transcription"[^>]*>[\s\S]*?<\/section>/gi;
  let replaced = false;
  return html.replace(re, (section) => {
    if (replaced) return section;
    const sectionBlockId = section.match(/data-block-id="([^"]+)"/i)?.[1] ?? null;
    if (sectionBlockId !== blockId) return section;
    replaced = true;
    return replacementSectionHtml;
  });
}
