import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import Placeholder from '@tiptap/extension-placeholder';
import { useEffect, useCallback } from 'react';

const btnClass = (active: boolean) =>
  `p-1.5 rounded-md transition-colors ${active ? 'bg-primary/20 text-primary' : 'text-muted hover:text-text hover:bg-white/5'}`;

function Toolbar({ editor }: { editor: Editor }) {
  return (
    <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-edge bg-surface/50 flex-wrap" data-testid="editor-toolbar">
      <button onClick={() => editor.chain().focus().toggleBold().run()} className={btnClass(editor.isActive('bold'))} title="Bold">
        <span className="material-symbols-outlined text-[18px]">format_bold</span>
      </button>
      <button onClick={() => editor.chain().focus().toggleItalic().run()} className={btnClass(editor.isActive('italic'))} title="Italic">
        <span className="material-symbols-outlined text-[18px]">format_italic</span>
      </button>
      <button onClick={() => editor.chain().focus().toggleUnderline().run()} className={btnClass(editor.isActive('underline'))} title="Underline">
        <span className="material-symbols-outlined text-[18px]">format_underlined</span>
      </button>
      <button onClick={() => editor.chain().focus().toggleHighlight().run()} className={btnClass(editor.isActive('highlight'))} title="Highlight">
        <span className="material-symbols-outlined text-[18px]">ink_highlighter</span>
      </button>
      <span className="w-px h-5 bg-edge mx-1" />
      <button onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={btnClass(editor.isActive('heading', { level: 2 }))} title="Heading">
        <span className="material-symbols-outlined text-[18px]">title</span>
      </button>
      <button onClick={() => editor.chain().focus().toggleBulletList().run()} className={btnClass(editor.isActive('bulletList'))} title="Bullet List">
        <span className="material-symbols-outlined text-[18px]">format_list_bulleted</span>
      </button>
      <button onClick={() => editor.chain().focus().toggleOrderedList().run()} className={btnClass(editor.isActive('orderedList'))} title="Numbered List">
        <span className="material-symbols-outlined text-[18px]">format_list_numbered</span>
      </button>
      <button onClick={() => editor.chain().focus().toggleBlockquote().run()} className={btnClass(editor.isActive('blockquote'))} title="Quote">
        <span className="material-symbols-outlined text-[18px]">format_quote</span>
      </button>
      <span className="w-px h-5 bg-edge mx-1" />
      <button onClick={() => editor.chain().focus().toggleCodeBlock().run()} className={btnClass(editor.isActive('codeBlock'))} title="Code Block">
        <span className="material-symbols-outlined text-[18px]">code</span>
      </button>
      <button onClick={() => editor.chain().focus().setHorizontalRule().run()} className={btnClass(false)} title="Divider">
        <span className="material-symbols-outlined text-[18px]">horizontal_rule</span>
      </button>
    </div>
  );
}

function FloatingToolbar({ editor }: { editor: Editor }) {
  const b = (active: boolean) =>
    `p-1 rounded transition-colors ${active ? 'bg-white/20 text-white' : 'text-white/70 hover:text-white hover:bg-white/10'}`;

  return (
    <BubbleMenu editor={editor}>
      <div className="bubble-menu flex items-center gap-0.5 px-1.5 py-1 rounded-lg shadow-xl" data-testid="bubble-menu">
        <button onClick={() => editor.chain().focus().toggleBold().run()} className={b(editor.isActive('bold'))} title="Bold">
          <span className="material-symbols-outlined text-[16px]">format_bold</span>
        </button>
        <button onClick={() => editor.chain().focus().toggleItalic().run()} className={b(editor.isActive('italic'))} title="Italic">
          <span className="material-symbols-outlined text-[16px]">format_italic</span>
        </button>
        <button onClick={() => editor.chain().focus().toggleUnderline().run()} className={b(editor.isActive('underline'))} title="Underline">
          <span className="material-symbols-outlined text-[16px]">format_underlined</span>
        </button>
        <button onClick={() => editor.chain().focus().toggleHighlight().run()} className={b(editor.isActive('highlight'))} title="Highlight">
          <span className="material-symbols-outlined text-[16px]">ink_highlighter</span>
        </button>
        <span className="w-px h-4 bg-white/20 mx-0.5" />
        <button onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={b(editor.isActive('heading', { level: 2 }))} title="Heading">
          <span className="material-symbols-outlined text-[16px]">title</span>
        </button>
        <button onClick={() => editor.chain().focus().toggleBlockquote().run()} className={b(editor.isActive('blockquote'))} title="Quote">
          <span className="material-symbols-outlined text-[16px]">format_quote</span>
        </button>
        <button onClick={() => editor.chain().focus().toggleCode().run()} className={b(editor.isActive('code'))} title="Inline Code">
          <span className="material-symbols-outlined text-[16px]">code</span>
        </button>
      </div>
    </BubbleMenu>
  );
}

type Props = {
  content: string;
  onChange: (html: string, text: string) => void;
  placeholder?: string;
  onEditorReady?: (editor: Editor) => void;
};

export function RichEditor({ content, onChange, placeholder, onEditorReady }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ underline: false }),
      Underline,
      Highlight,
      Placeholder.configure({ placeholder: placeholder ?? 'Start writing...' }),
    ],
    content,
    onCreate: ({ editor: e }) => onEditorReady?.(e),
    onUpdate: ({ editor: e }) => {
      onChange(e.getHTML(), e.getText());
    },
    editorProps: {
      attributes: { class: 'prose-editor outline-none min-h-[300px] p-5 text-text-secondary text-base' },
    },
  });

  const setContent = useCallback((html: string) => {
    if (!editor) return;
    const currentHtml = editor.getHTML();
    if (currentHtml !== html) {
      editor.commands.setContent(html, { emitUpdate: false });
    }
  }, [editor]);

  useEffect(() => { setContent(content); }, [content, setContent]);

  if (!editor) return null;

  return (
    <div className="bg-surface border border-edge rounded-xl overflow-hidden" data-testid="rich-editor">
      <Toolbar editor={editor} />
      <FloatingToolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}
