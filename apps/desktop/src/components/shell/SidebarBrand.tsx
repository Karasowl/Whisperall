import { useT } from '../../lib/i18n';

type Props = {
  notesActive: boolean;
  onOpenNotes: () => void;
};

export function SidebarBrand({ notesActive, onOpenNotes }: Props) {
  const t = useT();

  return (
    <>
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
        <button
          data-testid="nav-dictate"
          onClick={onOpenNotes}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${notesActive ? 'bg-primary/10 text-primary' : 'text-muted hover:bg-surface hover:text-text'}`}
        >
          <span className={`material-symbols-outlined text-[24px] ${notesActive ? 'fill-1' : ''}`}>note_stack</span>
          <span className={`text-sm ${notesActive ? 'font-semibold' : 'font-medium'}`}>{t('nav.notes')}</span>
        </button>
      </nav>
    </>
  );
}

