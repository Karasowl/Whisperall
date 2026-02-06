'use client';

import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { cn } from '@/lib/utils';

const NO_SIDEBAR_ROUTES = new Set<string>(['/dictate', '/history', '/settings']);
const FULL_BLEED_ROUTES = new Set<string>([
  '/dictate',
  '/history',
  '/settings',
  '/transcribe',
  '/models',
]);

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();

  const { hideSidebar, fullBleed } = useMemo(() => {
    const normalized = pathname?.split('?')[0] || '';
    return {
      hideSidebar: NO_SIDEBAR_ROUTES.has(normalized),
      fullBleed: FULL_BLEED_ROUTES.has(normalized),
    };
  }, [pathname]);

  return (
    <div className="flex h-full relative z-10 overflow-x-hidden">
      {!hideSidebar && <Sidebar />}

      <div
        className={cn(
          'flex-1 flex flex-col min-w-0 transition-all duration-300',
          !hideSidebar && 'lg:ml-[var(--sidebar-width,16rem)]'
        )}
      >
        <div className="h-8 w-full shrink-0 electron-drag-region sticky top-0 z-40" />
        <main
          className={cn(
            'flex-1 overflow-y-auto overflow-x-hidden animate-fade-in custom-scrollbar',
            fullBleed ? 'p-0' : 'p-6 lg:p-10'
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
}

export default AppShell;
