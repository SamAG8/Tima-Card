import { useEffect, useState } from 'react';
import { Users, Clock, CheckSquare, Calendar, MapPin, AlertTriangle, FolderOpen, Tag } from 'lucide-react';
import { api, type ActiveNowRow } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useNavigate } from 'react-router-dom';
import PayrollTimeEntriesPanel from '../components/PayrollTimeEntriesPanel';

interface ActiveWorker {
  user_id: string;
  email: string;
  full_name: string | null;
  clock_in: string;
  project_name: string | null;
  user_timezone: string;
}

interface DashStats {
  active_now: number;
  pending_approvals: number;
  pending_leave: number;
  pending_adjustments: number;
  today_hours: number;
}

interface TeamEntry {
  id: string;
  user_id: string;
  worker_name: string;
  project_name: string;
  work_date: string;
  clock_in: string;
  clock_out: string | null;
  duration_minutes: number | null;
  budget_code: string | null;
  budget_code_name: string | null;
  status: string;
}

function elapsed(isoStart: string) {
  const ms = Date.now() - new Date(isoStart).getTime();
  const h  = Math.floor(ms / 3600000);
  const m  = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m.toString().padStart(2,'0')}m`;
}

function fmtDuration(minutes: number | null) {
  if (!minutes) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m.toString().padStart(2,'0')}m`;
}

function fmtDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' });
}

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  SUBMITTED: { bg: 'rgba(252,211,77,0.12)', color: '#FCD34D' },
  APPROVED:  { bg: 'rgba(74,222,128,0.12)', color: '#4ADE80' },
  REJECTED:  { bg: 'rgba(248,113,113,0.12)', color: '#F87171' },
  ACTIVE:    { bg: 'rgba(96,165,250,0.12)', color: '#60A5FA' },
};

function KpiCard({ label, value, icon: Icon, color, bg, onClick }: {
  label: string; value: string | number; icon: typeof Clock;
  color: string; bg: string; onClick?: () => void;
}) {
  return (
    <button onClick={onClick} className="flex-1 rounded-2xl p-5 text-left transition-all"
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-mid)', cursor: onClick ? 'pointer' : 'default' }}>
      <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ background: bg }}>
        <Icon size={20} style={{ color }} />
      </div>
      <p className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>{value}</p>
      <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>{label}</p>
    </button>
  );
}

