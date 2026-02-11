import { useT } from '../../lib/i18n';

const FILTER_KEYS = [
  { id: 'all', key: 'history.all', icon: '', dot: '' },
  { id: 'today', key: 'history.today', icon: '', dot: 'bg-green-500' },
  { id: 'memo', key: 'history.memos', icon: 'mic', dot: '' },
  { id: 'meeting', key: 'history.meetings', icon: 'groups', dot: '' },
] as const;

type FilterId = typeof FILTER_KEYS[number]['id'];
type Props = { active: FilterId; onChange: (id: FilterId) => void };

export function FilterPills({ active, onChange }: Props) {
  const t = useT();
  return (
    <div className="flex gap-2 overflow-x-auto pb-2" data-testid="filter-pills">
      {FILTER_KEYS.map((f) => {
        const isActive = f.id === active;
        return (
          <button
            key={f.id}
            onClick={() => onChange(f.id)}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              isActive
                ? 'bg-white/10 text-text'
                : 'border border-edge text-muted hover:bg-surface hover:text-text'
            }`}
          >
            {f.dot && <span className={`w-2 h-2 rounded-full ${f.dot}`} />}
            {f.icon && <span className="material-symbols-outlined text-[16px]">{f.icon}</span>}
            {t(f.key)}
          </button>
        );
      })}
    </div>
  );
}
