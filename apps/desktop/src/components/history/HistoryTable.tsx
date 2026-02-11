import { useT } from '../../lib/i18n';
import type { HistoryEntry } from '../../pages/HistoryPage';

const MOD_ICONS: Record<string, string> = {
  dictate: 'mic', transcribe: 'description', live: 'groups',
  tts: 'record_voice_over', translate: 'translate', ai_edit: 'auto_awesome',
};
const MOD_COLORS: Record<string, string> = {
  dictate: 'bg-primary/20 text-primary', transcribe: 'bg-purple-500/20 text-purple-400',
  live: 'bg-pink-500/20 text-pink-400', tts: 'bg-amber-500/20 text-amber-500',
  translate: 'bg-emerald-500/20 text-emerald-400', ai_edit: 'bg-blue-500/20 text-blue-400',
};

type Props = { entries: HistoryEntry[]; selectedId: string | null; onSelect: (id: string) => void };

export function HistoryTable({ entries, selectedId, onSelect }: Props) {
  const t = useT();
  if (entries.length === 0) {
    return <p className="text-muted text-center py-12">{t('history.empty')}</p>;
  }

  return (
    <div className="rounded-xl border border-edge bg-surface overflow-hidden flex-1 overflow-y-auto" data-testid="history-table">
      <table className="w-full text-left border-collapse">
        <thead className="bg-surface-alt sticky top-0 z-10 border-b border-edge">
          <tr>
            <th className="py-3 pl-6 pr-4 font-medium text-xs text-muted uppercase tracking-wider w-1/3">{t('history.name')}</th>
            <th className="py-3 px-4 font-medium text-xs text-muted uppercase tracking-wider w-24">{t('history.type')}</th>
            <th className="py-3 px-4 font-medium text-xs text-muted uppercase tracking-wider text-right">{t('history.date')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-edge">
          {entries.map((entry) => (
            <tr
              key={entry.id}
              onClick={() => onSelect(entry.id)}
              className={`group cursor-pointer transition-colors ${
                entry.id === selectedId ? 'bg-white/5' : 'hover:bg-surface-alt/50'
              }`}
            >
              <td className="py-4 pl-6 pr-4">
                <div className="flex items-center gap-3">
                  <div className={`${MOD_COLORS[entry.module] ?? 'bg-primary/20 text-primary'} p-2 rounded-lg shrink-0`}>
                    <span className="material-symbols-outlined text-[20px]">{MOD_ICONS[entry.module] ?? 'history'}</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-text capitalize">{entry.module.replace(/_/g, ' ')}</p>
                    <p className="text-xs text-muted truncate max-w-[200px]">{entry.output_text ?? ''}</p>
                  </div>
                </div>
              </td>
              <td className="py-4 px-4">
                <div className="flex items-center gap-1.5 text-xs font-medium text-text-secondary bg-surface-alt rounded px-2 py-1 w-fit capitalize">
                  <span className="material-symbols-outlined text-[14px]">{MOD_ICONS[entry.module] ?? 'history'}</span>
                  {entry.module.replace(/_/g, ' ')}
                </div>
              </td>
              <td className="py-4 px-4 text-sm text-muted text-right whitespace-nowrap">{new Date(entry.created_at).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
