import { $prose } from '@milkdown/utils';
import { Plugin, PluginKey, TextSelection } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';
import type { EditorState, Transaction } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';

/**
 * In-note word search (Ctrl/Cmd + F).
 *
 * Opens a floating search bar docked to the top-right of the editor,
 * paints yellow highlights over every match in the document, and lets
 * the user jump between matches with Enter / Shift+Enter or the
 * up/down buttons.
 *
 * Implementation:
 *  - A plugin-level `state` carries `{ query, currentIndex, matches }`.
 *    All three are updated via `tr.setMeta(KEY, …)` dispatches.
 *  - `buildDecorations` scans the doc's textContent for non-overlapping
 *    case-insensitive matches of `query`. Each match becomes a
 *    `Decoration.inline` with class `wa-ws-match`; the current one
 *    additionally gets `wa-ws-current`.
 *  - A DOM `<div class="wa-ws-toolbar">` is rendered once at mount (via
 *    `view()` hook) and toggled via `display: none` based on state.
 *  - Keymap: Ctrl/Cmd+F opens, Escape closes, Enter next, Shift+Enter
 *    previous.
 *
 * Nothing touches the document — decorations only. History and markdown
 * serialization are untouched.
 */

const KEY = new PluginKey<SearchState>('wa-word-search');

type SearchState = {
  open: boolean;
  query: string;
  matches: Array<{ from: number; to: number }>;
  currentIndex: number;
};

function initialState(): SearchState {
  return { open: false, query: '', matches: [], currentIndex: 0 };
}

function findMatches(state: EditorState, query: string): SearchState['matches'] {
  if (!query) return [];
  const matches: SearchState['matches'] = [];
  const q = query.toLowerCase();
  const qLen = q.length;
  // Walk every text node and collect absolute positions of matches.
  state.doc.descendants((node, pos) => {
    if (!node.isText) return;
    const text = (node.text ?? '').toLowerCase();
    let offset = 0;
    while (offset <= text.length - qLen) {
      const hit = text.indexOf(q, offset);
      if (hit < 0) break;
      matches.push({ from: pos + hit, to: pos + hit + qLen });
      offset = hit + qLen;
    }
  });
  return matches;
}

function buildDecorations(state: EditorState, data: SearchState): DecorationSet {
  if (!data.open || data.matches.length === 0) return DecorationSet.empty;
  const decos: Decoration[] = data.matches.map((m, i) =>
    Decoration.inline(m.from, m.to, {
      class: i === data.currentIndex ? 'wa-ws-match wa-ws-current' : 'wa-ws-match',
    }),
  );
  return DecorationSet.create(state.doc, decos);
}

function makeToolbar(view: EditorView): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'wa-ws-toolbar';
  wrap.setAttribute('contenteditable', 'false');
  wrap.style.display = 'none';
  wrap.innerHTML = `
    <span class="material-symbols-outlined wa-ws-icon">search</span>
    <input type="search" class="wa-ws-input" aria-label="Find in note" placeholder="Find" spellcheck="false" />
    <span class="wa-ws-count" data-testid="wa-ws-count">0/0</span>
    <button type="button" class="wa-ws-btn" data-action="prev" title="Previous (Shift+Enter)" aria-label="Previous match">
      <span class="material-symbols-outlined">keyboard_arrow_up</span>
    </button>
    <button type="button" class="wa-ws-btn" data-action="next" title="Next (Enter)" aria-label="Next match">
      <span class="material-symbols-outlined">keyboard_arrow_down</span>
    </button>
    <button type="button" class="wa-ws-btn" data-action="close" title="Close (Esc)" aria-label="Close search">
      <span class="material-symbols-outlined">close</span>
    </button>
  `;
  const input = wrap.querySelector<HTMLInputElement>('.wa-ws-input')!;
  const count = wrap.querySelector<HTMLSpanElement>('.wa-ws-count')!;

  // Input → update query and recompute matches via meta-tagged tr.
  input.addEventListener('input', () => {
    const query = input.value;
    const matches = findMatches(view.state, query);
    view.dispatch(view.state.tr.setMeta(KEY, { kind: 'setQuery', query, matches }));
  });
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      const step = e.shiftKey ? -1 : 1;
      view.dispatch(view.state.tr.setMeta(KEY, { kind: 'step', step }));
    } else if (e.key === 'Escape') {
      e.preventDefault();
      view.dispatch(view.state.tr.setMeta(KEY, { kind: 'close' }));
      view.focus();
    }
  });

  wrap.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'prev') {
      view.dispatch(view.state.tr.setMeta(KEY, { kind: 'step', step: -1 }));
    } else if (action === 'next') {
      view.dispatch(view.state.tr.setMeta(KEY, { kind: 'step', step: 1 }));
    } else if (action === 'close') {
      view.dispatch(view.state.tr.setMeta(KEY, { kind: 'close' }));
      view.focus();
    }
    input.focus();
  });

  // Prevent PM from stealing the mouse/keyboard while the toolbar has focus.
  ['mousedown', 'click', 'keydown'].forEach((evt) => {
    wrap.addEventListener(evt, (e) => e.stopPropagation());
  });

  return Object.assign(wrap, { _input: input, _count: count } as unknown as {});
}

