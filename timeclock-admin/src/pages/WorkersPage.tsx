import { useEffect, useState } from 'react';
import { Users, X, Search, DollarSign, Plus, Check, UserPlus, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';

interface Member {
  user_id: string;
  email: string;
  full_name: string | null;
  role: string;
  has_leave_access?: boolean;
  has_report_access?: boolean;
  has_team_report_access?: boolean;
}

interface Rate {
  id: string;
  user_id: string | null;
  project_id: string | null;
  hourly_rate: number;
  currency: string;
  effective_date: string;
}

interface Manager {
  manager_user_id: string;
  manager_name: string;
  manager_email: string;
}

type SlideTab = 'PROFILE' | 'PERMISSIONS' | 'RATES' | 'MANAGERS';

const SLIDE_TABS: { key: SlideTab; label: string }[] = [
  { key: 'PROFILE',     label: 'Profile'     },
  { key: 'PERMISSIONS', label: 'Permissions' },
  { key: 'RATES',       label: 'Rates'       },
  { key: 'MANAGERS',    label: 'Managers'    },
];

const ROLE_COLORS: Record<string, { bg: string; color: string }> = {
  admin:   { bg: 'rgba(167,139,250,0.12)', color: '#A78BFA' },
  manager: { bg: 'rgba(96,165,250,0.12)',  color: '#60A5FA' },
  worker:  { bg: 'rgba(74,222,128,0.12)',  color: '#4ADE80' },
};

export default function WorkersPage() {
  const { companyId } = useAuth();
  const [members,    setMembers]    = useState<Member[]>([]);
  const [rates,      setRates]      = useState<Rate[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState('');
  const [selected,   setSelected]   = useState<Member | null>(null);
  const [slideTab,   setSlideTab]   = useState<SlideTab>('PROFILE');
  const [managers,   setManagers]   = useState<Manager[]>([]);
  const [allMembers, setAllMembers] = useState<Member[]>([]);

  // Permissions form
  const [permRole,         setPermRole]         = useState('worker');
  const [permLeave,        setPermLeave]        = useState(false);
  const [permReport,       setPermReport]       = useState(false);
  const [permTeamReport,   setPermTeamReport]   = useState(false);
  const [permLoading,      setPermLoading]      = useState(false);
  const [permSaved,        setPermSaved]        = useState(false);

  // Manager assign
  const [managerSearch,    setManagerSearch]    = useState('');
  const [managerLoading,   setManagerLoading]   = useState(false);

  // Rate form
  const [rateAmount,   setRateAmount]   = useState('');
  const [rateCurrency, setRateCurrency] = useState('CAD');
  const [rateDate,     setRateDate]     = useState(new Date().toISOString().split('T')[0]);
  const [rateLoading,  setRateLoading]  = useState(false);

  useEffect(() => {
    Promise.all([
      api.getCompanyMembers(companyId),
      api.getCompanyRates(companyId),
    ]).then(([m, r]) => {
      setMembers(m as Member[]);
      setAllMembers(m as Member[]);
      setRates(r as Rate[]);
    }).finally(() => setLoading(false));
  }, [companyId]);

  const filtered = members.filter(m =>
    (m.full_name ?? m.email).toLowerCase().includes(search.toLowerCase())
  );

  const workerRates = selected ? rates.filter(r => r.user_id === selected.user_id) : [];

  const openWorker = async (member: Member) => {
    setSelected(member);
    setSlideTab('PROFILE');
    setPermRole(member.role ?? 'worker');
    setPermLeave(member.has_leave_access ?? false);
    setPermReport(member.has_report_access ?? false);
    setPermTeamReport(member.has_team_report_access ?? false);
    setPermSaved(false);
    setManagerSearch('');
    const mgrs = await api.getWorkerManagers(companyId, member.user_id);
    setManagers(mgrs as Manager[]);
  };

  const handleSavePermissions = async () => {
    if (!selected) return;
    setPermLoading(true);
    try {
      await api.updateUserPermissions({
        user_id: selected.user_id,
        role: permRole,
        has_leave_access: permLeave,
        has_report_access: permReport,
        has_team_report_access: permTeamReport,
      });
      setMembers(prev => prev.map(m =>
        m.user_id === selected.user_id
          ? { ...m, role: permRole, has_leave_access: permLeave, has_report_access: permReport, has_team_report_access: permTeamReport }
          : m
      ));
      setPermSaved(true);
      setTimeout(() => setPermSaved(false), 2500);
    } finally { setPermLoading(false); }
  };

  const handleAssignManager = async (manager: Member) => {
    if (!selected) return;
    setManagerLoading(true);
    try {
      await api.assignManager({ company_id: companyId, worker_user_id: selected.user_id, manager_user_id: manager.user_id });
      const mgrs = await api.getWorkerManagers(companyId, selected.user_id);
      setManagers(mgrs as Manager[]);
      setManagerSearch('');
    } finally { setManagerLoading(false); }
  };

  const handleRemoveManager = async (managerUserId: string) => {
    if (!selected) return;
    setManagerLoading(true);
    try {
      await api.removeManager({ company_id: companyId, worker_user_id: selected.user_id, manager_user_id: managerUserId });
      setManagers(prev => prev.filter(m => m.manager_user_id !== managerUserId));
    } finally { setManagerLoading(false); }
  };

  const handleAddRate = async () => {
    if (!selected || !rateAmount) return;
    setRateLoading(true);
    try {
      await api.createRate({ company_id: companyId, user_id: selected.user_id, hourly_rate: parseFloat(rateAmount), currency: rateCurrency, effective_date: rateDate });
      const r = await api.getCompanyRates(companyId);
      setRates(r as Rate[]);
      setRateAmount('');
    } finally { setRateLoading(false); }
  };

  const managerCandidates = allMembers.filter(m =>
    m.user_id !== selected?.user_id &&
    (m.role === 'manager' || m.role === 'admin') &&
    !managers.some(mg => mg.manager_user_id === m.user_id) &&
    (m.full_name ?? m.email).toLowerCase().includes(managerSearch.toLowerCase())
  );

  const inputStyle = { background: 'var(--color-surface-mid)', border: '1.5px solid var(--color-border-mid)', color: 'var(--color-text)' };

  const ToggleRow = ({ label, desc, value, onChange }: { label: string; desc: string; value: boolean; onChange: (v: boolean) => void }) => (
    <div className="flex items-center justify-between py-3.5" style={{ borderBottom: '1px solid var(--color-border)' }}>
      <div>
        <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{label}</p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-subtle)' }}>{desc}</p>
      </div>
      <button
        onClick={() => onChange(!value)}
        className="w-11 h-6 rounded-full transition-colors flex-shrink-0 relative"
        style={{ background: value ? 'var(--color-primary)' : 'var(--color-surface-high)' }}
      >
        <span
          className="absolute top-0.5 w-5 h-5 rounded-full transition-all"
          style={{ background: '#fff', left: value ? 'calc(100% - 22px)' : '2px' }}
        />
      </button>
    </div>
  );

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-8 pb-4">
          <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--color-text)' }}>Employees</h1>
          <p className="text-sm mb-5" style={{ color: 'var(--color-text-muted)' }}>
            Manage team members, roles, permissions, and manager assignments.
          </p>
          <div className="relative max-w-sm">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--color-text-subtle)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search employees…"
              className="w-full rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none" style={inputStyle} />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-8">
          {loading ? (
            <div className="space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="skeleton h-14 rounded-xl" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3">
              <Users size={40} style={{ color: 'var(--color-surface-high)' }} />
              <p className="text-sm" style={{ color: 'var(--color-text-subtle)' }}>No employees found</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border-mid)' }}>
                  <th className="text-left py-3 pr-4 font-medium text-xs" style={{ color: 'var(--color-text-subtle)' }}>Name</th>
                  <th className="text-left py-3 pr-4 font-medium text-xs" style={{ color: 'var(--color-text-subtle)' }}>Email</th>
                  <th className="text-left py-3 pr-4 font-medium text-xs" style={{ color: 'var(--color-text-subtle)' }}>Role</th>
                  <th className="text-left py-3 pr-4 font-medium text-xs" style={{ color: 'var(--color-text-subtle)' }}>Permissions</th>
                  <th className="py-3 w-8" />
                </tr>
              </thead>
              <tbody>
                {filtered.map(member => {
                  const roleStyle = ROLE_COLORS[member.role?.toLowerCase()] ?? ROLE_COLORS.worker;
                  return (
                    <tr key={member.user_id} className="table-row cursor-pointer"
                      style={{ borderBottom: '1px solid var(--color-border)' }}
                      onClick={() => openWorker(member)}>
                      <td className="py-3.5 pr-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                            style={{ background: 'var(--color-primary)' }}>
                            {(member.full_name ?? member.email)[0].toUpperCase()}
                          </div>
                          <span className="font-medium" style={{ color: 'var(--color-text)' }}>
                            {member.full_name ?? '—'}
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 pr-4" style={{ color: 'var(--color-text-muted)' }}>{member.email}</td>
                      <td className="py-3.5 pr-4">
                        <span className="text-xs px-2.5 py-1 rounded-full font-medium capitalize" style={roleStyle}>
                          {member.role ?? 'worker'}
                        </span>
                      </td>
                      <td className="py-3.5 pr-4">
                        <div className="flex gap-1.5">
                          {member.has_leave_access && (
                            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(96,165,250,0.1)', color: '#60A5FA' }}>Leave</span>
                          )}
                          {member.has_report_access && (
                            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(167,139,250,0.1)', color: '#A78BFA' }}>Reports</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 text-right pr-2">
                        <span style={{ color: 'var(--color-text-subtle)', fontSize: 18 }}>›</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Slide-over */}
      {selected && (
        <div className="fixed inset-0 z-40 flex justify-end" onClick={() => setSelected(null)}>
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.5)' }} />
          <aside className="relative w-full max-w-md flex flex-col slide-in"
            style={{ background: 'var(--color-surface)', borderLeft: '1px solid var(--color-border-mid)' }}
            onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: '1px solid var(--color-border-mid)' }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white"
                  style={{ background: 'var(--color-primary)' }}>
                  {(selected.full_name ?? selected.email)[0].toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold" style={{ color: 'var(--color-text)' }}>{selected.full_name ?? 'Unknown'}</p>
                  <p className="text-xs" style={{ color: 'var(--color-text-subtle)' }}>{selected.email}</p>
                </div>
              </div>
              <button onClick={() => setSelected(null)}><X size={20} style={{ color: 'var(--color-text-subtle)' }} /></button>
            </div>

            {/* Tabs */}
            <div className="flex" style={{ borderBottom: '1px solid var(--color-border-mid)' }}>
              {SLIDE_TABS.map(t => (
                <button key={t.key} onClick={() => setSlideTab(t.key)}
                  className="flex-1 py-3 text-xs font-medium transition-colors"
                  style={{
                    color: slideTab === t.key ? 'var(--color-text)' : 'var(--color-text-subtle)',
                    borderBottom: slideTab === t.key ? '2px solid var(--color-primary)' : '2px solid transparent',
                    marginBottom: -1,
                  }}>
                  {t.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">

              {/* PROFILE tab */}
              {slideTab === 'PROFILE' && (
                <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--color-border-mid)' }}>
                  {[
                    { label: 'Full Name', value: selected.full_name ?? '—' },
                    { label: 'Email',     value: selected.email },
                    { label: 'Role',      value: selected.role ?? 'worker' },
                    { label: 'User ID',   value: selected.user_id.slice(0,12) + '…' },
                  ].map((row, i) => (
                    <div key={row.label} className="flex items-center justify-between px-4 py-3"
                      style={{ borderBottom: i < 3 ? '1px solid var(--color-border)' : undefined }}>
                      <p className="text-xs" style={{ color: 'var(--color-text-subtle)' }}>{row.label}</p>
                      <p className="text-sm font-medium capitalize" style={{ color: 'var(--color-text)' }}>{row.value}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* PERMISSIONS tab */}
              {slideTab === 'PERMISSIONS' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium mb-2" style={{ color: 'var(--color-text-subtle)' }}>Role</label>
                    <div className="flex gap-2">
                      {['worker', 'manager', 'admin'].map(r => (
                        <button key={r} onClick={() => setPermRole(r)}
                          className="flex-1 py-2.5 rounded-xl text-xs font-medium capitalize transition-all"
                          style={{
                            background: permRole === r ? 'var(--color-primary)' : 'var(--color-surface-mid)',
                            color: permRole === r ? '#fff' : 'var(--color-text-subtle)',
                            border: '1px solid var(--color-border)',
                          }}>
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--color-border-mid)' }}>
                    <ToggleRow
                      label="Leave Access"
                      desc="Can submit and view leave requests"
                      value={permLeave}
                      onChange={setPermLeave}
                    />
                    <ToggleRow
                      label="Personal Reports"
                      desc="Can view their own timesheet reports"
                      value={permReport}
                      onChange={setPermReport}
                    />
                    <div className="flex items-center justify-between py-3.5 px-0">
                      <div>
                        <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>Team Reports</p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-subtle)' }}>Can view reports for their team</p>
                      </div>
                      <button onClick={() => setPermTeamReport(v => !v)}
                        className="w-11 h-6 rounded-full transition-colors flex-shrink-0 relative"
                        style={{ background: permTeamReport ? 'var(--color-primary)' : 'var(--color-surface-high)' }}>
                        <span className="absolute top-0.5 w-5 h-5 rounded-full transition-all"
                          style={{ background: '#fff', left: permTeamReport ? 'calc(100% - 22px)' : '2px' }} />
                      </button>
                    </div>
                  </div>

                  <button onClick={handleSavePermissions} disabled={permLoading}
                    className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium text-white disabled:opacity-50 transition-all"
                    style={{ background: permSaved ? '#22C55E' : 'var(--color-primary)' }}>
                    {permLoading
                      ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      : permSaved
                        ? <><Check size={15} /> Saved</>
                        : 'Save Permissions'
                    }
                  </button>
                </div>
              )}

              {/* RATES tab */}
              {slideTab === 'RATES' && (
                <div className="space-y-4">
                  {workerRates.length > 0 && (
                    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--color-border-mid)' }}>
                      {workerRates.map((r, i) => (
                        <div key={r.id} className="flex items-center justify-between px-4 py-3"
                          style={{ borderBottom: i < workerRates.length - 1 ? '1px solid var(--color-border)' : undefined }}>
                          <div>
                            <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                              {r.hourly_rate.toFixed(2)} {r.currency}/hr
                            </p>
                            <p className="text-xs" style={{ color: 'var(--color-text-subtle)' }}>From {r.effective_date}</p>
                          </div>
                          <DollarSign size={14} style={{ color: 'var(--color-text-subtle)' }} />
                        </div>
                      ))}
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-semibold mb-3" style={{ color: 'var(--color-text-subtle)' }}>Add New Rate</p>
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <input type="number" value={rateAmount} onChange={e => setRateAmount(e.target.value)}
                          placeholder="Hourly rate" className="flex-1 rounded-xl px-4 py-2.5 text-sm focus:outline-none" style={inputStyle} />
                        <select value={rateCurrency} onChange={e => setRateCurrency(e.target.value)}
                          className="rounded-xl px-3 py-2.5 text-sm focus:outline-none" style={inputStyle}>
                          <option value="CAD">CAD</option>
                          <option value="USD">USD</option>
                        </select>
                      </div>
                      <input type="date" value={rateDate} onChange={e => setRateDate(e.target.value)}
                        className="w-full rounded-xl px-4 py-2.5 text-sm focus:outline-none" style={inputStyle} />
                      <button onClick={handleAddRate} disabled={rateLoading || !rateAmount}
                        className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium text-white disabled:opacity-50 transition-colors"
                        style={{ background: 'var(--color-primary)' }}>
                        {rateLoading ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <><Plus size={14} /> Set Rate</>}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* MANAGERS tab */}
              {slideTab === 'MANAGERS' && (
                <div className="space-y-4">
                  {/* Current managers */}
                  {managers.length > 0 && (
                    <div>
                      <p className="text-xs font-medium mb-2" style={{ color: 'var(--color-text-subtle)' }}>Current Managers</p>
                      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--color-border-mid)' }}>
                        {managers.map((m, i) => (
                          <div key={m.manager_user_id} className="flex items-center justify-between px-4 py-3"
                            style={{ borderBottom: i < managers.length - 1 ? '1px solid var(--color-border)' : undefined }}>
                            <div>
                              <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{m.manager_name}</p>
                              <p className="text-xs" style={{ color: 'var(--color-text-subtle)' }}>{m.manager_email}</p>
                            </div>
                            <button onClick={() => handleRemoveManager(m.manager_user_id)}
                              className="p-1.5 rounded-lg transition-colors"
                              style={{ color: 'var(--color-error)' }}>
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Assign manager */}
                  <div>
                    <p className="text-xs font-medium mb-2" style={{ color: 'var(--color-text-subtle)' }}>Assign Manager</p>
                    <input value={managerSearch} onChange={e => setManagerSearch(e.target.value)}
                      placeholder="Search managers…"
                      className="w-full rounded-xl px-4 py-2.5 text-sm mb-3 focus:outline-none" style={inputStyle} />
                    {managerSearch && (
                      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--color-border-mid)' }}>
                        {managerCandidates.length === 0 ? (
                          <p className="text-xs text-center py-4" style={{ color: 'var(--color-text-subtle)' }}>No managers found</p>
                        ) : managerCandidates.map((m, i) => (
                          <button key={m.user_id} onClick={() => handleAssignManager(m)}
                            disabled={managerLoading}
                            className="w-full flex items-center justify-between px-4 py-3 transition-colors disabled:opacity-50"
                            style={{ borderBottom: i < managerCandidates.length - 1 ? '1px solid var(--color-border)' : undefined }}>
                            <div className="text-left">
                              <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{m.full_name ?? m.email}</p>
                              <p className="text-xs capitalize" style={{ color: 'var(--color-text-subtle)' }}>{m.role}</p>
                            </div>
                            <UserPlus size={14} style={{ color: 'var(--color-text-subtle)' }} />
                          </button>
                        ))}
                      </div>
                    )}
                    {managers.length === 0 && !managerSearch && (
                      <p className="text-sm text-center py-6" style={{ color: 'var(--color-text-subtle)' }}>
                        No managers assigned yet. Search above to assign one.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
