import { $prose } from '@milkdown/utils';
import { Plugin, PluginKey } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';
import type { Node as PmNode } from '@milkdown/prose/model';
import type { EditorState } from '@milkdown/prose/state';

/**
 * Obsidian-style Live Preview for Milkdown.
 *
 * The doc is stored as ProseMirror AST (no raw `##`, `**`, `*` characters).
 * This plugin paints virtual "marker" widgets in front of / around styled
 * nodes so the user sees the markdown syntax hints (dimmed) while the styled
 * content renders normally. It's purely decorative — the markers don't live
 * in the document and don't affect serialization.
 *
 * Covered:
 *  - `heading` → `# `, `## `, `### ` prefix widget per level (1–6)
 *  - `strong` mark → `**` widgets at both ends
 *  - `emphasis` mark → `*` widgets at both ends
 *  - `inlineCode` mark → `` ` `` widgets at both ends
 *  - `blockquote` → `> ` prefix widget
 *  - `bullet_list` items → `- ` prefix widget
 *  - `ordered_list` items → `N. ` prefix widget
 *
 * The CSS class `.wa-md-marker` styles all widgets (dimmed, non-selectable).
 */

const KEY = new PluginKey('wa-live-preview');

function makeMarkerWidget(text: string): HTMLElement {
  const span = document.createElement('span');
  span.className = 'wa-md-marker';
  span.textContent = text;
  span.setAttribute('contenteditable', 'false');
  span.setAttribute('aria-hidden', 'true');
  return span;
}

function widget(pos: number, text: string, side: number): Decoration {
  return Decoration.widget(pos, () => makeMarkerWidget(text), { side });
}

function collectDecorations(state: EditorState): Decoration[] {
  const decos: Decoration[] = [];
  const { doc } = state;

  doc.descendants((node, pos) => {
    // Block-level markers live just inside the block, at position pos+1.
    if (node.type.name === 'heading') {
      const level = Math.min(6, Math.max(1, (node.attrs.level as number) || 1));
      decos.push(widget(pos + 1, '#'.repeat(level) + ' ', -1));
    } else if (node.type.name === 'blockquote') {
      // Put a marker at the beginning of each direct child textblock.
      node.forEach((child, offset) => {
        if (child.isTextblock) decos.push(widget(pos + 1 + offset + 1, '> ', -1));
      });
      return; // children already handled
    } else if (node.type.name === 'list_item' || node.type.name === 'bullet_list_item') {
      decos.push(widget(pos + 1, '- ', -1));
    }

    // Inline mark markers: wrap each contiguous run of a mark with widgets.
    if (node.isText && node.marks.length) {
      for (const mark of node.marks) {
        const markerText = markerForMark(mark.type.name);
        if (!markerText) continue;
        const from = pos;
        const to = pos + node.nodeSize;
        decos.push(widget(from, markerText, -1));
        decos.push(widget(to, markerText, 1));
      }
    }
  });

  return decos;
}

function markerForMark(name: string): string | null {
  switch (name) {
    case 'strong': return '**';
    case 'emphasis': return '*';
    case 'inlineCode': return '`';
    default: return null;
  }
}

export const livePreview = $prose(
  () =>
    new Plugin({
      key: KEY,
      state: {
        init: (_c, state) => DecorationSet.create(state.doc, collectDecorations(state)),
        apply: (tr, old, _oldState, newState) => {
          if (!tr.docChanged) return old;
          return DecorationSet.create(newState.doc, collectDecorations(newState));
        },
      },
      props: {
        decorations(state) { return KEY.getState(state); },
      },
    }),
);

/** Export for tests: expose the collector so we can unit-test decoration
 *  shapes against known doc fragments. */
export const __internal = { collectDecorations, markerForMark };
// Prevent unused import error if PmNode type narrowing is stripped.
export type _PmNode = PmNode;
