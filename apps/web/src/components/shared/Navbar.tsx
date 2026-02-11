'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button } from './Button';
import { ThemeToggle } from './ThemeToggle';
import { SignInModal } from '../auth/SignInModal';
import { createClient } from '@/lib/supabase/client';

const NAV_LINKS = [
  { label: 'Pricing', href: '/pricing' },
  { label: 'Download', href: '/download' },
];

export function Navbar() {
  const [open, setOpen] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);

  useEffect(() => {
    const sb = createClient();
    sb.auth.getUser().then(({ data }) => setLoggedIn(!!data.user));
    const { data: { subscription } } = sb.auth.onAuthStateChange((_e, session) => setLoggedIn(!!session?.user));
    // Handle URL params: ?signin=1 auto-opens modal, ?error= shows banner
    const params = new URLSearchParams(window.location.search);
    if (params.get('signin') === '1') setShowAuth(true);
    const err = params.get('error');
    if (err) {
      setUrlError(decodeURIComponent(err));
      window.history.replaceState({}, '', window.location.pathname);
    }
    return () => subscription.unsubscribe();
  }, []);

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-edge bg-base/80 backdrop-blur-md">
        <nav className="max-w-7xl mx-auto flex items-center justify-between px-6 h-16">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
              <span className="material-symbols-outlined text-primary text-[20px]">graphic_eq</span>
            </div>
            <span className="text-lg font-bold text-text">WhisperAll</span>
          </Link>

          <div className="hidden md:flex items-center gap-6">
            {NAV_LINKS.map(({ label, href }) => (
              <Link key={href} href={href} className="text-sm font-medium text-muted hover:text-text transition-colors">{label}</Link>
            ))}
            <ThemeToggle />
            {loggedIn ? (
              <Button href="/dashboard" size="sm" variant="secondary">Dashboard</Button>
            ) : (
              <>
                <button data-testid="nav-signin" onClick={() => setShowAuth(true)} className="text-sm font-medium text-muted hover:text-text transition-colors">Sign In</button>
                <Button href="/download" size="sm">Download Free</Button>
              </>
            )}
          </div>

          <button data-testid="nav-menu" className="md:hidden p-2 text-muted hover:text-text" onClick={() => setOpen(!open)} aria-label="Menu">
            <span className="material-symbols-outlined">{open ? 'close' : 'menu'}</span>
          </button>
        </nav>

        {open && (
          <div className="md:hidden border-t border-edge bg-base px-6 py-4 flex flex-col gap-3">
            {NAV_LINKS.map(({ label, href }) => (
              <Link key={href} href={href} className="text-sm font-medium text-muted hover:text-text" onClick={() => setOpen(false)}>{label}</Link>
            ))}
            <div className="flex items-center gap-3 pt-2">
              <ThemeToggle />
              {loggedIn ? (
                <Button href="/dashboard" size="sm" variant="secondary">Dashboard</Button>
              ) : (
                <>
                  <button onClick={() => { setShowAuth(true); setOpen(false); }} className="text-sm font-medium text-muted hover:text-text">Sign In</button>
                  <Button href="/download" size="sm">Download Free</Button>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      {urlError && (
        <div data-testid="url-error-banner" className="bg-amber-500/10 border-b border-amber-500/20 px-6 py-2 flex items-center gap-2 text-sm text-amber-400">
          <span className="material-symbols-outlined text-[16px]">warning</span>
          <span className="flex-1">{urlError}</span>
          <button type="button" onClick={() => setUrlError(null)} className="font-semibold hover:text-amber-300">Dismiss</button>
        </div>
      )}

      {showAuth && <SignInModal onClose={() => setShowAuth(false)} />}
    </>
  );
}
