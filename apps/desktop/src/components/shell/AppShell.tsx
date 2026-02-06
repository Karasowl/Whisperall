import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import type { Page } from '../../App';

type AppShellProps = {
  page: Page;
  onNavigate: (page: Page) => void;
  children: ReactNode;
};

export function AppShell({ page, onNavigate, children }: AppShellProps) {
  return (
    <div className="app-shell">
      <Sidebar page={page} onNavigate={onNavigate} />
      <main className="main">{children}</main>
    </div>
  );
}
