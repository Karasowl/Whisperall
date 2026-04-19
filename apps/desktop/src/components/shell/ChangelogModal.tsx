import { useEffect, useMemo } from 'react';
// Raw import — bundled at build time from the workspace root.
import changelogRaw from '../../../../../CHANGELOG.md?raw';
import pkg from '../../../package.json';
import { useT } from '../../lib/i18n';
import { Button } from '../ui/Button';
import { copyText } from '../../lib/clipboard-utils';

type Props = { onClose: () => void };

type Release = { version: string; date?: string; body: string };

function parseReleases(md: string): Release[] {
  const lines = md.split(/\r?\n/);
  const releases: Release[] = [];
  let current: Release | null = null;
  const headingRe = /^##\s+\[?([^\]\s]+)\]?(?:\s*[—-]\s*(.+))?$/;
  for (const line of lines) {
    const m = line.match(headingRe);
    if (m) {
      if (current) releases.push(current);
      current = { version: m[1].trim(), date: m[2]?.trim(), body: '' };
      continue;
    }
    if (current) current.body += `${line}\n`;
  }
  if (current) releases.push(current);
  return releases;
}

function renderInline(text: string): string {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/`([^`]+)`/g, '<code class="rounded bg-edge/60 px-1 py-0.5 text-[11px] font-mono">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="text-text">$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

function renderBody(body: string): string {
  const blocks: string[] = [];
  const lines = body.split('\n');
  let list: string[] = [];
  const flushList = () => {
    if (list.length) {
      blocks.push(`<ul class="list-disc pl-5 space-y-1 text-xs text-muted">${list.map((li) => `<li>${renderInline(li)}</li>`).join('')}</ul>`);
      list = [];
    }
  };
  for (const line of lines) {
    if (/^\s*-\s+/.test(line)) {
      list.push(line.replace(/^\s*-\s+/, ''));
      continue;
    }
    flushList();
    const h3 = line.match(/^###\s+(.+)$/);
    if (h3) {
      blocks.push(`<h4 class="text-[11px] font-semibold uppercase tracking-wider text-primary/80 mt-3 mb-1">${renderInline(h3[1])}</h4>`);
      continue;
    }
    if (line.trim()) blocks.push(`<p class="text-xs text-muted/90">${renderInline(line.trim())}</p>`);
  }
  flushList();
  return blocks.join('\n');
}

export function ChangelogModal({ onClose }: Props) {
  const t = useT();
  const currentVersion = (pkg as { version?: string }).version ?? '0.0.0';
  const releases = useMemo(() => parseReleases(changelogRaw), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const copyAll = () => { void copyText(changelogRaw, 'Changelog'); };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" data-testid="changelog-modal" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-2xl max-h-[80vh] flex flex-col rounded-2xl border border-edge bg-surface shadow-2xl overflow-hidden">
        <header className="flex items-center justify-between px-5 py-3 border-b border-edge shrink-0">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-primary">deployed_code</span>
            <h2 className="text-sm font-semibold text-text">{t('sidebar.version')}</h2>
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-mono text-primary">v{currentVersion}</span>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" leftIcon="content_copy" onClick={copyAll} title="Copy full changelog" />
            <Button variant="ghost" size="icon" leftIcon="close" onClick={onClose} title="Close" data-testid="changelog-close" className="hover:!text-red-400" />
          </div>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {releases.length === 0 ? (
            <p className="text-xs text-muted/60 text-center py-8">No changelog entries found.</p>
          ) : (
            releases.map((r) => {
              const isCurrent = r.version.replace(/^v/, '') === currentVersion;
              return (
                <section key={r.version} className={`rounded-xl border ${isCurrent ? 'border-primary/40 bg-primary/5' : 'border-edge bg-surface-alt/50'} p-4`}>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-text">
                      {r.version}
                      {isCurrent && <span className="ml-2 rounded-full bg-primary/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">current</span>}
                    </h3>
                    {r.date && <span className="text-[10px] font-mono text-muted/60">{r.date}</span>}
                  </div>
                  <div className="space-y-1 select-text" dangerouslySetInnerHTML={{ __html: renderBody(r.body.trim()) }} />
                </section>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
