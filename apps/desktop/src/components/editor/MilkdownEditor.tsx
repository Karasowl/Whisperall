import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, type MouseEventHandler } from 'react';
import {
  Editor as MilkdownCore,
  rootCtx,
  defaultValueCtx,
  editorViewCtx,
  commandsCtx,
  serializerCtx,
  parserCtx,
} from '@milkdown/core';
import { commonmark, toggleStrongCommand, toggleEmphasisCommand, toggleInlineCodeCommand, wrapInBlockquoteCommand, wrapInOrderedListCommand, wrapInBulletListCommand, wrapInHeadingCommand, createCodeBlockCommand, insertHrCommand, turnIntoTextCommand } from '@milkdown/preset-commonmark';
import { gfm, toggleStrikethroughCommand } from '@milkdown/preset-gfm';
import { history, undoCommand } from '@milkdown/plugin-history';
import { listener, listenerCtx } from '@milkdown/plugin-listener';
import { clipboard } from '@milkdown/plugin-clipboard';
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react';
import { callCommand } from '@milkdown/utils';
import type { EditorView } from '@milkdown/prose/view';
import { Slice, DOMParser as PmDOMParser } from '@milkdown/prose/model';
import { TextSelection } from '@milkdown/prose/state';
import type { EditorHandle } from './milkdown/api/EditorHandle';
import { htmlToMarkdown, looksLikeHtmlNote } from './milkdown/compat/htmlToMarkdown';
import { revealMark } from './milkdown/schema/revealMark';
import { transcriptionBlock, transcriptionBody } from './milkdown/schema/transcriptionBlock';
import { livePreview } from './milkdown/plugins/livePreview';
import { codeBlockExit } from './milkdown/plugins/codeBlockExit';
import { codeBlockHighlight } from './milkdown/plugins/codeBlockHighlight';
import { wordSearch } from './milkdown/plugins/wordSearch';

type Props = {
  content: string;
  onChange: (markdown: string, text: string) => void;
  placeholder?: string;
  onEditorReady?: (handle: EditorHandle) => void;
  onReadSelection?: (text: string) => void;
  onAiSelection?: (text: string) => void;
  onContextMenu?: MouseEventHandler<HTMLDivElement>;
};

function normalizeContent(raw: string): string {
  if (!raw) return '';
  if (looksLikeHtmlNote(raw)) return htmlToMarkdown(raw);
  return raw;
}

