import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api';
import { SearchBar } from '../components/history/SearchBar';
import { FilterPills } from '../components/history/FilterPills';
import { HistoryTable } from '../components/history/HistoryTable';
import { PreviewPanel } from '../components/history/PreviewPanel';
import { useT } from '../lib/i18n';

export type HistoryEntry = { id: string; module: string; output_text: string | null; input_text: string | null; audio_url: string | null; metadata?: Record<string, unknown>; created_at: string };

export function HistoryPage() {
  const t = useT();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'today' | 'dictate' | 'transcribe' | 'live' | 'tts'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const fetchHistory = useCallback(() => {
    setLoading(true);
    setError(null);
    api.history.list(50)
      .then((data) => { setEntries(data as HistoryEntry[]); })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const filtered = entries.filter((e) => {
    const text = ((e.output_text ?? '') + ' ' + (e.input_text ?? '')).toLowerCase();
    if (search && !text.includes(search.toLowerCase()) && !e.module.includes(search.toLowerCase())) return false;
    if (filter === 'today') return new Date(e.created_at).toDateString() === new Date().toDateString();
    if (filter === 'dictate' || filter === 'transcribe' || filter === 'live' || filter === 'tts') return e.module === filter;
    return true;
  });

  const selected = entries.find((e) => e.id === selectedId) ?? null;

  return (
    <div className="flex-1 flex overflow-hidden" data-testid="history-page">
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <div className="px-8 pt-12 pb-4">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="text-3xl font-black tracking-tight mb-2">{t('history.title')}</h2>
              <p className="text-muted">{t('history.desc')}</p>
            </div>
          </div>
          <div className="flex flex-col gap-4">
            <SearchBar value={search} onChange={setSearch} />
            <FilterPills active={filter} onChange={setFilter} />
          </div>
        </div>
        <div className="flex-1 overflow-auto px-8 pb-8">
          {loading && <p className="text-primary text-sm mb-4">{t('history.loading')}</p>}
          {error && (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <span className="material-symbols-outlined text-[48px] text-red-400">error</span>
              <p className="text-sm text-muted max-w-md">{error}</p>
              <button onClick={fetchHistory}
                className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors">
                {t('history.retry')}
              </button>
            </div>
          )}
          {!loading && !error && filtered.length === 0 && (
            <div className="text-center py-16 text-muted">
              <span className="material-symbols-outlined text-[48px] mb-4 block">history</span>
              <p>{(search || filter !== 'all') ? t('history.noResults') : t('history.empty')}</p>
            </div>
          )}
          {!error && filtered.length > 0 && <HistoryTable entries={filtered} selectedId={selectedId} onSelect={setSelectedId} />}
        </div>
      </div>
      <PreviewPanel entry={selected} onClose={() => setSelectedId(null)} />
    </div>
  );
}
