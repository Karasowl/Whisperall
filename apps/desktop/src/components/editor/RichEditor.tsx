import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import Placeholder from '@tiptap/extension-placeholder';
import { useEffect, useCallback } from 'react';

type ToolbarProps = { editor: Editor };

function Toolbar({ editor }: ToolbarProps) {
  const btn = (active: boolean) =>
    `p-1.5 rounded-md transition-colors ${active ? 'bg-primary/20 text-primary' : 'text-muted hover:text-text hover:bg-white/5'}`;

  return (
    <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-edge bg-surface/50 flex-wrap" data-testid="editor-toolbar">
      <button onClick={() => editor.chain().focus().toggleBold().run()} className={btn(editor.isActive('bold'))} title="Bold">
        <span className="material-symbols-outlined text-[18px]">format_bold</span>
      </button>
      <button onClick={() => editor.chain().focus().toggleItalic().run()} className={btn(editor.isActive('italic'))} title="Italic">
        <span className="material-symbols-outlined text-[18px]">format_italic</span>
      </button>
      <button onClick={() => editor.chain().focus().toggleUnderline().run()} className={btn(editor.isActive('underline'))} title="Underline">
        <span className="material-symbols-outlined text-[18px]">format_underlined</span>
      </button>
      <button onClick={() => editor.chain().focus().toggleHighlight().run()} className={btn(editor.isActive('highlight'))} title="Highlight">
        <span className="material-symbols-outlined text-[18px]">ink_highlighter</span>
      </button>
      <span className="w-px h-5 bg-edge mx-1" />
      <button onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={btn(editor.isActive('heading', { level: 2 }))} title="Heading">
        <span className="material-symbols-outlined text-[18px]">title</span>
      </button>
      <button onClick={() => editor.chain().focus().toggleBulletList().run()} className={btn(editor.isActive('bulletList'))} title="Bullet List">
        <span className="material-symbols-outlined text-[18px]">format_list_bulleted</span>
      </button>
      <button onClick={() => editor.chain().focus().toggleOrderedList().run()} className={btn(editor.isActive('orderedList'))} title="Numbered List">
        <span className="material-symbols-outlined text-[18px]">format_list_numbered</span>
      </button>
      <button onClick={() => editor.chain().focus().toggleBlockquote().run()} className={btn(editor.isActive('blockquote'))} title="Quote">
        <span className="material-symbols-outlined text-[18px]">format_quote</span>
      </button>
      <span className="w-px h-5 bg-edge mx-1" />
      <button onClick={() => editor.chain().focus().toggleCodeBlock().run()} className={btn(editor.isActive('codeBlock'))} title="Code Block">
        <span className="material-symbols-outlined text-[18px]">code</span>
      </button>
      <button onClick={() => editor.chain().focus().setHorizontalRule().run()} className={btn(false)} title="Divider">
        <span className="material-symbols-outlined text-[18px]">horizontal_rule</span>
      </button>
    </div>
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
      StarterKit.configure({
        // Avoid duplicate registration warning if underline is bundled by StarterKit version.
        underline: false,
      }),
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

  // Sync external content changes (e.g. AI edit result)
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
      <EditorContent editor={editor} />
    </div>
  );
}