/** Inner component — must live inside MilkdownProvider to use useEditor hook. */
const Inner = forwardRef<EditorHandle, Props>(function Inner(
  { content, onChange, placeholder, onEditorReady },
  ref,
) {
  const initialMd = useMemo(() => normalizeContent(content), []); // eslint-disable-line react-hooks/exhaustive-deps
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const suppressEmitRef = useRef(false);

  const { get } = useEditor((root) =>
    MilkdownCore.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, initialMd);
        ctx.get(listenerCtx).markdownUpdated((_ctx, markdown, prevMarkdown) => {
          if (suppressEmitRef.current) { suppressEmitRef.current = false; return; }
          if (markdown === prevMarkdown) return;
          const view = _ctx.get(editorViewCtx);
          const text = view.state.doc.textContent;
          onChangeRef.current(markdown, text);
        });
      })
      .use(commonmark)
      .use(gfm)
      .use(history)
      .use(listener)
      .use(clipboard)
      .use(revealMark)
      .use(transcriptionBlock)
      .use(transcriptionBody)
      .use(livePreview)
      .use(codeBlockExit)
      .use(codeBlockHighlight)
      .use(wordSearch),
  );

  // Build and expose the EditorHandle once the underlying Milkdown Editor is ready.
  useImperativeHandle(ref, () => {
    const editor = get();
    if (!editor) {
      // useImperativeHandle is called before the editor promise resolves; return
      // a stub that throws so callers know to wait for onEditorReady. In
      // practice onEditorReady is the right hook.
      return makeStubHandle();
    }
    return makeHandle(editor, suppressEmitRef);
  }, [get]);

  // Fire onEditorReady only after the editorView context is actually populated
  // (Milkdown initializes the view asynchronously, separate from the Editor
  // object existing). If we expose the handle too early, consumers that call
  // `handle.isSelectionEmpty()` or `handle.view` hit
  // `MilkdownError: Context "editorView" not found`.
  const readyFiredRef = useRef(false);
  useEffect(() => {
    if (readyFiredRef.current) return;
    const interval = setInterval(() => {
      const editor = get();
      if (!editor) return;
      try {
        // This throws until the view is registered — our gate.
        editor.ctx.get(editorViewCtx);
      } catch { return; }
      const handle = makeHandle(editor, suppressEmitRef);
      readyFiredRef.current = true;
      onEditorReady?.(handle);
      clearInterval(interval);
    }, 16);
    return () => clearInterval(interval);
  }, [get, onEditorReady]);

  // React to parent content changes (e.g. switching notes).
  useEffect(() => {
    const editor = get();
    if (!editor) return;
    try {
      const view: EditorView = editor.ctx.get(editorViewCtx);
      const parser = editor.ctx.get(parserCtx);
      const serializer = editor.ctx.get(serializerCtx);
      const nextMd = normalizeContent(content);
      const currentMd = serializer(view.state.doc);
      if (nextMd === currentMd) return;
      suppressEmitRef.current = true;
      const nextDoc = parser(nextMd);
      if (!nextDoc) return;
      const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, nextDoc.content);
      view.dispatch(tr);
    } catch { /* editor still initializing */ }
  }, [content, get]);

  // Internal handle ref so the inline toolbar can call editor commands.
  const toolbarHandleRef = useRef<EditorHandle | null>(null);
  useEffect(() => {
    if (readyFiredRef.current) toolbarHandleRef.current = null;
    const t = setInterval(() => {
      const editor = get();
      if (!editor) return;
      try { editor.ctx.get(editorViewCtx); } catch { return; }
      toolbarHandleRef.current = makeHandle(editor, suppressEmitRef);
      clearInterval(t);
    }, 16);
    return () => clearInterval(t);
  }, [get]);

  // CSS-only placeholder: when the editor is empty, the first (and only)
  // <p> in the ProseMirror doc has an `::after` pseudo-element printing
  // the placeholder text. Toggling via a `data-empty` attribute on the
  // wrapper avoids a React render cycle per keystroke. We lean on
  // `textContent` length because Milkdown's serializer emits `<p></p>`
  // (no `<br>`) for an empty doc.
  const wrapperRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const pm = el.querySelector('.ProseMirror');
    if (!pm) return;
    const sync = () => {
      const isEmpty = (pm.textContent?.trim().length ?? 0) === 0;
      el.toggleAttribute('data-empty', isEmpty);
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(pm, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  });

  return (
    <div ref={wrapperRef} data-placeholder={placeholder ?? ''} className="wa-milkdown-wrapper">
      <InlineToolbar handleRef={toolbarHandleRef} />
      <Milkdown />
    </div>
  );
});

function InlineToolbar({ handleRef }: { handleRef: React.RefObject<EditorHandle | null> }) {
  const h = () => handleRef.current;
  const btn = 'p-1.5 rounded-md transition-colors text-muted hover:text-text hover:bg-white/5';
  return (
    <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-edge bg-surface/50 flex-wrap" data-testid="editor-toolbar">
      <button onClick={() => h()?.toggle('bold')} className={btn} title="Bold (Ctrl+B)">
        <span className="material-symbols-outlined text-[18px]">format_bold</span>
      </button>
      <button onClick={() => h()?.toggle('italic')} className={btn} title="Italic (Ctrl+I)">
        <span className="material-symbols-outlined text-[18px]">format_italic</span>
      </button>
      <button onClick={() => h()?.toggle('strike')} className={btn} title="Strikethrough">
        <span className="material-symbols-outlined text-[18px]">format_strikethrough</span>
      </button>
      <span className="w-px h-5 bg-edge mx-1" />
      <button onClick={() => h()?.toggleBlock('heading', { level: 1 })} className={btn} title="Heading 1">
        <span className="material-symbols-outlined text-[18px]">format_h1</span>
      </button>
      <button onClick={() => h()?.toggleBlock('heading', { level: 2 })} className={btn} title="Heading 2">
        <span className="material-symbols-outlined text-[18px]">format_h2</span>
      </button>
      <button onClick={() => h()?.toggleBlock('heading', { level: 3 })} className={btn} title="Heading 3">
        <span className="material-symbols-outlined text-[18px]">format_h3</span>
      </button>
      <button onClick={() => h()?.toggleBlock('bulletList')} className={btn} title="Bullet list">
        <span className="material-symbols-outlined text-[18px]">format_list_bulleted</span>
      </button>
      <button onClick={() => h()?.toggleBlock('orderedList')} className={btn} title="Numbered list">
        <span className="material-symbols-outlined text-[18px]">format_list_numbered</span>
      </button>
      <button onClick={() => h()?.toggleBlock('blockquote')} className={btn} title="Quote">
        <span className="material-symbols-outlined text-[18px]">format_quote</span>
      </button>
      <span className="w-px h-5 bg-edge mx-1" />
      <button onClick={() => h()?.toggleBlock('codeBlock')} className={btn} title="Code block (Ctrl+Enter to exit)">
        <span className="material-symbols-outlined text-[18px]">code_blocks</span>
      </button>
      <button onClick={() => h()?.setHorizontalRule()} className={btn} title="Divider">
        <span className="material-symbols-outlined text-[18px]">horizontal_rule</span>
      </button>
    </div>
  );
}

