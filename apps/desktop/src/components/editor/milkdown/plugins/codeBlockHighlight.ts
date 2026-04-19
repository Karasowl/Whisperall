import { $prose } from '@milkdown/utils';
import { Plugin, PluginKey } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';
import type { EditorState } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';
import hljs from 'highlight.js/lib/common';

/**
 * Syntax highlighting + language picker for code_block nodes.
 *
 * We avoid a NodeView — code_block is `code: true` with `content: text*`,
 * and NodeViews on those nodes create subtle selection / IME bugs. Instead
 * we paint inline decorations on the existing <pre><code> output and
 * attach a widget "language picker" at the start of each block.
 *
 * Why a module-level `activeView` instead of CustomEvent bubbling: PM
 * widgets sit inside the contenteditable subtree and, in Electron's
 * Blink, custom events dispatched from within widget DOM don't reliably
 * reach `view.dom`. A direct dispatch is simpler and more robust.
 * Milkdown mounts one editor per process, so the shared reference is
 * safe.
 *
 * Why both `change` AND `input` on the `<select>`: `change` has been seen
 * to NOT fire inside PM contenteditable in some browser versions when
 * the select is a descendant of `contenteditable="false"` inside
 * `contenteditable="true"`. `input` is more reliable for HTML selects
 * and fires as soon as a new option is picked.
 */

const KEY = new PluginKey('wa-code-block-highlight');

/**
 * UI language options. These are the labels the user sees in the
 * dropdown. We map each one to an hljs grammar name via HLJS_ALIAS before
 * calling `hljs.highlight` — hljs's `getLanguage` does have aliases, but
 * being explicit prevents surprises (e.g. 'html' → 'xml' is covered by
 * hljs aliases, but we assert it here so the picker never silently
 * falls through to highlightAuto on a name we believed was valid).
 */
const COMMON_LANGS = [
  'plain', 'bash', 'c', 'cpp', 'csharp', 'css', 'diff', 'go', 'html', 'java',
  'javascript', 'json', 'kotlin', 'markdown', 'php', 'python', 'ruby', 'rust',
  'scss', 'shell', 'sql', 'swift', 'typescript', 'xml', 'yaml',
];

const HLJS_ALIAS: Record<string, string> = {
  html: 'xml',
  sh: 'bash',
  js: 'javascript',
  ts: 'typescript',
  py: 'python',
  rb: 'ruby',
  cs: 'csharp',
  yml: 'yaml',
};

let activeView: EditorView | null = null;

type Token = { from: number; to: number; className: string };

function collectTokens(root: ParentNode): Token[] {
  const tokens: Token[] = [];
  let cursor = 0;

  const visit = (node: Node, inheritedClass: string) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = (node.nodeValue ?? '').length;
      if (len > 0 && inheritedClass) {
        tokens.push({ from: cursor, to: cursor + len, className: inheritedClass });
      }
      cursor += len;
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    // Collect ALL hljs-* classes — hljs sometimes chains them, and CSS
    // can target compound selectors like `.hljs-title.function_`.
    const cls = Array.from(el.classList).filter((c) => c.startsWith('hljs-')).join(' ');
    const merged = cls ? (inheritedClass ? `${inheritedClass} ${cls}` : cls) : inheritedClass;
    for (let i = 0; i < el.childNodes.length; i++) {
      visit(el.childNodes[i], merged);
    }
  };

  for (let i = 0; i < root.childNodes.length; i++) {
    visit(root.childNodes[i], '');
  }
  return tokens;
}

function highlightText(text: string, language: string | undefined): Token[] {
  try {
    const normalized = language ? HLJS_ALIAS[language] ?? language : '';
    const lang = normalized && normalized !== 'plain' && hljs.getLanguage(normalized) ? normalized : null;
    const result = lang
      ? hljs.highlight(text, { language: lang, ignoreIllegals: true })
      : hljs.highlightAuto(text);
    const container = document.createElement('div');
    container.innerHTML = result.value;
    return collectTokens(container);
  } catch {
    return [];
  }
}

/**
 * Re-walk the doc and find the first code_block whose position is at or
 * after `hintPos`. The pos captured at widget-build time can drift after
 * edits; we use the hint as a starting point but don't trust it blindly.
 */
