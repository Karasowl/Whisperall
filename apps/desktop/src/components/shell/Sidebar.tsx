import type { Page } from '../../App';
import { UserMenu } from './UserMenu';
import { usePlanStore } from '../../stores/plan';
import { useAuthStore } from '../../stores/auth';
import { useT } from '../../lib/i18n';
import type { UsageRecord } from '@whisperall/api-client';

const NAV_KEYS: { id: Page; key: string; icon: string }[] = [
  { id: 'dictate', key: 'nav.notes', icon: 'note_stack' },
  { id: 'transcribe', key: 'nav.transcribe', icon: 'description' },
  { id: 'reader', key: 'nav.reader', icon: 'volume_up' },
  { id: 'history', key: 'nav.history', icon: 'history' },
];

const RESOURCES: (keyof UsageRecord)[] = ['stt_seconds', 'transcribe_seconds', 'tts_chars', 'translate_chars', 'ai_edit_tokens', 'notes_count', 'storage_bytes'];
const RESOURCE_LABELS: Record<string, string> = {
  stt_seconds: 'usage.dictation', transcribe_seconds: 'usage.transcription', tts_chars: 'usage.tts',
  translate_chars: 'usage.translation', ai_edit_tokens: 'usage.aiEditing', notes_count: 'usage.notes', storage_bytes: 'usage.storage',
};

type Props = { page: Page; onNavigate: (p: Page) => void; onOpenSettings: () => void; onOpenPricing: () => void };

export function Sidebar({ page, onNavigate, onOpenSettings, onOpenPricing }: Props) {
  const t = useT();
  const user = useAuthStore((s) => s.user);
  const { plan, usagePercent } = usePlanStore();

  const atRisk = user
    ? RESOURCES.map((r) => ({ resource: r, pct: usagePercent(r) })).filter((x) => x.pct >= 70).sort((a, b) => b.pct - a.pct).slice(0, 2)
    : [];

  return (
    <aside className="w-64 flex flex-col justify-between border-r border-edge bg-surface-alt shrink-0 z-20" data-testid="sidebar">
      {/* Top */}
      <div className="flex flex-col gap-6 p-4 pt-12 drag-region">
        <div className="flex items-center gap-3 px-2 no-drag">
          <div className="bg-primary/20 flex items-center justify-center rounded-xl h-10 w-10 shrink-0">
            <span className="material-symbols-outlined text-primary text-2xl">graphic_eq</span>
          </div>
          <div className="flex flex-col">
            <h1 className="text-base font-bold leading-tight">{t('sidebar.brand')}</h1>
            <p className="text-muted text-xs font-medium">{t('sidebar.workspace')}</p>
          </div>
        </div>
        <nav className="flex flex-col gap-1 no-drag">
          {NAV_KEYS.map((item) => {
            const active = item.id === page;
            return (
              <button key={item.id} data-testid={`nav-${item.id}`} onClick={() => onNavigate(item.id)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${active ? 'bg-primary/10 text-primary' : 'text-muted hover:bg-surface hover:text-text'}`}>
                <span className={`material-symbols-outlined text-[24px] ${active ? 'fill-1' : ''}`}>{item.icon}</span>
                <span className={`text-sm ${active ? 'font-semibold' : 'font-medium'}`}>{t(item.key)}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom */}
      <div className="flex flex-col gap-1 p-4 border-t border-edge no-drag">
        {/* Plan card */}
        {user && (
          <div className="px-3 py-2.5 mb-2 rounded-lg bg-surface/50 border border-edge" data-testid="plan-card">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted">{t('usage.plan')}</span>
              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                plan === 'pro' ? 'bg-purple-500/15 text-purple-400' : plan === 'basic' ? 'bg-primary/15 text-primary' : 'bg-edge text-muted'
              }`}>{plan}</span>
            </div>
            {atRisk.length > 0 ? (
              <div className="flex flex-col gap-1.5 mb-2">
                {atRisk.map(({ resource, pct }) => (
                  <div key={resource} className="flex items-center gap-2">
                    <span className="text-[10px] text-muted truncate flex-1">{t(RESOURCE_LABELS[resource])}</span>
                    <div className="w-12 h-1 bg-edge rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${pct >= 90 ? 'bg-red-500' : 'bg-amber-500'}`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[10px] text-muted w-7 text-right">{pct}%</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[10px] text-muted/60 mb-2">{t('sidebar.allGood')}</p>
            )}
            {plan === 'free' && (
              <button onClick={onOpenPricing} data-testid="sidebar-upgrade"
                className="w-full py-1.5 bg-gradient-to-r from-primary to-purple-500 text-white text-xs font-medium rounded-md hover:opacity-90 transition-opacity">
                {t('upgrade.button')}
              </button>
            )}
          </div>
        )}

        <button onClick={onOpenSettings} data-testid="nav-settings"
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-muted hover:bg-surface hover:text-text transition-colors">
          <span className="material-symbols-outlined text-[24px]">settings</span>
          <span className="text-sm font-medium">{t('sidebar.settings')}</span>
        </button>
        <UserMenu />
      </div>
    </aside>
  );
}
