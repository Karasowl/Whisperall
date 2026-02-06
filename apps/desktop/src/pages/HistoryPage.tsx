import { useEffect, useState } from 'react';
import { getSupabase } from '../lib/supabase';
import { useAuthStore } from '../stores/auth';

type HistoryEntry = {
  id: string;
  operation: string;
  detail: string;
  created_at: string;
};

export function HistoryPage() {
  const user = useAuthStore((s) => s.user);
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    const sb = getSupabase();
    if (!sb) return;

    setLoading(true);
    sb.from('history')
      .select('id, operation, detail, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setEntries((data as HistoryEntry[]) ?? []);
        setLoading(false);
      });
  }, [user]);

  if (!user) {
    return (
      <div className="page">
        <h2>History</h2>
        <p className="empty-state">Sign in to view your operation history.</p>
      </div>
    );
  }

  return (
    <div className="page">
      <h2>History</h2>
      {loading && <p className="status-text">Loading...</p>}
      {entries.length === 0 && !loading && (
        <p className="empty-state">No history yet. Start using Whisperall to see your operations here.</p>
      )}
      <div className="history-list">
        {entries.map((entry) => (
          <div key={entry.id} className="history-card">
            <span className="history-op">{entry.operation}</span>
            <span className="history-detail">{entry.detail}</span>
            <span className="history-time">
              {new Date(entry.created_at).toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