function renderToolbar(root: HTMLElement, data: SearchState): void {
  root.style.display = data.open ? 'flex' : 'none';
  const input = root.querySelector<HTMLInputElement>('.wa-ws-input');
  const count = root.querySelector<HTMLSpanElement>('.wa-ws-count');
  if (input && input.value !== data.query) input.value = data.query;
  if (count) {
    if (!data.query) count.textContent = '0/0';
    else count.textContent = `${data.matches.length === 0 ? 0 : data.currentIndex + 1}/${data.matches.length}`;
  }
}

/**
 * Scroll the view so the current match is visible. We use a simple
 * "select the match range, then dispatch a scroll transaction" trick —
 * PM's scrollIntoView respects the selection anchor.
 */
function scrollToCurrent(view: EditorView, data: SearchState): void {
  const match = data.matches[data.currentIndex];
  if (!match) return;
  const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, match.from, match.to)).scrollIntoView();
  tr.setMeta('addToHistory', false);
  tr.setMeta(KEY, { kind: 'noop' });
  view.dispatch(tr);
}

export const wordSearch = $prose(
  () =>
    new Plugin<SearchState>({
      key: KEY,
      state: {
        init: () => initialState(),
        apply(tr, prev, _oldState, newState) {
          const meta = tr.getMeta(KEY) as
            | { kind: 'open' }
            | { kind: 'close' }
            | { kind: 'setQuery'; query: string; matches: SearchState['matches'] }
            | { kind: 'step'; step: number }
            | { kind: 'noop' }
            | undefined;
          let next: SearchState = prev;
          if (meta?.kind === 'open') {
            next = { ...prev, open: true };
          } else if (meta?.kind === 'close') {
            next = { ...prev, open: false };
          } else if (meta?.kind === 'setQuery') {
            next = { ...prev, query: meta.query, matches: meta.matches, currentIndex: 0 };
          } else if (meta?.kind === 'step' && prev.matches.length > 0) {
            const n = prev.matches.length;
            const idx = (prev.currentIndex + meta.step + n) % n;
            next = { ...prev, currentIndex: idx };
          }
          // If the doc changed while open, re-run the search so matches
          // stay accurate. Cheap for typical note sizes.
          if (tr.docChanged && next.open && next.query) {
            next = { ...next, matches: findMatches(newState, next.query), currentIndex: 0 };
          }
          return next;
        },
      },
      props: {
        decorations(state) {
          const data = KEY.getState(state);
          if (!data) return null;
          return buildDecorations(state, data);
        },
        handleKeyDown(view, event) {
          const isFind = (event.key === 'f' || event.key === 'F') && (event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey;
          if (isFind) {
            event.preventDefault();
            view.dispatch(view.state.tr.setMeta(KEY, { kind: 'open' }));
            // Focus the toolbar's input on next frame so the state flip
            // has rendered first.
            requestAnimationFrame(() => {
              const input = view.dom.parentElement?.querySelector<HTMLInputElement>('.wa-ws-toolbar .wa-ws-input');
              input?.focus();
              input?.select();
            });
            return true;
          }
          if (event.key === 'Escape') {
            const data = KEY.getState(view.state);
            if (data?.open) {
              event.preventDefault();
              view.dispatch(view.state.tr.setMeta(KEY, { kind: 'close' }));
              view.focus();
              return true;
            }
          }
          return false;
        },
      },
      view(editorView) {
        // Mount the toolbar next to the editor. The editor's parent is
        // the `<div class="milkdown">` wrapper — we hang the toolbar off
        // of that so positioning (absolute, top-right of the wrapper)
        // is scoped and doesn't leak to other editors.
        const toolbar = makeToolbar(editorView);
        const parent = editorView.dom.parentElement ?? document.body;
        parent.style.position = parent.style.position || 'relative';
        parent.appendChild(toolbar);
        return {
          update(view, prevState) {
            const data = KEY.getState(view.state);
            const prevData = KEY.getState(prevState);
            if (!data) return;
            renderToolbar(toolbar, data);
            // Scroll only when the current match index changed while open
            // (prevents fighting the user's own scroll on every keystroke).
            if (
              data.open &&
              data.matches.length > 0 &&
              (data.currentIndex !== prevData?.currentIndex ||
                data.matches !== prevData?.matches)
            ) {
              scrollToCurrent(view, data);
            }
          },
          destroy() {
            toolbar.remove();
          },
        };
      },
    }),
);

// Silence the Transaction import being "unused" in some TS configs.
export type _Tr = Transaction;
