import { useAuthStore } from '../../stores/auth';
import { usePlanStore } from '../../stores/plan';
import { useT } from '../../lib/i18n';

export function UserMenu() {
  const t = useT();
  const { user, signInWithGoogle, signOut, loading } = useAuthStore();
  const plan = usePlanStore((s) => s.plan);

  if (!user) {
    return (
      <button
        onClick={signInWithGoogle}
        disabled={loading}
        data-testid="sign-in-btn"
        className="flex items-center gap-3 px-3 py-3 mt-2 border-t border-edge pt-4 text-muted hover:text-text transition-colors text-sm"
      >
        <span className="material-symbols-outlined text-[20px]">login</span>
        {t('user.signIn')}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-3 px-3 py-3 mt-2 border-t border-edge pt-4">
      <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold">
        {user.email?.charAt(0).toUpperCase() ?? '?'}
      </div>
      <div className="flex flex-col flex-1 min-w-0">
        <span className="text-sm font-medium text-text truncate">{user.email}</span>
        <span className="text-xs text-muted capitalize">{plan} {t('user.plan')}</span>
      </div>
      <button
        onClick={signOut}
        data-testid="sign-out-btn"
        className="text-muted hover:text-text transition-colors"
        title={t('user.signOut')}
      >
        <span className="material-symbols-outlined text-[18px]">logout</span>
      </button>
    </div>
  );
}
