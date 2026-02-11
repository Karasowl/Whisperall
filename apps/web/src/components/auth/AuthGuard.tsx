'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';

type Props = { children: (user: User) => ReactNode; fallback?: ReactNode };

export function AuthGuard({ children, fallback }: Props) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const sb = createClient();
    sb.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setLoading(false);
    });
    const { data: { subscription } } = sb.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (event === 'SIGNED_OUT') {
        window.location.href = '/';
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><span className="text-muted">Loading...</span></div>;
  if (!user) return fallback ?? <AuthFallback />;
  return <>{children(user)}</>;
}

function AuthFallback() {
  return (
    <div data-testid="auth-fallback" className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <span className="material-symbols-outlined text-muted text-[48px]">lock</span>
      <h2 className="text-xl font-bold text-text">Sign in required</h2>
      <p className="text-sm text-muted">Please sign in to access your dashboard.</p>
      <a href="/?signin=1" className="text-sm font-medium text-primary hover:underline">Sign In</a>
    </div>
  );
}
