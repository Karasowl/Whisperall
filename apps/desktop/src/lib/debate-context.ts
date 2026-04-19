import type { EditorHandle } from '../components/editor/milkdown/api/EditorHandle';

export type DebateContextSource = 'selection' | 'viewport' | 'full';

export type DebateContext = {
  source: DebateContextSource;
  focus: string;
  before: string;
  after: string;
  fullLength: number;
};

function compactWhitespace(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

function clip(input: string, max: number): string {
  const value = compactWhitespace(input);
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1)).trim()}...`;
}

function fallback(fullText: string, focusMax: number): DebateContext {
  return {
    source: 'full',
    focus: clip(fullText, focusMax),
    before: '',
    after: '',
    fullLength: fullText.length,
  };
}

function findScrollContainer(node: HTMLElement): HTMLElement {
  if (typeof window === 'undefined') return node;
  let current: HTMLElement | null = node;
  while (current && current !== document.body) {
    const style = window.getComputedStyle(current);
    if (style.overflowY === 'auto' || style.overflowY === 'scroll') return current;
    current = current.parentElement;
  }
  return node;
}

function visibleTextFromEditor(editor: EditorHandle, maxChars: number): string {
  if (typeof window === 'undefined' || typeof document === 'undefined') return '';
  const rootDom = editor.view.dom as HTMLElement;
  const proseRoot = (rootDom.querySelector('.ProseMirror') as HTMLElement | null) ?? rootDom;
  const scroller = findScrollContainer(proseRoot);
  const viewport = scroller.getBoundingClientRect();
  if (viewport.height < 1) return '';

  const lines: string[] = [];
  const children = Array.from(proseRoot.children) as HTMLElement[];
  for (const child of children) {
    const rect = child.getBoundingClientRect();
    if (rect.height < 1) continue;
    if (rect.bottom < viewport.top || rect.top > viewport.bottom) continue;
    const text = compactWhitespace(child.textContent ?? '');
    if (!text) continue;
    lines.push(text);
    if (lines.join(' ').length >= maxChars) break;
  }
  return clip(lines.join('\n'), maxChars);
}

export function extractDebateContext(
  editor: EditorHandle | null,
  fallbackText: string,
  opts?: { focusMax?: number; sideMax?: number },
): DebateContext {
  const focusMax = opts?.focusMax ?? 2200;
  const sideMax = opts?.sideMax ?? 900;
  const fullText = compactWhitespace(editor?.getText() || fallbackText || '');
  if (!fullText) return fallback('', focusMax);
  if (!editor) return fallback(fullText, focusMax);

  const { from, to } = editor.view.state.selection;
  if (from !== to) {
    const selected = compactWhitespace(editor.view.state.doc.textBetween(from, to, ' '));
    if (selected) {
      const beforeFrom = Math.max(0, from - sideMax * 2);
      const afterTo = Math.min(editor.view.state.doc.content.size, to + sideMax * 2);
      return {
        source: 'selection',
        focus: clip(selected, focusMax),
        before: clip(editor.view.state.doc.textBetween(beforeFrom, from, ' '), sideMax),
        after: clip(editor.view.state.doc.textBetween(to, afterTo, ' '), sideMax),
        fullLength: fullText.length,
      };
    }
  }

  const visible = visibleTextFromEditor(editor, focusMax);
  if (visible) {
    const probe = visible.slice(0, Math.min(70, visible.length)).toLowerCase();
    const idx = fullText.toLowerCase().indexOf(probe);
    if (idx >= 0) {
      return {
        source: 'viewport',
        focus: visible,
        before: clip(fullText.slice(Math.max(0, idx - sideMax * 2), idx), sideMax),
        after: clip(fullText.slice(idx + visible.length, idx + visible.length + sideMax * 2), sideMax),
        fullLength: fullText.length,
      };
    }
    return { source: 'viewport', focus: visible, before: '', after: '', fullLength: fullText.length };
  }

  return fallback(fullText, focusMax);
}
