import { useState } from 'react';
import { useT } from '../../lib/i18n';

export type CustomPrompt = { id: string; name: string; prompt: string; icon: string };

const ICONS = ['auto_fix_high', 'edit_note', 'psychology', 'translate', 'spellcheck', 'lightbulb', 'brush', 'tune'];

type Props = {
  prompts: CustomPrompt[];
  onSave: (prompts: CustomPrompt[]) => void;
  onClose: () => void;
};

export function CustomPromptDialog({ prompts, onSave, onClose }: Props) {
  const t = useT();
  const [items, setItems] = useState<CustomPrompt[]>(prompts);
  const [editing, setEditing] = useState<CustomPrompt | null>(null);

  const addNew = () => {
    const p: CustomPrompt = { id: Date.now().toString(), name: '', prompt: '', icon: 'auto_fix_high' };
    setEditing(p);
  };

  const saveItem = () => {
    if (!editing || !editing.name.trim() || !editing.prompt.trim()) return;
    const exists = items.find((i) => i.id === editing.id);
    const updated = exists ? items.map((i) => (i.id === editing.id ? editing : i)) : [...items, editing];
    setItems(updated);
    setEditing(null);
  };

  const deleteItem = (id: string) => setItems(items.filter((i) => i.id !== id));

  const finish = () => { onSave(items); onClose(); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 no-drag" data-testid="custom-prompt-dialog">
      <div className="bg-surface border border-edge rounded-2xl w-[480px] max-h-[80vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-edge">
          <h2 className="text-lg font-bold text-text">{t('editor.customPrompts')}</h2>
          <button onClick={onClose} className="text-muted hover:text-text"><span className="material-symbols-outlined">close</span></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {items.map((p) => (
            <div key={p.id} className="flex items-center gap-3 bg-base/50 border border-edge rounded-lg px-3 py-2">
              <span className="material-symbols-outlined text-[18px] text-primary">{p.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-text truncate">{p.name}</div>
                <div className="text-xs text-muted truncate">{p.prompt}</div>
              </div>
              <button onClick={() => setEditing(p)} className="text-muted hover:text-text p-1"><span className="material-symbols-outlined text-[18px]">edit</span></button>
              <button onClick={() => deleteItem(p.id)} className="text-muted hover:text-red-400 p-1"><span className="material-symbols-outlined text-[18px]">delete</span></button>
            </div>
          ))}
          {items.length === 0 && <p className="text-sm text-muted text-center py-4">{t('editor.noCustomPrompts')}</p>}
        </div>

        {editing && (
          <div className="border-t border-edge p-5 space-y-3 bg-base/30">
            <input className="w-full bg-surface border border-edge rounded-lg px-3 py-2 text-sm text-text outline-none focus:border-primary"
              placeholder={t('editor.promptName')} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} autoFocus data-testid="prompt-name" />
            <textarea className="w-full bg-surface border border-edge rounded-lg px-3 py-2 text-sm text-text outline-none resize-none h-20 focus:border-primary"
              placeholder={t('editor.promptText')} value={editing.prompt} onChange={(e) => setEditing({ ...editing, prompt: e.target.value })} data-testid="prompt-text" />
            <div className="flex items-center gap-1.5">
              {ICONS.map((ic) => (
                <button key={ic} onClick={() => setEditing({ ...editing, icon: ic })}
                  className={`p-1.5 rounded-md ${editing.icon === ic ? 'bg-primary/20 text-primary' : 'text-muted hover:text-text'}`}>
                  <span className="material-symbols-outlined text-[18px]">{ic}</span>
                </button>
              ))}
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setEditing(null)} className="px-3 py-1.5 text-xs text-muted hover:text-text">{t('editor.cancel')}</button>
              <button onClick={saveItem} disabled={!editing.name.trim() || !editing.prompt.trim()}
                className="px-3 py-1.5 text-xs font-medium bg-primary text-white rounded-lg disabled:opacity-30">{t('editor.savePrompt')}</button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between px-5 py-3 border-t border-edge">
          <button onClick={addNew} className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80">
            <span className="material-symbols-outlined text-[18px]">add</span> {t('editor.addPrompt')}
          </button>
          <button onClick={finish} className="px-4 py-1.5 text-sm font-medium bg-primary text-white rounded-lg">{t('editor.done')}</button>
        </div>
      </div>
    </div>
  );
}
