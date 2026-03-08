import type { ProcessFilter, ProcessItem } from '../../lib/processes';
import { useT } from '../../lib/i18n';

type Props = {
  value: ProcessFilter;
  items: ProcessItem[];
  onChange: (next: ProcessFilter) => void;
};

const FILTERS: ProcessFilter[] = ['all', 'running', 'queued', 'paused', 'failed', 'canceled', 'completed'];

export function ProcessFilters({ value, items, onChange }: Props) {
  const t = useT();
  const count = (filter: ProcessFilter) => filter === 'all' ? items.length : items.filter((it) => it.status === filter).length;
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="process-filters">
      {FILTERS.map((filter) => {
        const active = value === filter;
        return (
          <button key={filter} type="button" onClick={() => onChange(filter)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${active ? 'border-primary/30 bg-primary/14 text-primary' : 'border-edge bg-surface text-text/75 hover:text-text'}`}
            data-testid={`process-filter-${filter}`}>
            {t(`processes.filter.${filter}`)} <span className="opacity-60">{count(filter)}</span>
          </button>
        );
      })}
    </div>
  );
}
