import { useEffect, useState } from 'react';
import { LogOut, User, Mail, Clock, Calendar, CheckCircle, ChevronRight, Moon, Sun } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';

interface WeekStats {
  total_hours: number;
  days_worked: number;
  pending_approvals: number;
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string; icon: typeof Clock; color: string }) {
  return (
    <div
      className="flex-1 rounded-2xl p-4 flex flex-col gap-1"
      style={{ background: 'var(--color-surface-mid)', border: '1px solid var(--color-surface-high)' }}
    >
      <Icon size={16} style={{ color }} />
      <p className="text-xl font-bold mt-1" style={{ color: 'var(--color-text)' }}>{value}</p>
      <p className="text-xs" style={{ color: 'var(--color-text-subtle)' }}>{label}</p>
    </div>
  );
}

export default function ProfileScreen() {
  const { user, signOut, companyId, userTimezone } = useAuth();
  const [stats, setStats] = useState<WeekStats | null>(null);

  useEffect(() => {
    // Derive this-week hours from entries
    api.getMyEntries(companyId).then((entries: unknown) => {
      const arr = entries as Array<{
        clock_in: string; clock_out: string | null; status: string;
      }>;
      const now   = new Date();
      const day   = now.getDay();
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - day);
      weekStart.setHours(0, 0, 0, 0);

      let ms = 0;
      let days = 0;
      let pending = 0;
      arr.forEach(e => {
        const cin = new Date(e.clock_in);
        if (cin >= weekStart) {
          if (e.clock_out) { ms += new Date(e.clock_out).getTime() - cin.getTime(); days++; }
          if (e.status === 'SUBMITTED') pending++;
        }
      });
      setStats({
        total_hours: parseFloat((ms / 3600000).toFixed(1)),
        days_worked: days,
        pending_approvals: pending,
      });
    });
  }, [companyId]);

  const fullName  = user?.user_metadata?.full_name ?? 'Worker';
  const initials  = fullName.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase();
  const email     = user?.email ?? '';

  return (
    <div className="flex-1 px-4 pt-6 pb-4 overflow-y-auto page-enter">

      <h1 className="text-xl font-bold mb-5" style={{ color: 'var(--color-text)' }}>Profile</h1>

      {/* Avatar + name */}
      <div className="flex items-center gap-4 mb-5">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-bold flex-shrink-0"
          style={{ background: 'var(--color-primary)' }}
        >
          {initials || <User size={24} />}
        </div>
        <div>
          <p className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>{fullName}</p>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{email}</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-subtle)' }}>{userTimezone}</p>
        </div>
      </div>

      {/* This week stats */}
      {stats && (
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--color-text-subtle)' }}>
            This Week
          </p>
          <div className="flex gap-3">
            <StatCard
              label="Hours Worked"
              value={`${stats.total_hours}h`}
              icon={Clock}
              color="var(--color-primary)"
            />
            <StatCard
              label="Days Worked"
              value={String(stats.days_worked)}
              icon={Calendar}
              color="var(--color-success)"
            />
            <StatCard
              label="Pending"
              value={String(stats.pending_approvals)}
              icon={CheckCircle}
              color={stats.pending_approvals > 0 ? '#FCD34D' : 'var(--color-text-subtle)'}
            />
          </div>
        </div>
      )}

      {/* Account section */}
      <div
        className="rounded-2xl overflow-hidden mb-4"
        style={{ background: 'var(--color-surface-mid)', border: '1px solid var(--color-surface-high)' }}
      >
        <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--color-surface-high)' }}>
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-text-subtle)' }}>
            Account
          </p>
        </div>

        <div className="flex items-center gap-3 px-4 py-4" style={{ borderBottom: '1px solid var(--color-surface-high)' }}>
          <Mail size={17} style={{ color: 'var(--color-text-subtle)' }} />
          <div className="flex-1 min-w-0">
            <p className="text-xs" style={{ color: 'var(--color-text-subtle)' }}>Email</p>
            <p className="text-sm truncate" style={{ color: 'var(--color-text)' }}>{email}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 px-4 py-4">
          <Clock size={17} style={{ color: 'var(--color-text-subtle)' }} />
          <div className="flex-1">
            <p className="text-xs" style={{ color: 'var(--color-text-subtle)' }}>Timezone</p>
            <p className="text-sm" style={{ color: 'var(--color-text)' }}>{userTimezone || 'Not set'}</p>
          </div>
          <ChevronRight size={16} style={{ color: 'var(--color-text-subtle)' }} />
        </div>
      </div>

      {/* Sign out */}
      <button
        onClick={signOut}
        className="w-full flex items-center justify-center gap-2 rounded-2xl font-semibold text-sm transition-all active:scale-[0.98]"
        style={{
          height: 50,
          background: 'rgba(220,38,38,0.1)',
          border: '1px solid rgba(220,38,38,0.25)',
          color: 'var(--color-error)',
        }}
      >
        <LogOut size={17} /> Sign Out
      </button>
    </div>
  );
}
