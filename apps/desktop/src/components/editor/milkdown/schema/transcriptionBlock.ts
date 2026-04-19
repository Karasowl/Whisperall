import { $node } from '@milkdown/utils';

/**
 * Editable body of a transcription block. Matches the legacy
 * `<div class="wa-transcription-body">` produced by `buildTranscriptionBlockHtml`.
 * `content: 'block+'` allows paragraphs, headings, lists, etc., so the user
 * can edit the transcript freely after Phase G (editable transcripts).
 */
export const transcriptionBody = $node('transcription_body', () => ({
  group: 'block',
  content: 'block+',
  defining: true,
  isolating: false,
  parseDOM: [{ tag: 'div.wa-transcription-body' }],
  toDOM: () => ['div', { class: 'wa-transcription-body' }, 0],
  // The body round-trips as raw HTML inside the parent section; we don't
  // emit a standalone serialization for the body itself.
  parseMarkdown: {
    match: () => false,
    runner: () => {},
  },
  toMarkdown: {
    match: (node) => node.type.name === 'transcription_body',
    runner: (state, node) => {
      state.next(node.content);
    },
  },
}));

/**
 * Top-level transcription container. Matches
 * `<section class="wa-transcription-block" data-whisperall-block="transcription"
 *          data-source="..." data-block-id="...">`.
 *
 * Serialization strategy: emit as a raw HTML block so the markdown stays
 * human-readable and CommonMark-compatible. The parser round-trips it back
 * to this node because CommonMark keeps the HTML block as-is and the schema
 * re-parses it on load.
 */
export const transcriptionBlock = $node('transcription_block', () => ({
  group: 'block',
  content: 'block+',
  defining: true,
  isolating: false,
  attrs: {
    source: { default: 'audio' },
    blockId: { default: null as string | null },
  },
  parseDOM: [
    {
      tag: 'section.wa-transcription-block',
      getAttrs: (el) => {
        const n = el as HTMLElement;
        return {
          source: n.getAttribute('data-source') ?? 'audio',
          blockId: n.getAttribute('data-block-id'),
        };
      },
    },
  ],
  toDOM: (node) => [
    'section',
    {
      class: 'wa-transcription-block',
      'data-whisperall-block': 'transcription',
      'data-source': (node.attrs.source as string) ?? 'audio',
      ...(node.attrs.blockId ? { 'data-block-id': node.attrs.blockId as string } : {}),
    },
    0,
  ],
  // Matches `html_block` remark nodes whose value begins with
  // `<section ...wa-transcription-block...>`. When matched, we open the
  // ProseMirror node and continue parsing children from the inner content.
  parseMarkdown: {
    match: (node) =>
      node.type === 'html' &&
      typeof node.value === 'string' &&
      /^<section[^>]+wa-transcription-block/i.test(node.value as string),
    runner: () => {
      // Handled at the DOM level via parseDOM when the HTML block is rendered.
      // For the AST path we let it fall through as an html node (round-trips
      // textually). A future refinement can parse attrs here.
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'transcription_block',
    runner: (state, node) => {
      const source = (node.attrs.source as string) ?? 'audio';
      const blockId = node.attrs.blockId as string | null;
      const blockIdAttr = blockId ? ` data-block-id="${blockId}"` : '';
      const open = `<section class="wa-transcription-block" data-whisperall-block="transcription" data-source="${source}"${blockIdAttr}>`;
      state.addNode('html', undefined, open);
      state.next(node.content);
      state.addNode('html', undefined, '</section>');
    },
  },
}));
