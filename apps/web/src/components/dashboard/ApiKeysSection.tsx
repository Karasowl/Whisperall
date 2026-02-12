'use client';

import { useEffect, useState, useCallback } from 'react';
import type { ApiKey } from '@whisperall/api-client';
import { api, setApiToken } from '@/lib/api-client';
import { createClient } from '@/lib/supabase/client';
import { classifyApiError } from '@/lib/api-errors';

export function ApiKeysSection() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const ensureToken = useCallback(async () => {
    const sb = createClient();
    const { data: { session } } = await sb.auth.getSession();
    if (session?.access_token) setApiToken(session.access_token);
  }, []);

  const fetchKeys = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await ensureToken();
      setKeys(await api.apiKeys.list());
    } catch (e) {
      setError(classifyApiError(e).message);
    } finally {
      setLoading(false);
    }
  }, [ensureToken]);

  useEffect(() => { fetchKeys(); }, [fetchKeys]);

  const createKey = async () => {
    setError(null);
    try {
      await ensureToken();
      const result = await api.apiKeys.create({ name: name || 'Default' });
      setNewKey(result.key);
      setName('');
      fetchKeys();
    } catch (e) {
      setError(classifyApiError(e).message);
    }
  };

  const revokeKey = async (id: string) => {
    try {
      await ensureToken();
      await api.apiKeys.revoke(id);
      if (newKey) setNewKey(null);
      fetchKeys();
    } catch (e) {
      setError(classifyApiError(e).message);
    }
  };

  const copyKey = () => {
    if (!newKey) return;
    navigator.clipboard.writeText(newKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const activeKeys = keys.filter(k => !k.revoked_at);

  return (
    <div data-testid="api-keys-section" className="p-5 rounded-2xl border border-edge bg-surface">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-bold text-text">API Keys</h2>
          <p className="text-xs text-muted mt-0.5">For MCP servers, Claude Desktop, Cursor, and other integrations</p>
        </div>
      </div>

      {/* New key reveal (shown once after creation) */}
      {newKey && (
        <div className="mb-4 p-3 rounded-xl bg-primary/10 border border-primary/30">
          <p className="text-xs font-semibold text-primary mb-2">
            <span className="material-symbols-outlined text-[14px] align-middle mr-1">warning</span>
            Copy this key now — it won't be shown again
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs font-mono bg-base px-3 py-2 rounded-lg text-text break-all select-all">
              {newKey}
            </code>
            <button
              onClick={copyKey}
              className="shrink-0 px-3 py-2 text-xs font-medium rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

      {/* Create form */}
      <div className="flex gap-2 mb-4">
        <input
          data-testid="api-key-name"
          type="text"
          placeholder="Key name (optional)"
          value={name}
          onChange={e => setName(e.target.value)}
          maxLength={100}
          className="flex-1 text-sm px-3 py-2 rounded-lg border border-edge bg-base text-text placeholder:text-muted focus:outline-none focus:border-primary"
        />
        <button
          data-testid="create-api-key-btn"
          onClick={createKey}
          disabled={activeKeys.length >= 5}
          className="shrink-0 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Create Key
        </button>
      </div>

      {/* Key list */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2].map(i => <div key={i} className="h-10 rounded-lg bg-edge animate-pulse" />)}
        </div>
      ) : activeKeys.length === 0 ? (
        <p className="text-xs text-muted text-center py-4">No API keys yet. Create one to use with MCP.</p>
      ) : (
        <div className="space-y-2">
          {activeKeys.map(k => (
            <div key={k.id} className="flex items-center justify-between px-3 py-2 rounded-lg border border-edge bg-base">
              <div className="min-w-0">
                <p className="text-sm font-medium text-text truncate">{k.name}</p>
                <p className="text-xs text-muted font-mono">
                  {k.key_prefix}{'•'.repeat(8)}
                  {k.last_used_at && <span className="ml-2 font-sans">Last used {new Date(k.last_used_at).toLocaleDateString()}</span>}
                </p>
              </div>
              <button
                onClick={() => revokeKey(k.id)}
                className="shrink-0 ml-3 text-xs text-red-400 hover:text-red-300 transition-colors"
              >
                Revoke
              </button>
            </div>
          ))}
        </div>
      )}

      {activeKeys.length >= 5 && (
        <p className="text-xs text-muted mt-2">Maximum 5 active keys. Revoke an existing key to create a new one.</p>
      )}
    </div>
  );
}
