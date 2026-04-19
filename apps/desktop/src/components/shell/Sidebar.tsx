import { useState } from 'react';
import type { Page } from '../../App';
import { UserMenu } from './UserMenu';
import { VersionBadge } from './VersionBadge';
import { usePlanStore } from '../../stores/plan';
import { useAuthStore } from '../../stores/auth';
import { useFoldersStore } from '../../stores/folders';
import { useDocumentsStore } from '../../stores/documents';
import { useUiStore } from '../../stores/ui';
import { FolderTree } from '../notes/FolderTree';
import { useT } from '../../lib/i18n';
import type { UsageRecord } from '@whisperall/api-client';

const RESOURCES: (keyof UsageRecord)[] = ['stt_seconds', 'transcribe_seconds', 'tts_chars', 'translate_chars', 'ai_edit_tokens', 'notes_count', 'storage_bytes'];
const RESOURCE_LABELS: Record<string, string> = {
  stt_seconds: 'usage.dictation', transcribe_seconds: 'usage.transcription', tts_chars: 'usage.tts',
  translate_chars: 'usage.translation', ai_edit_tokens: 'usage.aiEditing', notes_count: 'usage.notes', storage_bytes: 'usage.storage',
};

type NavDef = { id: Page; label: string; icon: string };

type Props = {
  page: Page;
  onNavigate: (p: Page) => void;
  onOpenSettings: () => void;
  onOpenPricing: () => void;
  onNewNote?: () => void;
  onVoiceNote?: () => void;
  onDeleteFolder?: (id: string) => void;
};