export const MilkdownEditor = forwardRef<EditorHandle, Props>(function MilkdownEditor(props, ref) {
  const { onContextMenu } = props;
  return (
    <MilkdownProvider>
      <div className="prose-editor bg-surface border border-edge rounded-xl overflow-hidden" data-testid="milkdown-editor" onContextMenu={onContextMenu}>
        <Inner {...props} ref={ref} />
      </div>
    </MilkdownProvider>
  );
});

// ── EditorHandle factory ────────────────────────────────────────────

/** Returned by useImperativeHandle BEFORE the Milkdown editor finishes
 *  initializing its view context. All read methods return safe empty defaults
 *  so consumers that probe during render don't crash. Write methods no-op. */
function makeStubHandle(): EditorHandle {
  const err = () => { throw new Error('Editor not yet initialized — use onEditorReady callback.'); };
  return {
    get view() { throw new Error('editor view unavailable'); },
    getMarkdown: () => '',
    setMarkdown: () => {},
    getText: () => '',
    isSelectionEmpty: () => true,
    getSelectedText: () => '',
    selectAll: () => {},
    deleteSelection: () => {},
    focus: () => {},
    insertMarkdown: () => {},
    insertMarkdownAt: () => {},
    insertMarkdownAtStart: () => {},
    insertMarkdownAtEnd: () => {},
    insertHtmlAtCursor: () => {},
    insertHtmlAt: () => {},
    undo: () => false,
    isActive: () => false,
    toggle: () => {},
    toggleBlock: () => {},
    setHorizontalRule: err,
  } as unknown as EditorHandle;
}

