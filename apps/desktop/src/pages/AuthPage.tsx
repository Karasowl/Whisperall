import { useState } from 'react';
import { useAuthStore } from '../stores/auth';
import { useT } from '../lib/i18n';

const FEATURE_KEYS = [
  { icon: 'mic', label: 'auth.feat1', desc: 'auth.feat1Desc' },
  { icon: 'translate', label: 'auth.feat2', desc: 'auth.feat2Desc' },
  { icon: 'subtitles', label: 'auth.feat3', desc: 'auth.feat3Desc' },
];

const FRIENDLY_ERROR_KEYS: Record<string, string> = {
  'Invalid login credentials': 'auth.errWrongCreds',
  'Email not confirmed': 'auth.errConfirmEmail',
  'User already registered': 'auth.errExists',
  'Signup requires a valid password': 'auth.errPassword',
  'Email rate limit exceeded': 'auth.errRateLimit',
};

/* ── Email Confirmation Screen ── */
function CheckEmailView({ email, onBack, t }: { email: string; onBack: () => void; t: (k: string) => string }) {
  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15">
        <span className="material-symbols-outlined text-primary text-3xl">mark_email_read</span>
      </div>
      <div>
        <h2 className="text-[22px] font-bold text-text tracking-tight">{t('auth.checkInbox')}</h2>
        <p className="mt-2 text-[13px] text-muted leading-relaxed max-w-[300px]">
          {t('auth.confirmSent')}<br />
          <span className="font-medium text-text">{email}</span>
        </p>
      </div>
      <div className="flex flex-col gap-2 w-full rounded-xl bg-white/[0.03] border border-white/[0.06] p-4">
        <div className="flex items-start gap-3">
          <span className="material-symbols-outlined text-primary text-lg mt-0.5">inbox</span>
          <p className="text-[12px] text-muted leading-relaxed text-left">{t('auth.confirmHelp')}</p>
        </div>
        <div className="flex items-start gap-3">
          <span className="material-symbols-outlined text-primary text-lg mt-0.5">schedule</span>
          <p className="text-[12px] text-muted leading-relaxed text-left">{t('auth.confirmExpiry')}</p>
        </div>
      </div>
      <button onClick={onBack} data-testid="auth-back-to-login"
        className="mt-2 w-full rounded-xl border border-white/[0.08] bg-white/[0.04] py-3 text-[13px] font-medium text-text transition-all hover:bg-white/[0.08] active:scale-[0.98]">
        {t('auth.backToLogin')}
      </button>
    </div>
  );
}