export function Sidebar({ page, onNavigate, onOpenSettings, onOpenPricing, onNewNote, onVoiceNote, onDeleteFolder }: Props) {
  const t = useT();
  const user = useAuthStore((s) => s.user);
  const { plan, usagePercent } = usePlanStore();
  const documents = useDocumentsStore((s) => s.documents);
  const { createFolder } = useFoldersStore();
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggle = useUiStore((s) => s.toggleSidebar);
  const [createError, setCreateError] = useState('');

  const navTop: NavDef[] = [
    { id: 'dictate', label: t('nav.notes'), icon: 'note_stack' },
    { id: 'processes', label: t('nav.processes'), icon: 'progress_activity' },
  ];

  const atRisk = user
    ? RESOURCES.map((r) => ({ resource: r, pct: usagePercent(r) })).filter((x) => x.pct >= 70).sort((a, b) => b.pct - a.pct).slice(0, 2)
    : [];

  const handleNewFolder = async () => {
    setCreateError('');
    try { await createFolder(t('folders.untitled')); } catch { setCreateError(t('folders.createError')); }
  };

  const width = collapsed ? 'w-14' : 'w-64';

  const NavButton = ({ def }: { def: NavDef }) => {
    const active = page === def.id;
    return (
      <button data-testid={`nav-${def.id}`} onClick={() => onNavigate(def.id)} title={collapsed ? def.label : undefined}
        className={`flex items-center ${collapsed ? 'justify-center px-2' : 'gap-2.5 px-3'} py-2 rounded-full tracking-[0.14px] transition-all ${active ? 'bg-[var(--theme-warm)] text-primary shadow-[var(--theme-shadow-inset-border)]' : 'text-text-tertiary hover:text-text hover:bg-surface/70'}`}>
        <span className={`material-symbols-outlined text-[17px] ${active ? 'fill-1' : ''}`}>{def.icon}</span>
        {!collapsed && <span className={`text-[13px] ${active ? 'font-medium' : 'font-normal'}`}>{def.label}</span>}
      </button>
    );
  };

  return (
    <aside className={`${width} transition-[width] duration-200 flex flex-col border-r border-edge bg-surface-alt shrink-0 z-20`} data-testid="sidebar">
      <div className={`flex flex-col ${collapsed ? 'gap-3 p-2' : 'gap-4 p-4'} pt-12 drag-region shrink-0`}>
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between'} no-drag`}>
          <div className={`flex items-center ${collapsed ? '' : 'gap-3 px-1'}`}>
            {/* E4 — ElevenLabs-style brand: warm-stone chip with inset border,
                whisper-thin wordmark with airy letter-spacing. */}
            <div className="bg-[var(--theme-warm)] shadow-[var(--theme-shadow-inset-border)] flex items-center justify-center rounded-full h-10 w-10 shrink-0">
              <span className="material-symbols-outlined text-primary text-[20px]">graphic_eq</span>
            </div>
            {!collapsed && (
              <div className="flex flex-col">
                <h1 className="text-[17px] font-light tracking-[-0.01em] leading-none text-text">{t('sidebar.brand')}</h1>
                <p className="text-text-quaternary text-[10px] uppercase tracking-[0.14em] mt-1.5">{t('sidebar.workspace')}</p>
              </div>
            )}
          </div>
          {!collapsed && (
            <button onClick={toggle} title={t('sidebar.collapse')} data-testid="sidebar-toggle"
              className="p-1.5 rounded-md text-text-quaternary hover:text-primary hover:bg-surface transition-colors">
              <span className="material-symbols-outlined text-[18px]">left_panel_close</span>
            </button>
          )}
        </div>
        {collapsed && (
          <button onClick={toggle} title={t('sidebar.expand')} data-testid="sidebar-toggle"
            className="mx-auto p-1.5 rounded-md text-muted hover:text-primary hover:bg-surface transition-colors no-drag">
            <span className="material-symbols-outlined text-[18px]">left_panel_open</span>
          </button>
        )}
        <nav className="flex flex-col gap-1 no-drag">
          {navTop.map((n) => <NavButton key={n.id} def={n} />)}
        </nav>
      </div>

      {!collapsed && (
        <div className="flex-1 flex flex-col min-h-0 px-4 no-drag">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-text-quaternary">{t('folders.title')}</span>
            <div className="flex items-center gap-1">
              <button onClick={() => { onNavigate('dictate'); onNewNote?.(); }} title={t('notes.new')} data-testid="sidebar-new-note"
                className="p-1.5 rounded-full text-text-quaternary hover:text-primary hover:bg-surface transition-colors"><span className="material-symbols-outlined text-[15px]">add_notes</span></button>
              <button onClick={handleNewFolder} title={t('folders.new')} data-testid="sidebar-new-folder"
                className="p-1.5 rounded-full text-text-quaternary hover:text-primary hover:bg-surface transition-colors"><span className="material-symbols-outlined text-[15px]">create_new_folder</span></button>
            </div>
          </div>
          {createError && <p className="text-xs text-red-400 mb-1">{createError}</p>}
          <div className="flex-1 overflow-y-auto">
            <FolderTree documents={documents} onDeleteFolder={onDeleteFolder ?? (() => {})} />
          </div>
        </div>
      )}

      <div className={`flex flex-col gap-1 ${collapsed ? 'p-2' : 'p-4'} border-t border-edge no-drag shrink-0`}>
        {user && !collapsed && (
          <div className="px-3 py-2.5 mb-2 rounded-lg bg-surface/50 border border-edge" data-testid="plan-card">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-text-tertiary">{t('usage.plan')}</span>
              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${plan === 'pro' ? 'bg-purple-500/15 text-purple-400' : plan === 'basic' ? 'bg-primary/15 text-primary' : 'bg-edge text-muted'}`}>{plan}</span>
            </div>
            {atRisk.length > 0 ? (
              <div className="flex flex-col gap-1.5 mb-2">
                {atRisk.map(({ resource, pct }) => (
                  <div key={String(resource)} className="flex items-center gap-2">
                    <span className="text-[10px] text-text-quaternary truncate flex-1">{t(RESOURCE_LABELS[String(resource)])}</span>
                    <div className="w-12 h-1 bg-edge rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${pct >= 90 ? 'bg-red-500' : 'bg-amber-500'}`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[10px] text-text-quaternary w-7 text-right">{pct}%</span>
                  </div>
                ))}
              </div>
            ) : <p className="text-[10px] text-text-quaternary mb-2">{t('sidebar.allGood')}</p>}
            {plan === 'free' && (
              <button onClick={onOpenPricing} data-testid="sidebar-upgrade"
                className="w-full py-1.5 bg-gradient-to-r from-primary to-purple-500 text-white text-xs font-semibold tracking-[0.14px] rounded-full shadow-[var(--theme-shadow-card)] hover:brightness-110 hover:-translate-y-[0.5px] active:brightness-95 transition-all">{t('upgrade.button')}</button>
            )}
          </div>
        )}
        <button onClick={() => onNavigate('history')} data-testid="nav-history" title={collapsed ? t('nav.history') : undefined}
          className={`flex items-center ${collapsed ? 'justify-center px-2' : 'gap-3 px-3'} py-2 rounded-full tracking-[0.14px] transition-all ${page === 'history' ? 'bg-[var(--theme-warm)] text-primary shadow-[var(--theme-shadow-inset-border)]' : 'text-text-tertiary hover:text-text hover:bg-surface/70'}`}>
          <span className="material-symbols-outlined text-[17px]">history</span>
          {!collapsed && <span className="text-[12.5px]">{t('nav.history')}</span>}
        </button>
        <button onClick={() => onNavigate('logs')} data-testid="nav-logs" title={collapsed ? t('nav.logs') : undefined}
          className={`flex items-center ${collapsed ? 'justify-center px-2' : 'gap-3 px-3'} py-2 rounded-full tracking-[0.14px] transition-all ${page === 'logs' ? 'bg-[var(--theme-warm)] text-primary shadow-[var(--theme-shadow-inset-border)]' : 'text-text-tertiary hover:text-text hover:bg-surface/70'}`}>
          <span className="material-symbols-outlined text-[17px]">bug_report</span>
          {!collapsed && <span className="text-[12.5px]">{t('nav.logs')}</span>}
        </button>
        <button onClick={onOpenSettings} data-testid="nav-settings" title={collapsed ? t('sidebar.settings') : undefined}
          className={`flex items-center ${collapsed ? 'justify-center px-2' : 'gap-3 px-3'} py-2 rounded-full tracking-[0.14px] text-text-tertiary hover:text-text hover:bg-surface/70 transition-all`}>
          <span className="material-symbols-outlined text-[17px]">settings</span>
          {!collapsed && <span className="text-[12.5px]">{t('sidebar.settings')}</span>}
        </button>
        {!collapsed && <UserMenu />}
        <VersionBadge collapsed={collapsed} />
      </div>
    </aside>
  );
}