// ─── Admin Dashboard ──────────────────────────────────────────────────────────
function AdminDashboard() {
  const { companyId } = useAuth();
  const navigate = useNavigate();
  const [stats,   setStats]   = useState<DashStats>({ active_now: 0, pending_approvals: 0, pending_leave: 0, pending_adjustments: 0, today_hours: 0 });
  const [workers, setWorkers] = useState<ActiveWorker[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    Promise.all([
      api.getPendingApprovals(companyId),
      api.getPendingAdjustments(companyId),
      api.getPendingLeave(companyId),
      api.getActiveNow(companyId),
    ]).then(([approvals, adjustments, leave, active]) => {
      const live = active as ActiveNowRow[];
      setWorkers(live);
      setStats(s => ({
        ...s,
        pending_approvals:   (approvals as unknown[]).length,
        pending_adjustments: (adjustments as unknown[]).length,
        pending_leave:       (leave as unknown[]).length,
        active_now:          live.length,
      }));
    }).catch(() => {
      /* Keep zeros if API fails (e.g. empty company_id) */
    }).finally(() => setLoading(false));
  }, [companyId]);

  const today = new Date().toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="flex-1 p-4 sm:p-8 overflow-x-hidden overflow-y-auto page-enter max-w-[100vw]">
      <div className="mb-7">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>Dashboard</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>{today}</p>
      </div>

      {loading ? (
        <div className="flex gap-4 mb-7">{[1,2,3,4].map(i => <div key={i} className="skeleton flex-1 h-28 rounded-2xl" />)}</div>
      ) : (
        <div className="flex gap-4 mb-7 flex-wrap">
          <KpiCard label="Clocked In Now"      value={stats.active_now}          icon={Users}       color="#4ADE80" bg="rgba(74,222,128,0.12)" />
          <KpiCard label="Pending Approvals"   value={stats.pending_approvals}   icon={CheckSquare} color="#FCD34D" bg="rgba(252,211,77,0.12)"  onClick={() => navigate('/approvals')} />
          <KpiCard label="Time Adjustments"    value={stats.pending_adjustments} icon={Clock}       color="#60A5FA" bg="rgba(96,165,250,0.12)"  onClick={() => navigate('/approvals?tab=adjustments')} />
          <KpiCard label="Pending Leave"       value={stats.pending_leave}       icon={Calendar}    color="#A78BFA" bg="rgba(167,139,250,0.12)" onClick={() => navigate('/leave')} />
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Live activity */}
        <div className="xl:col-span-2 rounded-2xl overflow-hidden"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-mid)' }}>
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--color-border-mid)' }}>
            <h2 className="font-semibold" style={{ color: 'var(--color-text)' }}>Active Now</h2>
            <span className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
              style={{ background: 'rgba(74,222,128,0.12)', color: '#4ADE80' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" /> Live
            </span>
          </div>
          {workers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Users size={36} style={{ color: 'var(--color-surface-high)' }} />
              <p className="text-sm" style={{ color: 'var(--color-text-subtle)' }}>No one is clocked in right now</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border-mid)' }}>
                  <th className="text-left px-5 py-3 font-medium text-xs" style={{ color: 'var(--color-text-subtle)' }}>Employee</th>
                  <th className="text-left px-5 py-3 font-medium text-xs" style={{ color: 'var(--color-text-subtle)' }}>Project</th>
                  <th className="text-left px-5 py-3 font-medium text-xs" style={{ color: 'var(--color-text-subtle)' }}>Elapsed</th>
                </tr>
              </thead>
              <tbody>
                {workers.map(w => (
                  <tr key={w.user_id} className="table-row" style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                          style={{ background: 'var(--color-primary)' }}>
                          {(w.full_name ?? w.email)[0].toUpperCase()}
                        </div>
                        <p className="font-medium" style={{ color: 'var(--color-text)' }}>{w.full_name ?? w.email}</p>
                      </div>
                    </td>
                    <td className="px-5 py-3" style={{ color: 'var(--color-text-muted)' }}>
                      <span className="flex items-center gap-1.5"><MapPin size={12} />{w.project_name ?? '—'}</span>
                    </td>
                    <td className="px-5 py-3">
                      <span className="font-semibold text-xs px-2 py-1 rounded-lg"
                        style={{ fontFamily: "'JetBrains Mono', monospace", background: 'rgba(74,222,128,0.1)', color: '#4ADE80' }}>
                        {elapsed(w.clock_in)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Alerts */}
        <div className="rounded-2xl" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-mid)' }}>
          <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--color-border-mid)' }}>
            <h2 className="font-semibold" style={{ color: 'var(--color-text)' }}>Alerts</h2>
          </div>
          <div className="p-4 space-y-3">
            {stats.pending_approvals > 0 && (
              <button onClick={() => navigate('/approvals')}
                className="w-full flex items-start gap-3 rounded-xl px-4 py-3 text-left transition-colors"
                style={{ background: 'rgba(252,211,77,0.08)', border: '1px solid rgba(252,211,77,0.2)' }}>
                <AlertTriangle size={15} className="mt-0.5 flex-shrink-0" style={{ color: '#FCD34D' }} />
                <div>
                  <p className="text-xs font-semibold" style={{ color: '#FCD34D' }}>Pending Approvals</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                    {stats.pending_approvals} entr{stats.pending_approvals === 1 ? 'y' : 'ies'} need review
                  </p>
                </div>
              </button>
            )}
            {stats.pending_adjustments > 0 && (
              <button onClick={() => navigate('/approvals')}
                className="w-full flex items-start gap-3 rounded-xl px-4 py-3 text-left transition-colors"
                style={{ background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.2)' }}>
                <Clock size={15} className="mt-0.5 flex-shrink-0" style={{ color: '#60A5FA' }} />
                <div>
                  <p className="text-xs font-semibold" style={{ color: '#60A5FA' }}>Time Adjustments</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                    {stats.pending_adjustments} request{stats.pending_adjustments === 1 ? '' : 's'} pending
                  </p>
                </div>
              </button>
            )}
            {stats.pending_approvals === 0 && stats.pending_adjustments === 0 && (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <CheckSquare size={28} style={{ color: 'var(--color-surface-high)' }} />
                <p className="text-xs text-center" style={{ color: 'var(--color-text-subtle)' }}>No alerts right now</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <PayrollTimeEntriesPanel />
    </div>
  );
}

// ─── Manager Dashboard ────────────────────────────────────────────────────────
function ManagerDashboard() {
  const { companyId, userId } = useAuth();
  const navigate = useNavigate();
  const [entries,      setEntries]      = useState<TeamEntry[]>([]);
  const [adjustments,  setAdjustments]  = useState<unknown[]>([]);
  const [loading,      setLoading]      = useState(true);

  const today     = new Date().toISOString().slice(0, 10);
  const weekStart = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);

  useEffect(() => {
    Promise.all([
      api.getTeamEntries(companyId, userId, weekStart, today),
      api.getPendingAdjustments(companyId),
    ]).then(([e, a]) => {
      setEntries(e as TeamEntry[]);
      setAdjustments(a as unknown[]);
    }).finally(() => setLoading(false));
  }, [companyId, userId]);

  const todayEntries   = entries.filter(e => e.work_date === today);
  const totalHoursWeek = entries.reduce((s, e) => s + (e.duration_minutes ?? 0), 0) / 60;

  const workerSummary = Object.values(
    entries.reduce<Record<string, { name: string; hours: number; entries: number }>>((acc, e) => {
      if (!acc[e.user_id]) acc[e.user_id] = { name: e.worker_name, hours: 0, entries: 0 };
      acc[e.user_id].hours   += (e.duration_minutes ?? 0) / 60;
      acc[e.user_id].entries += 1;
      return acc;
    }, {})
  );

  const dateLabel = new Date().toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="flex-1 p-8 overflow-y-auto page-enter">
      <div className="mb-7">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>My Team</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>{dateLabel}</p>
      </div>

      {loading ? (
        <div className="flex gap-4 mb-7">{[1,2,3].map(i => <div key={i} className="skeleton flex-1 h-28 rounded-2xl" />)}</div>
      ) : (
        <div className="flex gap-4 mb-7 flex-wrap">
          <KpiCard label="Team Hours This Week" value={`${totalHoursWeek.toFixed(1)}h`} icon={Clock}       color="#4ADE80" bg="rgba(74,222,128,0.12)" />
          <KpiCard label="Active Today"          value={todayEntries.length}             icon={Users}       color="#60A5FA" bg="rgba(96,165,250,0.12)" />
          <KpiCard label="Pending Adjustments"   value={adjustments.length}             icon={CheckSquare} color="#FCD34D" bg="rgba(252,211,77,0.12)"  onClick={() => navigate('/approvals')} />
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* Team this week */}
        <div className="xl:col-span-2 rounded-2xl overflow-hidden"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-mid)' }}>
          <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--color-border-mid)' }}>
            <h2 className="font-semibold" style={{ color: 'var(--color-text)' }}>Team Timesheets — Last 7 Days</h2>
          </div>

          {entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Clock size={36} style={{ color: 'var(--color-surface-high)' }} />
              <p className="text-sm" style={{ color: 'var(--color-text-subtle)' }}>No entries this week</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border-mid)' }}>
                  <th className="text-left px-5 py-3 font-medium text-xs" style={{ color: 'var(--color-text-subtle)' }}>Employee</th>
                  <th className="text-left px-5 py-3 font-medium text-xs" style={{ color: 'var(--color-text-subtle)' }}>Date</th>
                  <th className="text-left px-5 py-3 font-medium text-xs" style={{ color: 'var(--color-text-subtle)' }}>Project</th>
                  <th className="text-left px-5 py-3 font-medium text-xs" style={{ color: 'var(--color-text-subtle)' }}>Budget Code</th>
                  <th className="text-left px-5 py-3 font-medium text-xs" style={{ color: 'var(--color-text-subtle)' }}>Hours</th>
                  <th className="text-left px-5 py-3 font-medium text-xs" style={{ color: 'var(--color-text-subtle)' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {entries.map(e => {
                  const st = STATUS_STYLE[e.status] ?? STATUS_STYLE.SUBMITTED;
                  return (
                    <tr key={e.id} className="table-row" style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                            style={{ background: 'var(--color-primary)' }}>
                            {e.worker_name[0].toUpperCase()}
                          </div>
                          <span className="font-medium text-xs" style={{ color: 'var(--color-text)' }}>{e.worker_name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>{fmtDate(e.work_date)}</td>
                      <td className="px-5 py-3">
                        <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                          <FolderOpen size={11} />{e.project_name}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        {e.budget_code ? (
                          <span className="flex items-center gap-1 text-xs">
                            <Tag size={10} style={{ color: 'var(--color-text-subtle)' }} />
                            <span style={{ color: 'var(--color-text-muted)' }}>{e.budget_code_name ?? e.budget_code}</span>
                          </span>
                        ) : (
                          <span className="text-xs" style={{ color: 'var(--color-text-subtle)' }}>—</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <span className="font-semibold text-xs" style={{ fontFamily: "'JetBrains Mono', monospace", color: 'var(--color-text)' }}>
                          {fmtDuration(e.duration_minutes)}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={st}>
                          {e.status.charAt(0) + e.status.slice(1).toLowerCase()}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Employee summary */}
        <div className="rounded-2xl" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-mid)' }}>
          <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--color-border-mid)' }}>
            <h2 className="font-semibold" style={{ color: 'var(--color-text)' }}>Employee summary</h2>
          </div>
          <div className="p-4 space-y-2">
            {workerSummary.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <Users size={28} style={{ color: 'var(--color-surface-high)' }} />
                <p className="text-xs" style={{ color: 'var(--color-text-subtle)' }}>No data this week</p>
              </div>
            ) : workerSummary.map(w => (
              <div key={w.name} className="flex items-center justify-between rounded-xl px-4 py-3"
                style={{ background: 'var(--color-surface-mid)', border: '1px solid var(--color-border)' }}>
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
                    style={{ background: 'var(--color-primary)' }}>
                    {w.name[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{w.name}</p>
                    <p className="text-xs" style={{ color: 'var(--color-text-subtle)' }}>{w.entries} entries</p>
                  </div>
                </div>
                <span className="text-sm font-bold" style={{ fontFamily: "'JetBrains Mono', monospace", color: 'var(--color-text)' }}>
                  {w.hours.toFixed(1)}h
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main export — switches by role ──────────────────────────────────────────
export default function DashboardPage() {
  const { role } = useAuth();
  return role === 'manager' ? <ManagerDashboard /> : <AdminDashboard />;
}
