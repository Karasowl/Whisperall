import { useState } from 'react';
import type { Page } from '../../App';
import { UserMenu } from './UserMenu';
import { usePlanStore } from '../../stores/plan';
import { useAuthStore } from '../../stores/auth';
import { useFoldersStore } from '../../stores/folders';
import { useDocumentsStore } from '../../stores/documents';
import { FolderTree } from '../notes/FolderTree';
import { useT } from '../../lib/i18n';
import type { UsageRecord } from '@whisperall/api-client';

const RESOURCES: (keyof UsageRecord)[] = ['stt_seconds', 'transcribe_seconds', 'tts_chars', 'translate_chars', 'ai_edit_tokens', 'notes_count', 'storage_bytes'];
const RESOURCE_LABELS: Record<string, string> = {
  stt_seconds: 'usage.dictation', transcribe_seconds: 'usage.transcription', tts_chars: 'usage.tts',
  translate_chars: 'usage.translation', ai_edit_tokens: 'usage.aiEditing', notes_count: 'usage.notes', storage_bytes: 'usage.storage',
};

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
  const [createError, setCreateError] = useState('');

  const atRisk = user
    ? RESOURCES.map((r) => ({ resource: r, pct: usagePercent(r) })).filter((x) => x.pct >= 70).sort((a, b) => b.pct - a.pct).slice(0, 2)
    : [];

  const handleNewFolder = async () => {
    setCreateError('');
    try { await createFolder(t('folders.untitled')); } catch { setCreateError(t('folders.createError')); }
  };

  return (
    <aside className="w-64 flex flex-col border-r border-edge bg-surface-alt shrink-0 z-20" data-testid="sidebar">
      {/* Brand + Quick actions */}
      <div className="flex flex-col gap-4 p-4 pt-12 drag-region shrink-0">
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
          <button data-testid="nav-dictate" onClick={() => onNavigate('dictate')}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${page === 'dictate' ? 'bg-primary/10 text-primary' : 'text-muted hover:bg-surface hover:text-text'}`}>
            <span className={`material-symbols-outlined text-[24px] ${page === 'dictate' ? 'fill-1' : ''}`}>note_stack</span>
            <span className={`text-sm ${page === 'dictate' ? 'font-semibold' : 'font-medium'}`}>{t('nav.notes')}</span>
          </button>
        </nav>
        <div className="flex flex-col gap-2 no-drag">
          <button onClick={() => { onNavigate('dictate'); onNewNote?.(); }} className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors" data-testid="sidebar-new-note">
            <span className="material-symbols-outlined text-[18px]">add</span>{t('notes.new')}
          </button>
          <button onClick={() => { onNavigate('dictate'); onVoiceNote?.(); }} className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-surface border border-edge text-muted text-sm font-medium hover:text-primary hover:border-primary/30 transition-colors" data-testid="sidebar-voice-note">
            <span className="material-symbols-outlined text-[18px] fill-1">mic</span>{t('notes.voiceNote')}
          </button>
        </div>
      </div>

      {/* Folders */}
      <div className="flex-1 flex flex-col min-h-0 px-4 no-drag">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted/70">{t('folders.title')}</span>
          <button onClick={handleNewFolder} className="p-1 rounded text-muted hover:text-primary transition-colors" title={t('folders.new')} data-testid="sidebar-new-folder">
            <span className="material-symbols-outlined text-[16px]">create_new_folder</span>
          </button>
        </div>
        {createError && <p className="text-xs text-red-400 mb-1">{createError}</p>}
        <div className="flex-1 overflow-y-auto">
          <FolderTree documents={documents} onDeleteFolder={onDeleteFolder ?? (() => {})} />
        </div>
      </div>

      {/* Bottom: Plan + History/Settings + User */}
      <div className="flex flex-col gap-1 p-4 border-t border-edge no-drag shrink-0">
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
                  <div key={String(resource)} className="flex items-center gap-2">
                    <span className="text-[10px] text-muted truncate flex-1">{t(RESOURCE_LABELS[String(resource)])}</span>
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
        <button onClick={() => onNavigate('history')} data-testid="nav-history"
          className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${page === 'history' ? 'bg-primary/10 text-primary' : 'text-muted hover:bg-surface hover:text-text'}`}>
          <span className="material-symbols-outlined text-[24px]">history</span>
          <span className="text-sm font-medium">{t('nav.history')}</span>
        </button>
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
