import type { EditorView } from '@milkdown/prose/view';

/**
 * Imperative API exposed by MilkdownEditor via forwardRef/useImperativeHandle.
 * Replaces the TipTap `Editor` object that call sites used to reach into.
 *
 * Access `view` directly as an escape hatch for anything not covered here
 * (e.g. ProseMirror transactions for the typewriter reveal animation).
 */
export interface EditorHandle {
  /** Raw ProseMirror view — used by lib/debate-context and typewriter for DOM access. */
  readonly view: EditorView;

  // ── content ──────────────────────────────────────
  getMarkdown(): string;
  setMarkdown(md: string, opts?: { emitChange?: boolean }): void;
  getText(): string;

  // ── selection ─────────────────────────────────────
  isSelectionEmpty(): boolean;
  getSelectedText(): string;
  selectAll(): void;
  deleteSelection(): void;
  focus(): void;

  // ── insertion ─────────────────────────────────────
  /** Insert markdown at the current cursor / selection. */
  insertMarkdown(md: string): void;
  /** Insert markdown at an absolute ProseMirror position. */
  insertMarkdownAt(pos: number, md: string): void;
  /** Insert markdown at the start of the document. */
  insertMarkdownAtStart(md: string): void;
  /** Insert markdown at the end of the document. */
  insertMarkdownAtEnd(md: string): void;
  /** Escape hatch: insert raw HTML at cursor. Only the typewriter uses this
   *  to inject <span class="wa-reveal">word</span> nodes that are immediately
   *  animated via CSS and never persisted. */
  insertHtmlAtCursor(html: string): void;
  /** Insert raw HTML at an absolute ProseMirror position — used by DebatePanel
   *  to inject AI-suggested HTML at anchors found via `view.state.doc.descendants`. */
  insertHtmlAt(pos: number, html: string): void;

  // ── history ───────────────────────────────────────
  undo(): boolean;

  // ── formatting state + commands ───────────────────
  isActive(
    name:
      | 'bold'
      | 'italic'
      | 'underline'
      | 'highlight'
      | 'code'
      | 'blockquote'
      | 'bulletList'
      | 'orderedList'
      | 'codeBlock'
      | 'strike'
      | 'heading',
    attrs?: Record<string, unknown>,
  ): boolean;
  toggle(mark: 'bold' | 'italic' | 'underline' | 'highlight' | 'strike' | 'code'): void;
  toggleBlock(
    block: 'heading' | 'blockquote' | 'bulletList' | 'orderedList' | 'codeBlock',
    attrs?: Record<string, unknown>,
  ): void;
  setHorizontalRule(): void;
}
