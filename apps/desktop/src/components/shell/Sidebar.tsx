import type { Page } from '../../App';

const NAV_ITEMS: { id: Page; label: string; icon: string }[] = [
  { id: 'dictate', label: 'Dictate', icon: 'mic' },
  { id: 'transcribe', label: 'Transcribe', icon: 'transcribe' },
  { id: 'editor', label: 'Editor', icon: 'edit_note' },
  { id: 'history', label: 'History', icon: 'history' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

type SidebarProps = {
  page: Page;
  onNavigate: (page: Page) => void;
};

export function Sidebar({ page, onNavigate }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">Whisperall</div>
      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            className={`sidebar-link${item.id === page ? ' active' : ''}`}
            onClick={() => onNavigate(item.id)}
          >
            <span className="material-symbols-outlined">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>
    </aside>
  );
}