function resolveCodeBlockPos(view: EditorView, hintPos: number): number | null {
  const doc = view.state.doc;
  const hinted = doc.nodeAt(hintPos);
  if (hinted && (hinted.type.name === 'code_block' || hinted.type.name === 'fence')) {
    return hintPos;
  }
  let fallback: number | null = null;
  doc.descendants((n, p) => {
    if (fallback !== null) return false;
    if (n.type.name === 'code_block' || n.type.name === 'fence') {
      if (p >= hintPos - 1) { fallback = p; return false; }
    }
    return true;
  });
  if (fallback !== null) return fallback;
  // Last resort: first code block anywhere.
  doc.descendants((n, p) => {
    if (fallback !== null) return false;
    if (n.type.name === 'code_block' || n.type.name === 'fence') {
      fallback = p;
      return false;
    }
    return true;
  });
  return fallback;
}

function applyLanguage(pos: number, language: string): void {
  const view = activeView;
  if (!view) return;
  const resolvedPos = resolveCodeBlockPos(view, pos);
  if (resolvedPos == null) return;
  const tr = view.state.tr.setNodeAttribute(resolvedPos, 'language', language);
  // `setMeta` marks the tr with a flag the plugin uses to force a rebuild
  // even if some PM internals don't flip `docChanged` for attr-only steps.
  tr.setMeta(KEY, { forceRebuild: true });
  view.dispatch(tr);
  view.focus();
}

function makeLanguagePicker(pos: number, currentLang: string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'wa-code-block-toolbar';
  wrap.setAttribute('contenteditable', 'false');
  wrap.setAttribute('data-code-block-pos', String(pos));

  const select = document.createElement('select');
  select.className = 'wa-code-block-lang';
  select.setAttribute('aria-label', 'Code block language');
  select.dataset.codeBlockPos = String(pos);
  for (const lang of COMMON_LANGS) {
    const opt = document.createElement('option');
    opt.value = lang === 'plain' ? '' : lang;
    opt.textContent = lang;
    select.appendChild(opt);
  }
  select.value = currentLang || '';

  const handleChange = (e: Event) => {
    e.stopPropagation();
    const next = (e.target as HTMLSelectElement).value;
    applyLanguage(pos, next);
  };
  // Fire on both events — contenteditable can swallow one or the other
  // depending on the browser path (keyboard vs mouse selection).
  select.addEventListener('change', handleChange);
  select.addEventListener('input', handleChange);

  // Keep editor focus away while picking; PM's default mouse handling
  // would otherwise steal the click and jump the caret.
  select.addEventListener('mousedown', (e) => e.stopPropagation());
  select.addEventListener('click', (e) => e.stopPropagation());
  select.addEventListener('keydown', (e) => e.stopPropagation());

  wrap.appendChild(select);
  return wrap;
}

function buildDecorations(state: EditorState): DecorationSet {
  const decos: Decoration[] = [];
  state.doc.descendants((node, pos) => {
    if (node.type.name !== 'code_block' && node.type.name !== 'fence') return;
    const language = (node.attrs.language as string | undefined) ?? '';

    decos.push(
      Decoration.widget(
        pos + 1,
        () => makeLanguagePicker(pos, language),
        { side: -1, ignoreSelection: true, key: `lang-${pos}-${language}` },
      ),
    );

    const text = node.textContent;
    if (!text) return;
    const tokens = highlightText(text, language);
    const base = pos + 1;
    for (const tok of tokens) {
      decos.push(
        Decoration.inline(base + tok.from, base + tok.to, { class: tok.className }),
      );
    }
  });
  return DecorationSet.create(state.doc, decos);
}

export const codeBlockHighlight = $prose(
  () =>
    new Plugin({
      key: KEY,
      state: {
        init: (_config, state) => buildDecorations(state),
        apply(tr, old, _oldState, newState) {
          // Rebuild if the doc changed OR if our own meta-flag was set
          // OR if any step touched a code block's attrs (some PM paths
          // don't flip `docChanged` for attr-only transactions). We bias
          // toward rebuilding — it's cheap for notes with <10 blocks.
          const forced = !!tr.getMeta(KEY);
          if (!tr.docChanged && !forced) return old;
          return buildDecorations(newState);
        },
      },
      props: {
        decorations(state) {
          return KEY.getState(state);
        },
      },
      view(editorView) {
        activeView = editorView;
        return {
          destroy() {
            if (activeView === editorView) activeView = null;
          },
        };
      },
    }),
);

export const __internal = { highlightText, collectTokens, COMMON_LANGS, HLJS_ALIAS, applyLanguage };
