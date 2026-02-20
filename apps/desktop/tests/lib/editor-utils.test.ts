import { describe, expect, it } from 'vitest';
import { buildTranscriptionBlockHtml, extractTranscriptionBlocksFromHtml, replaceTranscriptionBlockInHtml } from '../../src/lib/editor-utils';

describe('editor-utils transcription block', () => {
  it('builds transcription block html with source metadata', () => {
    const html = buildTranscriptionBlockHtml({
      blockId: 'block-1',
      source: 'audio',
      title: 'Audio Call',
      text: 'Hello world',
      language: 'es',
      diarization: true,
      audioUrl: 'https://example.com/call.mp3',
      segments: [{ text: 'Hello world', speaker: 'Speaker 1', start: 0, end: 1 }],
    });

    expect(html).toContain('data-whisperall-block="transcription"');
    expect(html).toContain('data-source="audio"');
    expect(html).toContain('data-block-id="block-1"');
    expect(html).toContain('Audio Call');
    expect(html).toContain('Source: Audio');
    expect(html).toContain('Lang: es');
    expect(html).toContain('Diarization: on');
    expect(html).toContain('Segments: 1');
    expect(html).toContain('https://example.com/call.mp3');
    expect(html).toContain('<p>Hello world</p>');
  });

  it('escapes html in text and title', () => {
    const html = buildTranscriptionBlockHtml({
      source: 'mic',
      title: '<script>bad</script>',
      text: 'Hi <b>there</b>',
    });

    expect(html).toContain('&lt;script&gt;bad&lt;/script&gt;');
    expect(html).toContain('Hi &lt;b&gt;there&lt;/b&gt;');
    expect(html).not.toContain('<script>');
  });

  it('returns empty string when there is no text', () => {
    const html = buildTranscriptionBlockHtml({ source: 'system', text: '   ' });
    expect(html).toBe('');
  });

  it('extracts transcription blocks from html', () => {
    const html = [
      '<p>Intro</p>',
      buildTranscriptionBlockHtml({ blockId: 'a', source: 'mic', title: 'Mic One', text: 'Hello mic' }),
      buildTranscriptionBlockHtml({ blockId: 'b', source: 'audio', title: 'Audio One', text: 'Hello audio' }),
    ].join('');
    const blocks = extractTranscriptionBlocksFromHtml(html);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ blockId: 'a', source: 'mic', title: 'Mic One', text: 'Hello mic' });
    expect(blocks[1]).toMatchObject({ blockId: 'b', source: 'audio', title: 'Audio One', text: 'Hello audio' });
  });

  it('replaces a block by id in html', () => {
    const original = [
      '<p>Intro</p>',
      buildTranscriptionBlockHtml({ blockId: 'a', source: 'mic', title: 'Mic One', text: 'Old text' }),
      '<p>Outro</p>',
    ].join('');
    const replacement = buildTranscriptionBlockHtml({ blockId: 'a', source: 'mic', title: 'Mic One', text: 'New text' }).replace('<p><br></p>', '');
    const next = replaceTranscriptionBlockInHtml(original, 'a', replacement);
    expect(next).toContain('New text');
    expect(next).not.toContain('Old text');
  });
});
