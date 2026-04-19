import { $prose } from '@milkdown/utils';
import { Plugin, PluginKey, TextSelection } from '@milkdown/prose/state';
import { keydownHandler } from '@milkdown/prose/keymap';
import type { EditorState, Transaction } from '@milkdown/prose/state';

/**
 * Code-block exit keymap.
 *
 * Milkdown's commonmark preset treats fenced code blocks (`fence` node) as
 * "isolating" textblocks: once the cursor lives inside one, every keystroke
 * goes into the code. That confuses users — they expect to escape the block
 * the same way Obsidian / Notion let them: by pressing a sensible shortcut.
 *
 * We wire three escape hatches, any of which exits the fence and lands the
 * cursor in a fresh paragraph *after* the block:
 *   1. `Ctrl/Cmd + Enter`   — matches Discord, Slack, Notion conventions.
 *   2. `Shift + Enter`      — secondary shortcut for accessibility.
 *   3. `Escape`             — universal "get me out" key.
 *
 * We deliberately do NOT exit on "double Enter on empty line" — real code
 * frequently contains two blank lines between blocks (Python function
 * separation, for example). Every exit path is now EXPLICIT, so a plain
 * `Enter` always stays inside the block and inserts a newline.
 *
 * Plus one "delete the block" hatch:
 *   4. `Backspace` at the very start of the fence — if empty, drops the
 *      block; if it has content, turns the fence back into a paragraph so
 *      the user can keep the text without the code formatting. Matches the
 *      behaviour of every blockquote / list / heading in ProseMirror.
 */

const KEY = new PluginKey('wa-code-block-exit');

function isInFence(state: EditorState): boolean {
  const { $from } = state.selection;
  for (let d = $from.depth; d >= 0; d--) {
    const name = $from.node(d).type.name;
    if (name === 'code_block' || name === 'fence') return true;
  }
  return false;
}

function exitFence(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
  if (!isInFence(state)) return false;
  const { $from } = state.selection;
  // Find the fence node depth.
  let fenceDepth = -1;
  for (let d = $from.depth; d >= 0; d--) {
    const name = $from.node(d).type.name;
    if (name === 'code_block' || name === 'fence') { fenceDepth = d; break; }
  }
  if (fenceDepth < 0) return false;
  const fenceEnd = $from.after(fenceDepth); // pos right after the fence node
  const paragraph = state.schema.nodes.paragraph;
  if (!paragraph) return false;
  if (!dispatch) return true;
  const tr = state.tr.insert(fenceEnd, paragraph.createAndFill()!);
  const cursorPos = fenceEnd + 1; // inside the new empty paragraph
  tr.setSelection(TextSelection.create(tr.doc, cursorPos));
  tr.scrollIntoView();
  dispatch(tr);
  return true;
}

/**
 * Backspace handler: if the cursor sits at the very first position inside a
 * fence, turn the block into a paragraph (or delete it outright when empty).
 * Without this the block is indestructible — Backspace inside a fence just
 * eats characters one by one and, once empty, stops doing anything because
 * the `fence` node itself is the enclosing block.
 */
function handleBackspaceOutOfFence(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
  if (!isInFence(state)) return false;
  const sel = state.selection;
  if (sel.from !== sel.to) return false; // let the default handler delete a range
  const { $from } = sel;
  if ($from.parentOffset !== 0) return false; // not at the very start
  let fenceDepth = -1;
  for (let d = $from.depth; d >= 0; d--) {
    const name = $from.node(d).type.name;
    if (name === 'code_block' || name === 'fence') { fenceDepth = d; break; }
  }
  if (fenceDepth < 0) return false;
  const fenceNode = $from.node(fenceDepth);
  const fenceStart = $from.before(fenceDepth);
  const fenceEnd = $from.after(fenceDepth);
  const paragraph = state.schema.nodes.paragraph;
  if (!paragraph) return false;
  if (!dispatch) return true;

  // Empty fence → drop it and leave an empty paragraph in its place so the
  // user keeps a natural typing target.
  if (fenceNode.content.size === 0) {
    const tr = state.tr.replaceWith(fenceStart, fenceEnd, paragraph.createAndFill()!);
    tr.setSelection(TextSelection.create(tr.doc, fenceStart + 1));
    tr.scrollIntoView();
    dispatch(tr);
    return true;
  }

  // Fence has content → convert the node type to paragraph, preserving the
  // inline text. `setBlockType` on the fence range is the canonical move.
  const tr = state.tr.setBlockType(fenceStart + 1, fenceEnd - 1, paragraph);
  tr.setSelection(TextSelection.create(tr.doc, fenceStart + 1));
  tr.scrollIntoView();
  dispatch(tr);
  return true;
}

export const codeBlockExit = $prose(
  () =>
    new Plugin({
      key: KEY,
      props: {
        handleKeyDown: keydownHandler({
          'Mod-Enter': exitFence,
          'Shift-Enter': exitFence,
          Escape: exitFence,
          Backspace: handleBackspaceOutOfFence,
        }),
      },
    }),
);

export const __internal = { isInFence, exitFence, handleBackspaceOutOfFence };
