// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderCombinedNotes, renderSingleNote } from '../../src/lib/export';

describe('export renderer', () => {
  it('renders combined txt export with note sections', () => {
    const rendered = renderCombinedNotes(
      'Calls 2026-02-11',
      [
        { title: 'Call A', html: '<p>Hello world</p>' },
        { title: 'Call B', html: '<p>Second note</p>' },
      ],
      'txt',
    );

    expect(rendered).not.toBeNull();
    expect(rendered?.filename).toBe('Calls 2026-02-11.txt');
    expect(rendered?.content).toContain('Notes: 2');
    expect(rendered?.content).toContain('[1] Call A');
    expect(rendered?.content).toContain('Hello world');
    expect(rendered?.content).toContain('[2] Call B');
  });

  it('renders combined markdown export with headings', () => {
    const rendered = renderCombinedNotes(
      'Bundle',
      [
        { title: 'Uno', html: '<p>Hola</p>' },
        { title: 'Dos', html: '<p>Mundo</p>' },
      ],
      'md',
    );

    expect(rendered).not.toBeNull();
    expect(rendered?.filename).toBe('Bundle.md');
    expect(rendered?.content).toContain('# Bundle');
    expect(rendered?.content).toContain('## 1. Uno');
    expect(rendered?.content).toContain('## 2. Dos');
  });

  it('returns null when combined export has no notes', () => {
    const rendered = renderCombinedNotes('Empty', [], 'txt');
    expect(rendered).toBeNull();
  });

  it('renders single pdf export as printable html', () => {
    const rendered = renderSingleNote('Single', '<p>Body</p>', 'pdf');
    expect(rendered.filename).toBe('Single.pdf');
    expect(rendered.printHtml).toContain('<h1>Single</h1>');
    expect(rendered.printHtml).toContain('<p>Body</p>');
  });
});

