import { useT } from '../../lib/i18n';

type Props = { value: string; onChange: (v: string) => void };

export function SearchBar({ value, onChange }: Props) {
  const t = useT();
  return (
    <label className="relative flex items-center w-full group" data-testid="search-history">
      <span className="absolute left-4 text-muted group-focus-within:text-primary transition-colors material-symbols-outlined">search</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-surface border border-edge rounded-xl py-3 pl-12 pr-16 text-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
        placeholder={t('history.search')}
      />
      <div className="absolute right-3 flex items-center gap-1">
        <span className="text-xs text-muted border border-edge rounded px-1.5 py-0.5">Ctrl K</span>
      </div>
    </label>
  );
}
