'use client';

import { AuthGuard } from '@/components/auth/AuthGuard';
import { ApiKeysSection } from '@/components/dashboard/ApiKeysSection';
import { PlanCard } from '@/components/dashboard/PlanCard';
import { UsageMeter } from '@/components/dashboard/UsageMeter';
import { Button } from '@/components/shared/Button';
import { createClient } from '@/lib/supabase/client';

export default function DashboardPage() {
  return (
    <AuthGuard>
      {(user) => (
        <div data-testid="dashboard-page" className="space-y-8">
          <div>
            <h1 className="text-2xl font-bold text-text mb-1">Welcome back</h1>
            <p className="text-sm text-muted">{user.email}</p>
          </div>

          <PlanCard />

          <div className="p-5 rounded-2xl border border-edge bg-surface">
            <h2 className="text-sm font-bold text-text mb-4">Usage this month</h2>
            <UsageMeter />
          </div>

          <ApiKeysSection />

          <div className="flex flex-col sm:flex-row gap-3">
            <Button href="/download" variant="secondary" size="md">
              <span className="material-symbols-outlined text-[18px] mr-2">download</span>
              Download Desktop App
            </Button>
            <button
              data-testid="sign-out-btn"
              onClick={async () => {
                const sb = createClient();
                await sb.auth.signOut();
                location.href = '/';
              }}
              className="px-6 py-3 text-sm font-medium text-muted hover:text-text transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      )}
    </AuthGuard>
  );
}
