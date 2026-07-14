import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { AuthContext } from './lib/auth';
import AuthScreen from './screens/AuthScreen';
import ClockScreen from './screens/ClockScreen';
import HistoryScreen from './screens/HistoryScreen';
import LeaveScreen from './screens/LeaveScreen';
import ProfileScreen from './screens/ProfileScreen';
import BottomNav from './components/BottomNav';
import ManualEntryScreen from './screens/ManualEntryScreen';

interface UserProfile {
  full_name: string | null;
  company_id: string | null;
  project_id: string | null;
  role: string | null;
  has_leave_access: boolean;
  has_report_access: boolean;
}

export default function App() {
  const [user,    setUser]    = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Fetch profile from public.users + memberships after login
  const fetchProfile = async (uid: string) => {
    const [{ data: userData }, { data: memberData }] = await Promise.all([
      supabase
        .from('users')
        .select('first_name, last_name, role, has_leave_access, has_report_access')
        .eq('id', uid)
        .single(),
      supabase
        .from('memberships')
        .select('company_id, project_id')
        .eq('user_id', uid)
        .is('deleted_at', null)
        .limit(1)
        .single(),
    ]);

    setProfile({
      full_name: userData
        ? [userData.first_name, userData.last_name].filter(Boolean).join(' ') || null
        : null,
      company_id: memberData?.company_id ?? null,
      project_id: memberData?.project_id ?? null,
      role: userData?.role ?? 'worker',
      has_leave_access: userData?.has_leave_access ?? false,
      has_report_access: userData?.has_report_access ?? false,
    });
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user ?? null;
      setSession(data.session);
      setUser(u);
      if (u) fetchProfile(u.id).finally(() => setLoading(false));
      else setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => {
      const u = s?.user ?? null;
      setSession(s);
      setUser(u);
      if (u) fetchProfile(u.id);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const signOut = async () => { await supabase.auth.signOut(); };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--color-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
          style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }} />
      </div>
    );
  }

  if (!user) return <AuthScreen />;

  // Merge: profile from DB takes priority over user_metadata (fallback)
  const fullUser = {
    ...user,
    user_metadata: {
      ...user.user_metadata,
      full_name:  profile?.full_name  ?? user.user_metadata?.full_name  ?? '',
      company_id: profile?.company_id ?? user.user_metadata?.company_id ?? '',
      project_id: profile?.project_id ?? user.user_metadata?.project_id ?? '',
      role:       profile?.role       ?? user.user_metadata?.role       ?? 'WORKER',
    },
  } as User;

  const companyId      = fullUser.user_metadata.company_id ?? '';
  const projectId      = fullUser.user_metadata.project_id ?? '';
  const role           = profile?.role ?? 'worker';
  const hasLeaveAccess  = profile?.has_leave_access ?? false;
  const hasReportAccess = profile?.has_report_access ?? false;

  return (
    <AuthContext.Provider value={{ user: fullUser, session, companyId, projectId, userTimezone, role, hasLeaveAccess, hasReportAccess, loading, signOut }}>
      <BrowserRouter>
        <div style={{ minHeight: '100vh', background: 'var(--color-surface)', display: 'flex', flexDirection: 'column' }}>
          <div className="flex-1 flex flex-col overflow-y-auto pb-20">
            <Routes>
              <Route path="/" element={<Navigate to="/clock" replace />} />
              <Route path="/clock"        element={<ClockScreen />} />
              <Route path="/history"      element={<HistoryScreen />} />
              <Route path="/leave"        element={<LeaveScreen />} />
              <Route path="/profile"      element={<ProfileScreen />} />
              <Route path="/manual-entry" element={<ManualEntryScreen />} />
            </Routes>
          </div>
          <BottomNav />
        </div>
      </BrowserRouter>
    </AuthContext.Provider>
  );
}
