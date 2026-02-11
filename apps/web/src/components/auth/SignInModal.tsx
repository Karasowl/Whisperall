'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '../shared/Button';

type Props = { onClose: () => void };

function friendlyError(msg: string): string {
  if (msg === 'Invalid login credentials') return 'Wrong email or password. Please try again.';
  if (msg === 'Email not confirmed') return 'Please confirm your email before signing in.';
  if (msg === 'User already registered') return 'An account with this email already exists. Try signing in.';
  if (/rate limit/i.test(msg)) return 'Too many attempts. Please wait a minute.';
  return msg;
}

export function SignInModal({ onClose }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const sb = createClient();

    if (mode === 'register') {
      const { error: err } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: `${location.origin}/auth/callback` } });
      setLoading(false);
      if (err) { setError(friendlyError(err.message)); return; }
      setSent(true);
    } else {
      const { error: err } = await sb.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (err) { setError(friendlyError(err.message)); return; }
      onClose();
      location.href = '/dashboard';
    }
  };

  const handleGoogle = async () => {
    const sb = createClient();
    await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${location.origin}/auth/callback` } });
  };

  if (sent) {
    return (
      <Overlay onClose={onClose}>
        <div className="text-center">
          <span className="material-symbols-outlined text-primary text-[48px] mb-4">mark_email_read</span>
          <h2 className="text-xl font-bold text-text mb-2">Check your inbox</h2>
          <p className="text-sm text-muted mb-1">We sent a confirmation link to <strong className="text-text">{email}</strong></p>
          <p className="text-xs text-muted">Click the link in the email to activate your account.</p>
        </div>
      </Overlay>
    );
  }

  return (
    <Overlay onClose={onClose}>
      <h2 className="text-xl font-bold text-text mb-1">{mode === 'login' ? 'Welcome back' : 'Get started'}</h2>
      <p className="text-sm text-muted mb-6">{mode === 'login' ? 'Sign in to your account.' : 'Create an account to start.'}</p>

      <button data-testid="signin-google" onClick={handleGoogle} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-edge bg-surface text-sm font-medium text-text hover:bg-surface-alt transition-colors mb-4">
        <svg className="w-4 h-4" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
        Continue with Google
      </button>

      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 h-px bg-edge" />
        <span className="text-xs text-muted">or</span>
        <div className="flex-1 h-px bg-edge" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <input data-testid="signin-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" required className="w-full px-4 py-2.5 rounded-xl border border-edge bg-surface-alt text-sm text-text placeholder:text-muted focus:outline-none focus:border-primary" />
        <input data-testid="signin-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" required minLength={6} className="w-full px-4 py-2.5 rounded-xl border border-edge bg-surface-alt text-sm text-text placeholder:text-muted focus:outline-none focus:border-primary" />
        {error && <p data-testid="signin-error" className="text-xs text-red-400">{error}</p>}
        <Button data-testid="signin-submit" type="submit" disabled={loading}>{loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}</Button>
      </form>

      <p className="text-xs text-muted mt-4 text-center">
        {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
        <button onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }} className="text-primary hover:underline">
          {mode === 'login' ? 'Sign up' : 'Sign in'}
        </button>
      </p>
    </Overlay>
  );
}

function Overlay({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div data-testid="signin-modal" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-surface border border-edge rounded-2xl w-full max-w-sm p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-end mb-2">
          <button data-testid="signin-close" onClick={onClose} className="text-muted hover:text-text"><span className="material-symbols-outlined text-[20px]">close</span></button>
        </div>
        {children}
      </div>
    </div>
  );
}
