import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { AuthContext } from './lib/auth';
import AuthPage from './pages/AuthPage';
import Sidebar from './components/Sidebar';
import DashboardPage from './pages/DashboardPage';
import ApprovalsPage from './pages/ApprovalsPage';
import WorkersPage from './pages/WorkersPage';
import BudgetCodesPage from './pages/BudgetCodesPage';
import LeavePage from './pages/LeavePage';
import ReportsPage from './pages/ReportsPage';
import SettingsPage from './pages/SettingsPage';

interface Profile {
  role: string;
  company_id: string | null;
}

export default function App() {
  const [user,    setUser]    = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (uid: string) => {
    const { data: userRow } = await supabase
      .from('users')
      .select('role')
      .eq('id', uid)
      .maybeSingle();

    /* Multiple memberships caused .single() to fail and left company_id empty */
    let membershipRows:
      | { company_id: string; companies?: { name?: string } | null }[]
      | null = null;

    const withNames = await supabase
      .from('memberships')
      .select('company_id, companies(name)')
      .eq('user_id', uid)
      .is('deleted_at', null);

    if (withNames.error) {
      const plain = await supabase
        .from('memberships')
        .select('company_id')
        .eq('user_id', uid)
        .is('deleted_at', null);
      membershipRows = plain.data ?? null;
    } else {
      membershipRows = withNames.data ?? null;
    }

    let company_id: string | null = null;
    if (membershipRows && membershipRows.length > 0) {
      const rows = [...membershipRows];
      rows.sort((a, b) => {
        const na = a.companies?.name ?? '';
        const nb = b.companies?.name ?? '';
        if (na.includes('Persa')) return -1;
        if (nb.includes('Persa')) return 1;
        return na.localeCompare(nb);
      });
      company_id = rows[0].company_id;
    }

    setProfile({
      role: userRow?.role ?? 'admin',
      company_id,
    });
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user ?? null;
      setUser(u);
      if (u) fetchProfile(u.id).finally(() => setLoading(false));
      else setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_e, s) => {
      const u = s?.user ?? null;
      setUser(u);
      if (u) fetchProfile(u.id);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const signOut = async () => { await supabase.auth.signOut(); };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg)' }}>
        <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
          style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }} />
      </div>
    );
  }

  if (!user) return <AuthPage />;

  const companyId = profile?.company_id ?? user.user_metadata?.company_id ?? '';
  const role      = profile?.role ?? user.user_metadata?.role ?? 'admin';
  const userId    = user.id;

  return (
    <AuthContext.Provider value={{ user, companyId, role, userId, signOut }}>
      <BrowserRouter>
        <div className="flex h-screen overflow-hidden" style={{ background: 'var(--color-bg)' }}>
          <Sidebar />
          <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
            <Routes>
              <Route path="/"             element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard"    element={<DashboardPage />} />
              <Route path="/approvals"    element={<ApprovalsPage />} />
              <Route path="/workers"      element={<WorkersPage />} />
              <Route path="/budget-codes" element={<BudgetCodesPage />} />
              <Route path="/leave"        element={<LeavePage />} />
              <Route path="/reports"      element={<ReportsPage />} />
              <Route path="/settings"     element={<SettingsPage />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </AuthContext.Provider>
  );
}