/* ── Main Auth Form ── */
export function AuthPage() {
  const t = useT();
  const { signIn, signUp, signInWithGoogle, loading, error, signUpSuccess, signUpEmail, clearSignUpSuccess } = useAuthStore();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'login') await signIn(email, password);
    else await signUp(email, password);
  };

  const handleToggleMode = () => {
    clearSignUpSuccess();
    setMode(mode === 'login' ? 'register' : 'login');
  };

  const friendlyError = (msg: string) => {
    const key = FRIENDLY_ERROR_KEYS[msg];
    return key ? t(key) : msg;
  };

  return (
    <div className="flex h-screen font-display overflow-hidden">
      <div className="drag-region fixed top-0 left-0 right-0 h-10 z-50" />

      {/* ── Left: Form ── */}
      <div className="flex w-[480px] shrink-0 flex-col justify-between bg-base px-14 py-10">
        <div className="flex items-center gap-2.5 no-drag">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <span className="material-symbols-outlined text-white text-lg fill-1">graphic_eq</span>
          </div>
          <span className="text-[15px] font-semibold text-text tracking-tight">Whisperall</span>
        </div>

        <div className="flex flex-col gap-7">
          {signUpSuccess && signUpEmail ? (
            <CheckEmailView email={signUpEmail} onBack={() => { clearSignUpSuccess(); setMode('login'); }} t={t} />
          ) : (
            <>
              <div>
                <h1 className="text-[28px] font-bold text-text tracking-tight leading-tight">
                  {mode === 'login' ? t('auth.welcome') : t('auth.getStarted')}
                </h1>
                <p className="mt-2 text-[13px] text-muted leading-relaxed">
                  {mode === 'login' ? t('auth.signInDesc') : t('auth.signUpDesc')}
                </p>
              </div>

              <button onClick={signInWithGoogle} disabled={loading} data-testid="google-sign-in"
                className="flex w-full items-center justify-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.04] py-3 text-[13px] font-medium text-text transition-all hover:bg-white/[0.08] hover:border-white/[0.12] active:scale-[0.98] disabled:opacity-50">
                <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                {loading ? t('auth.connecting') : t('auth.google')}
              </button>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-white/[0.06]" />
                <span className="text-[11px] text-muted/50 uppercase tracking-[0.15em]">{t('auth.or')}</span>
                <div className="flex-1 h-px bg-white/[0.06]" />
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                <input type="email" placeholder={t('auth.email')} value={email} onChange={(e) => setEmail(e.target.value)} required disabled={loading} data-testid="auth-email"
                  className="w-full rounded-xl border border-white/[0.06] bg-white/[0.03] py-3 px-4 text-[13px] text-text placeholder:text-muted focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20 transition-all disabled:opacity-50" />
                <input type="password" placeholder={t('auth.password')} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} disabled={loading} data-testid="auth-password"
                  className="w-full rounded-xl border border-white/[0.06] bg-white/[0.03] py-3 px-4 text-[13px] text-text placeholder:text-muted focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20 transition-all disabled:opacity-50" />
                <button type="submit" disabled={loading} data-testid="auth-submit"
                  className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-[13px] font-semibold text-white transition-all hover:bg-primary/90 active:scale-[0.98] disabled:opacity-70">
                  {loading && <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                  {loading ? t('auth.wait') : mode === 'login' ? t('auth.signIn') : t('auth.signUp')}
                </button>
              </form>

              {error && (
                <div className="flex items-start gap-2.5 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3" data-testid="auth-error">
                  <span className="material-symbols-outlined text-red-400 text-lg mt-0.5 shrink-0">error</span>
                  <p className="text-[12px] text-red-300 leading-relaxed">{friendlyError(error)}</p>
                </div>
              )}

              <p className="text-[12px] text-muted/70 text-center">
                {mode === 'login' ? t('auth.noAccount') : t('auth.hasAccount')}
                <button onClick={handleToggleMode} data-testid="auth-toggle" className="text-primary font-medium hover:underline underline-offset-2">
                  {mode === 'login' ? t('auth.signUpLink') : t('auth.signInLink')}
                </button>
              </p>
            </>
          )}
        </div>

        <p className="text-[11px] text-muted/30 tracking-wide">{t('auth.version')}</p>
      </div>

      {/* ── Right: Animated Showcase ── */}
      <div className="relative flex-1 flex flex-col items-center justify-center overflow-hidden bg-surface-alt">
        <style>{`
          @keyframes drift1{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(40px,-50px) scale(1.15)}}
          @keyframes drift2{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(-50px,30px) scale(1.1)}}
          @keyframes drift3{0%,100%{transform:translate(0,0)}33%{transform:translate(20px,40px)}66%{transform:translate(-30px,-20px)}}
          @keyframes text-glow{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}
          @keyframes bar{0%,100%{transform:scaleY(0.3)}50%{transform:scaleY(1)}}
          @keyframes card-in{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
          .orb-a{animation:drift1 12s ease-in-out infinite}
          .orb-b{animation:drift2 16s ease-in-out infinite}
          .orb-c{animation:drift3 20s ease-in-out infinite}
          .glow-text{background-size:200% 200%;animation:text-glow 4s ease-in-out infinite}
          .wave-bar{animation:bar var(--d,1s) ease-in-out infinite;animation-delay:var(--dl,0s)}
          .card-enter{animation:card-in 0.6s ease-out both}
        `}</style>

        <div className="orb-a absolute top-[10%] left-[20%] h-[450px] w-[450px] rounded-full opacity-60 pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(19,127,236,0.25) 0%, transparent 65%)' }} />
        <div className="orb-b absolute bottom-[5%] right-[10%] h-[350px] w-[350px] rounded-full opacity-50 pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.2) 0%, transparent 65%)' }} />
        <div className="orb-c absolute top-[50%] left-[50%] h-[250px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-30 pointer-events-none" style={{ background: 'radial-gradient(ellipse, rgba(56,189,248,0.15) 0%, transparent 60%)' }} />

        <div className="relative z-10 flex flex-col items-center gap-10 px-12">
          <div className="flex items-end gap-[3px] h-12">
            {[0.7,1,0.5,0.8,0.4,1,0.6,0.9,0.3,0.7,1,0.5,0.8,0.6,0.9,0.4,1,0.7,0.5,0.8].map((h, i) => (
              <div key={i} className="wave-bar w-[3px] rounded-full bg-primary/40 origin-bottom" style={{ height: `${h * 48}px`, '--d': `${0.8 + (i % 5) * 0.2}s`, '--dl': `${i * 0.08}s` } as React.CSSProperties} />
            ))}
          </div>

          <div className="text-center">
            <p className="text-[42px] font-bold tracking-tight leading-[1.1]">
              <span className="text-text">{t('auth.hero1')}</span><br />
              <span className="glow-text bg-gradient-to-r from-primary via-blue-400 to-indigo-400 bg-clip-text text-transparent">{t('auth.hero2')}</span>
            </p>
            <p className="mt-4 text-[15px] text-muted leading-relaxed max-w-[340px]">{t('auth.heroDesc')}</p>
          </div>

          <div className="flex flex-col gap-3 w-full max-w-[340px]">
            {FEATURE_KEYS.map((f, i) => (
              <div key={f.icon} className="card-enter flex items-center gap-4 rounded-2xl bg-white/[0.04] border border-white/[0.06] px-5 py-4 backdrop-blur-sm" style={{ animationDelay: `${0.2 + i * 0.15}s` }}>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15">
                  <span className="material-symbols-outlined text-primary text-xl">{f.icon}</span>
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-text">{t(f.label)}</p>
                  <p className="text-[12px] text-muted/70">{t(f.desc)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