function makeHandle(editor: MilkdownCore, suppressEmitRef: { current: boolean }): EditorHandle {
  // All ctx lookups are wrapped so that if the view is momentarily
  // un-registered (teardown / remount), consumers get a safe stub instead
  // of `MilkdownError: Context "editorView" not found`.
  const tryView = (): EditorView | null => {
    try { return editor.ctx.get(editorViewCtx); } catch { return null; }
  };
  const view = () => {
    const v = tryView();
    if (!v) throw new Error('editor view unavailable');
    return v;
  };
  const serializer = () => editor.ctx.get(serializerCtx);
  const parser = () => editor.ctx.get(parserCtx);
  const runCommand = (key: unknown, payload?: unknown) => {
    editor.action(callCommand(key as Parameters<typeof callCommand>[0], payload));
  };

  return {
    // Defensive: if the view isn't mounted yet, return a proxy that throws
    // lazily on access so callers can feature-detect via try/catch.
    get view() {
      const v = tryView();
      if (!v) throw new Error('editor view unavailable');
      return v;
    },
    getMarkdown() {
      const v = tryView();
      if (!v) return '';
      return serializer()(v.state.doc);
    },
    setMarkdown(md: string, opts?: { emitChange?: boolean }) {
      const v = view();
      const nextDoc = parser()(normalizeContent(md));
      if (!nextDoc) return;
      if (opts?.emitChange === false) suppressEmitRef.current = true;
      const tr = v.state.tr.replaceWith(0, v.state.doc.content.size, nextDoc.content);
      v.dispatch(tr);
    },
    getText() {
      const v = tryView();
      return v ? v.state.doc.textContent : '';
    },
    isSelectionEmpty() {
      const v = tryView();
      if (!v) return true;
      const sel = v.state.selection;
      return sel.from === sel.to;
    },
    getSelectedText() {
      const v = tryView();
      if (!v) return '';
      const { from, to } = v.state.selection;
      if (from === to) return '';
      return v.state.doc.textBetween(from, to, ' ').trim();
    },
    selectAll() {
      const v = view();
      // PM: select all via command-k style isn't in commonmark preset; dispatch directly.
      const { state } = v;
      const tr = state.tr.setSelection(TextSelection.create(state.doc, 0, state.doc.content.size));
      v.dispatch(tr);
      v.focus();
    },
    deleteSelection() {
      const v = view();
      v.dispatch(v.state.tr.deleteSelection());
    },
    focus() { view().focus(); },
    insertMarkdown(md: string) {
      const v = view();
      const slice = markdownToSlice(md, parser(), v);
      if (!slice) return;
      v.dispatch(v.state.tr.replaceSelection(slice));
    },
    insertMarkdownAt(pos: number, md: string) {
      const v = view();
      const slice = markdownToSlice(md, parser(), v);
      if (!slice) return;
      v.dispatch(v.state.tr.replace(pos, pos, slice));
    },
    insertMarkdownAtStart(md: string) {
      this.insertMarkdownAt(0, md);
    },
    insertMarkdownAtEnd(md: string) {
      this.insertMarkdownAt(view().state.doc.content.size, md);
    },
    insertHtmlAtCursor(html: string) {
      const v = view();
      const container = document.createElement('div');
      container.innerHTML = html;
      const slice = PmDOMParser.fromSchema(v.state.schema).parseSlice(container);
      v.dispatch(v.state.tr.replaceSelection(slice));
    },
    insertHtmlAt(pos: number, html: string) {
      const v = view();
      const container = document.createElement('div');
      container.innerHTML = html;
      const slice = PmDOMParser.fromSchema(v.state.schema).parseSlice(container);
      v.dispatch(v.state.tr.replace(pos, pos, slice));
    },
    undo() {
      try { runCommand(undoCommand.key); return true; } catch { return false; }
    },
    isActive(name, _attrs) {
      const v = view();
      const { schema } = v.state;
      const markType = schema.marks[markNameToMilkdown(name)];
      const nodeType = schema.nodes[nodeNameToMilkdown(name)];
      if (markType) {
        const { from, $from, to, empty } = v.state.selection;
        if (empty) return !!markType.isInSet(v.state.storedMarks || $from.marks());
        return v.state.doc.rangeHasMark(from, to, markType);
      }
      if (nodeType) {
        const { $from } = v.state.selection;
        for (let d = $from.depth; d >= 0; d--) {
          if ($from.node(d).type === nodeType) return true;
        }
      }
      return false;
    },
    toggle(mark) {
      switch (mark) {
        case 'bold': runCommand(toggleStrongCommand.key); break;
        case 'italic': runCommand(toggleEmphasisCommand.key); break;
        case 'code': runCommand(toggleInlineCodeCommand.key); break;
        case 'strike': runCommand(toggleStrikethroughCommand.key); break;
        case 'underline':
        case 'highlight':
          // Not provided by commonmark/gfm presets — no-op placeholder until
          // we add custom marks in a later step.
          break;
      }
    },
    toggleBlock(block, attrs) {
      switch (block) {
        case 'heading': runCommand(wrapInHeadingCommand.key, (attrs?.level as number) ?? 2); break;
        case 'blockquote': runCommand(wrapInBlockquoteCommand.key); break;
        case 'bulletList': runCommand(wrapInBulletListCommand.key); break;
        case 'orderedList': runCommand(wrapInOrderedListCommand.key); break;
        case 'codeBlock': {
          // Real toggle: if we're already inside a fence, lift the block
          // back to paragraph so the user can disable the formatting with
          // the same button that created it. Matches every other block
          // toolbar idiom in Notion / Obsidian / Bear.
          const v = tryView();
          const inFence = v ? (() => {
            const { $from } = v.state.selection;
            for (let d = $from.depth; d >= 0; d--) {
              const n = $from.node(d).type.name;
              if (n === 'fence' || n === 'code_block') return true;
            }
            return false;
          })() : false;
          if (inFence) runCommand(turnIntoTextCommand.key);
          else runCommand(createCodeBlockCommand.key);
          break;
        }
      }
    },
    setHorizontalRule() { runCommand(insertHrCommand.key); },
  };
}

function markdownToSlice(md: string, parser: (src: string) => unknown, view: EditorView): Slice | null {
  const doc = parser(md) as ReturnType<EditorView['state']['doc']['type']['createAndFill']> | null;
  if (!doc) return null;
  return new Slice((doc as { content: unknown }).content as never, 0, 0);
}

// Naming helpers: our EditorHandle uses TipTap-ish names; Milkdown uses
// different schema names. Centralized for easy maintenance.
function markNameToMilkdown(name: string): string {
  return (
    {
      bold: 'strong',
      italic: 'emphasis',
      code: 'inlineCode',
      strike: 'strike_through',
    } as Record<string, string>
  )[name] ?? name;
}
function nodeNameToMilkdown(name: string): string {
  return (
    {
      bulletList: 'bullet_list',
      orderedList: 'ordered_list',
      codeBlock: 'fence',
      blockquote: 'blockquote',
      heading: 'heading',
    } as Record<string, string>
  )[name] ?? name;
}
