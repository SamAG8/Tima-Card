import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, Clock, X, ChevronRight } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';

type Tab = 'SUBMITTED' | 'ADJUSTMENTS' | 'LEAVE' | 'OVERTIME';

interface PendingEntry {
  id: string;
  user_id: string;
  worker_name?: string | null;
  worker_email?: string | null;
  work_date: string;
  clock_in: string;
  clock_out: string | null;
  user_timezone: string;
  entry_type: string;
  manual_reason: string | null;
  manual_note: string | null;
  description: string | null;
  tags: string[];
}

function fmtTime(iso: string, tz: string) {
  return new Date(iso).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', timeZone: tz });
}

function fmtDuration(cin: string, cout: string | null) {
  if (!cout) return '—';
  const ms = new Date(cout).getTime() - new Date(cin).getTime();
  const h  = Math.floor(ms / 3600000);
  const m  = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

function fmtDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' });
}

const REASON_LABELS: Record<string, string> = {
  FORGOT:       'Forgot to clock in/out',
  NO_PHONE:     'Did not have phone',
  SYSTEM_ERROR: 'System error',
  OTHER:        'Other',
};

interface Adjustment {
  id: string;
  worker_name: string;
  work_date: string;
  adjustment_type: string;
  original_clock_in?: string;
  original_clock_out?: string;
  requested_clock_in?: string;
  requested_clock_out?: string;
  reason?: string;
  status: string;
}

function entryReasonLabel(e: PendingEntry): string {
  if (e.entry_type === 'MANUAL') {
    return REASON_LABELS[e.manual_reason ?? ''] ?? e.manual_reason ?? '—';
  }
  return 'Standard clock-in/out';
}

/** Never show raw UUIDs — name, email, or human-readable fallback. */
function employeeDisplayName(entry: PendingEntry): string {
  const name = entry.worker_name?.trim();
  if (name) return name;
  const email = entry.worker_email?.trim();
  if (email) return email;
  return 'Employee';
}

export default function ApprovalsPage() {
  const { companyId } = useAuth();
  const [searchParams] = useSearchParams();
  const [tab,          setTab]         = useState<Tab>('SUBMITTED');
  const [entries,      setEntries]     = useState<PendingEntry[]>([]);
  const [adjustments,  setAdjustments] = useState<Adjustment[]>([]);
  const [loading,      setLoading]     = useState(true);
  const [selected,     setSelected]    = useState<Set<string>>(new Set());
  const [slideOver,    setSlideOver]   = useState<PendingEntry | null>(null);
  const [reviewNote,   setReviewNote]  = useState('');
  const [reviewing,    setReviewing]   = useState<string | null>(null);
  const [bulkLoading,  setBulkLoading] = useState(false);

  const fetchPending = () => {
    setLoading(true);
    Promise.all([
      api.getPendingApprovals(companyId),
      api.getPendingAdjustments(companyId),
    ]).then(async ([e, a]) => {
      let list = e as PendingEntry[];
      const missing = list.filter(
        x => !x.worker_name?.trim() && !x.worker_email?.trim(),
      );
      if (missing.length > 0) {
        const ids = [...new Set(missing.map(x => x.user_id))];
        const { data: profiles } = await supabase
          .from('users')
          .select('id, email, first_name, last_name')
          .in('id', ids);
        if (profiles?.length) {
          const byId = Object.fromEntries(
            profiles.map(p => {
              const full = [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
              const label = full || p.email || '';
              return [String(p.id), { label, email: p.email }];
            }),
          );
          list = list.map(row => {
            if (row.worker_name?.trim() || row.worker_email?.trim()) return row;
            const p = byId[String(row.user_id)];
            if (!p) return row;
            return {
              ...row,
              worker_name: p.label || p.email || undefined,
              worker_email: p.email ?? row.worker_email,
            };
          });
        }
      }
      setEntries(list);
      setAdjustments(a as Adjustment[]);
    }).finally(() => setLoading(false));
  };

  useEffect(fetchPending, [companyId]);

  useEffect(() => {
    const t = searchParams.get('tab');
    if (t === 'adjustments') setTab('ADJUSTMENTS');
  }, [searchParams]);

  const handleReviewAdjustment = async (id: string, result: 'APPROVED' | 'REJECTED') => {
    setReviewing(id);
    try {
      await api.reviewAdjustment({ adjustment_id: id, result });
      setAdjustments(p => p.filter(a => a.id !== id));
    } finally { setReviewing(null); }
  };

  /** All items from GET /approvals/pending (SUBMITTED — both NORMAL and MANUAL). */
  const displayed = tab === 'SUBMITTED' ? entries : [];

  const toggleSelect = (id: string) =>
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const toggleAll = () =>
    setSelected(s => s.size === displayed.length ? new Set() : new Set(displayed.map(e => e.id)));

  const handleReview = async (id: string, result: 'APPROVED' | 'REJECTED', note = '') => {
    setReviewing(id);
    try {
      await api.reviewEntry({ company_id: companyId, time_entry_id: id, result, notes: note || undefined });
      setEntries(p => p.filter(e => e.id !== id));
      setSelected(s => { const n = new Set(s); n.delete(id); return n; });
      if (slideOver?.id === id) setSlideOver(null);
    } finally { setReviewing(null); }
  };

  const handleBulkApprove = async () => {
    setBulkLoading(true);
    try {
      for (const id of selected) await api.reviewEntry({ company_id: companyId, time_entry_id: id, result: 'APPROVED' });
      setEntries(p => p.filter(e => !selected.has(e.id)));
      setSelected(new Set());
    } finally { setBulkLoading(false); }
  };

  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: 'SUBMITTED',   label: 'Submitted entries', count: entries.length },
    { key: 'ADJUSTMENTS', label: 'Time Adjustments',  count: adjustments.length  },
    { key: 'LEAVE',       label: 'Leave Requests',    count: 0 },
    { key: 'OVERTIME',    label: 'Overtime',           count: 0 },
  ];

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex-1 flex flex-col overflow-hidden">

        <div className="p-8 pb-0">
          <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--color-text)' }}>Approvals</h1>
          <p className="text-sm mb-6" style={{ color: 'var(--color-text-muted)' }}>
            Review and approve submitted time entries from your team.
          </p>

          {/* Tabs */}
          <div className="flex gap-1" style={{ borderBottom: '1px solid var(--color-border-mid)' }}>
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => { setTab(t.key); setSelected(new Set()); }}
                className="relative px-4 pb-3 text-sm font-medium transition-colors"
                style={{
                  color: tab === t.key ? 'var(--color-text)' : 'var(--color-text-subtle)',
                  borderBottom: tab === t.key ? '2px solid var(--color-primary)' : '2px solid transparent',
                  marginBottom: -1,
                }}
              >
                {t.label}
                {(t.count ?? 0) > 0 && (
                  <span
                    className="ml-2 text-xs px-1.5 py-0.5 rounded-full font-semibold"
                    style={{ background: 'rgba(252,211,77,0.15)', color: '#FCD34D' }}
                  >
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Bulk action bar */}
        {selected.size > 0 && (
          <div
            className="mx-8 mt-4 flex items-center justify-between rounded-xl px-4 py-3"
            style={{ background: 'rgba(37,99,235,0.1)', border: '1px solid rgba(37,99,235,0.3)' }}
          >
            <span className="text-sm font-medium" style={{ color: '#93C5FD' }}>
              {selected.size} selected
            </span>
            <div className="flex gap-2">
              <button
                onClick={handleBulkApprove}
                disabled={bulkLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50 transition-colors"
                style={{ background: 'var(--color-success)' }}
              >
                <CheckCircle size={13} /> Approve All
              </button>
              <button
                onClick={() => setSelected(new Set())}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                style={{ background: 'var(--color-surface-mid)', color: 'var(--color-text-muted)' }}
              >
                Clear
              </button>
            </div>
          </div>
        )}

        {/* Time Adjustments tab */}
        {tab === 'ADJUSTMENTS' && (
          <div className="flex-1 overflow-y-auto px-8 py-4">
            {loading ? (
              <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="skeleton h-20 rounded-2xl" />)}</div>
            ) : adjustments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 gap-3">
                <CheckCircle size={40} style={{ color: 'var(--color-surface-high)' }} />
                <p className="font-medium" style={{ color: 'var(--color-text-muted)' }}>All caught up</p>
                <p className="text-sm" style={{ color: 'var(--color-text-subtle)' }}>No pending time adjustments</p>
              </div>
            ) : (
              <div className="space-y-3">
                {adjustments.map(adj => (
                  <div key={adj.id} className="rounded-xl p-4"
                    style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-mid)' }}>
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-medium text-sm" style={{ color: 'var(--color-text)' }}>{adj.worker_name}</p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-subtle)' }}>
                          {fmtDate(adj.work_date)} · {adj.adjustment_type.replace('_', ' ')}
                        </p>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(252,211,77,0.12)', color: '#FCD34D' }}>
                        Pending
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      {adj.original_clock_in && (
                        <div className="rounded-lg px-3 py-2" style={{ background: 'var(--color-surface-mid)' }}>
                          <p className="text-xs mb-1" style={{ color: 'var(--color-text-subtle)' }}>Original In</p>
                          <p className="text-sm font-mono" style={{ color: 'var(--color-text-muted)' }}>
                            {new Date(adj.original_clock_in).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      )}
                      {adj.requested_clock_in && (
                        <div className="rounded-lg px-3 py-2" style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)' }}>
                          <p className="text-xs mb-1" style={{ color: 'var(--color-text-subtle)' }}>Requested In</p>
                          <p className="text-sm font-mono font-semibold" style={{ color: '#4ADE80' }}>
                            {new Date(adj.requested_clock_in).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      )}
                      {adj.original_clock_out && (
                        <div className="rounded-lg px-3 py-2" style={{ background: 'var(--color-surface-mid)' }}>
                          <p className="text-xs mb-1" style={{ color: 'var(--color-text-subtle)' }}>Original Out</p>
                          <p className="text-sm font-mono" style={{ color: 'var(--color-text-muted)' }}>
                            {new Date(adj.original_clock_out).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      )}
                      {adj.requested_clock_out && (
                        <div className="rounded-lg px-3 py-2" style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)' }}>
                          <p className="text-xs mb-1" style={{ color: 'var(--color-text-subtle)' }}>Requested Out</p>
                          <p className="text-sm font-mono font-semibold" style={{ color: '#4ADE80' }}>
                            {new Date(adj.requested_clock_out).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      )}
                    </div>
                    {adj.reason && (
                      <p className="text-xs mb-3" style={{ color: 'var(--color-text-subtle)' }}>"{adj.reason}"</p>
                    )}
                    <div className="flex gap-2">
                      <button onClick={() => handleReviewAdjustment(adj.id, 'APPROVED')}
                        disabled={reviewing === adj.id}
                        className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-semibold text-white disabled:opacity-50"
                        style={{ background: 'var(--color-success)' }}>
                        {reviewing === adj.id
                          ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          : <><CheckCircle size={13} /> Approve</>
                        }
                      </button>
                      <button onClick={() => handleReviewAdjustment(adj.id, 'REJECTED')}
                        disabled={reviewing === adj.id}
                        className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-semibold disabled:opacity-50"
                        style={{ background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', color: 'var(--color-error)' }}>
                        <XCircle size={13} /> Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* List */}
        {tab !== 'ADJUSTMENTS' && (
        <div className="flex-1 overflow-y-auto px-8 py-4">
          {loading ? (
            <div className="space-y-3">
              {[1,2,3].map(i => <div key={i} className="skeleton h-20 rounded-2xl" />)}
            </div>
          ) : displayed.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3">
              <CheckCircle size={40} style={{ color: 'var(--color-surface-high)' }} />
              <p className="font-medium" style={{ color: 'var(--color-text-muted)' }}>All caught up</p>
              <p className="text-sm" style={{ color: 'var(--color-text-subtle)' }}>
                {tab === 'SUBMITTED'
                  ? 'No pending submissions to review.'
                  : `No pending ${tab.toLowerCase()} approvals`}
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border-mid)' }}>
                  <th className="py-3 pr-4 w-8">
                    <input
                      type="checkbox"
                      checked={selected.size === displayed.length && displayed.length > 0}
                      onChange={toggleAll}
                      className="rounded"
                    />
                  </th>
                  <th className="text-left py-3 pr-4 font-medium text-xs" style={{ color: 'var(--color-text-subtle)' }}>Employee</th>
                  <th className="text-left py-3 pr-4 font-medium text-xs" style={{ color: 'var(--color-text-subtle)' }}>Date</th>
                  <th className="text-left py-3 pr-4 font-medium text-xs" style={{ color: 'var(--color-text-subtle)' }}>Time</th>
                  <th className="text-left py-3 pr-4 font-medium text-xs" style={{ color: 'var(--color-text-subtle)' }}>Duration</th>
                  <th className="text-left py-3 pr-4 font-medium text-xs" style={{ color: 'var(--color-text-subtle)' }}>Reason</th>
                  <th className="py-3 w-28" />
                </tr>
              </thead>
              <tbody>
                {displayed.map(entry => (
                  <tr
                    key={entry.id}
                    className="table-row cursor-pointer"
                    style={{ borderBottom: '1px solid var(--color-border)' }}
                    onClick={() => { setSlideOver(entry); setReviewNote(''); }}
                  >
                    <td className="py-3 pr-4" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(entry.id)}
                        onChange={() => toggleSelect(entry.id)}
                        className="rounded"
                      />
                    </td>
                    <td className="py-3 pr-4">
                      <span className="font-medium" style={{ color: 'var(--color-text)' }}>
                        {employeeDisplayName(entry)}
                      </span>
                    </td>
                    <td className="py-3 pr-4" style={{ color: 'var(--color-text-muted)' }}>
                      {fmtDate(entry.work_date)}
                    </td>
                    <td className="py-3 pr-4" style={{ color: 'var(--color-text-muted)' }}>
                      {fmtTime(entry.clock_in, entry.user_timezone)} → {entry.clock_out ? fmtTime(entry.clock_out, entry.user_timezone) : '—'}
                    </td>
                    <td className="py-3 pr-4">
                      <span className="font-semibold" style={{ color: 'var(--color-text)', fontFamily: "'JetBrains Mono', monospace" }}>
                        {fmtDuration(entry.clock_in, entry.clock_out)}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className="text-xs px-2 py-1 rounded-lg"
                        style={{ background: 'rgba(252,211,77,0.1)', color: '#FCD34D' }}
                      >
                        {entryReasonLabel(entry)}
                      </span>
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-2 justify-end" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => handleReview(entry.id, 'APPROVED')}
                          disabled={reviewing === entry.id}
                          className="p-1.5 rounded-lg transition-colors disabled:opacity-50"
                          style={{ background: 'rgba(22,163,74,0.12)', color: '#4ADE80' }}
                          title="Approve"
                        >
                          <CheckCircle size={15} />
                        </button>
                        <button
                          onClick={() => handleReview(entry.id, 'REJECTED')}
                          disabled={reviewing === entry.id}
                          className="p-1.5 rounded-lg transition-colors disabled:opacity-50"
                          style={{ background: 'rgba(248,113,113,0.12)', color: '#F87171' }}
                          title="Reject"
                        >
                          <XCircle size={15} />
                        </button>
                        <button
                          onClick={() => { setSlideOver(entry); setReviewNote(''); }}
                          className="p-1.5 rounded-lg transition-colors"
                          style={{ background: 'var(--color-surface-mid)', color: 'var(--color-text-muted)' }}
                          title="Details"
                        >
                          <ChevronRight size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        )}
      </div>

      {/* Slide-over panel */}
      {slideOver && (
        <div className="fixed inset-0 z-40 flex justify-end" onClick={() => setSlideOver(null)}>
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.5)' }} />
          <aside
            className="relative w-full max-w-md flex flex-col slide-in"
            style={{ background: 'var(--color-surface)', borderLeft: '1px solid var(--color-border-mid)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: '1px solid var(--color-border-mid)' }}>
              <div>
                <h3 className="font-semibold" style={{ color: 'var(--color-text)' }}>Entry Detail</h3>
                <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-subtle)' }}>{fmtDate(slideOver.work_date)}</p>
              </div>
              <button onClick={() => setSlideOver(null)}>
                <X size={20} style={{ color: 'var(--color-text-subtle)' }} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {/* Times */}
              <div
                className="rounded-xl p-4"
                style={{ background: 'var(--color-surface-mid)', border: '1px solid var(--color-border-mid)' }}
              >
                <div className="flex justify-between mb-2">
                  <div>
                    <p className="text-xs mb-1" style={{ color: 'var(--color-text-subtle)' }}>Clock In</p>
                    <p className="font-semibold" style={{ color: 'var(--color-text)', fontFamily: "'JetBrains Mono', monospace" }}>
                      {fmtTime(slideOver.clock_in, slideOver.user_timezone)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs mb-1" style={{ color: 'var(--color-text-subtle)' }}>Clock Out</p>
                    <p className="font-semibold" style={{ color: 'var(--color-text)', fontFamily: "'JetBrains Mono', monospace" }}>
                      {slideOver.clock_out ? fmtTime(slideOver.clock_out, slideOver.user_timezone) : '—'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs mb-1" style={{ color: 'var(--color-text-subtle)' }}>Duration</p>
                    <p className="font-bold" style={{ color: '#4ADE80', fontFamily: "'JetBrains Mono', monospace" }}>
                      {fmtDuration(slideOver.clock_in, slideOver.clock_out)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Manual badge */}
              {slideOver.entry_type === 'MANUAL' && (
                <div
                  className="rounded-xl px-4 py-3"
                  style={{ background: 'rgba(252,211,77,0.08)', border: '1px solid rgba(252,211,77,0.2)' }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Clock size={13} style={{ color: '#FCD34D' }} />
                    <p className="text-xs font-semibold" style={{ color: '#FCD34D' }}>Manual Entry</p>
                  </div>
                  <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                    {REASON_LABELS[slideOver.manual_reason ?? ''] ?? slideOver.manual_reason}
                  </p>
                  {slideOver.manual_note && (
                    <p className="text-xs mt-1" style={{ color: 'var(--color-text-subtle)' }}>{slideOver.manual_note}</p>
                  )}
                </div>
              )}

              {/* Description */}
              {slideOver.description && (
                <div>
                  <p className="text-xs font-semibold mb-1" style={{ color: 'var(--color-text-subtle)' }}>Work Description</p>
                  <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{slideOver.description}</p>
                </div>
              )}

              {/* Tags */}
              {slideOver.tags?.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {slideOver.tags.map(tag => (
                    <span
                      key={tag}
                      className="text-xs px-2.5 py-1 rounded-full"
                      style={{ background: 'var(--color-surface-mid)', color: 'var(--color-text-muted)' }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Review note */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
                  Review Note <span style={{ color: 'var(--color-text-subtle)' }}>(optional)</span>
                </label>
                <textarea
                  value={reviewNote}
                  onChange={e => setReviewNote(e.target.value)}
                  placeholder="Add a note for the employee…"
                  rows={3}
                  className="w-full rounded-xl px-4 py-3 text-sm resize-none focus:outline-none"
                  style={{
                    background: 'var(--color-surface-mid)',
                    border: '1.5px solid var(--color-border-mid)',
                    color: 'var(--color-text)',
                  }}
                />
              </div>
            </div>

            {/* Footer actions */}
            <div className="px-6 py-5 flex gap-3" style={{ borderTop: '1px solid var(--color-border-mid)' }}>
              <button
                onClick={() => handleReview(slideOver.id, 'APPROVED', reviewNote)}
                disabled={reviewing === slideOver.id}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl py-3 font-semibold text-white text-sm disabled:opacity-50 transition-colors"
                style={{ background: 'var(--color-success)' }}
              >
                {reviewing === slideOver.id
                  ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <><CheckCircle size={15} /> Approve</>
                }
              </button>
              <button
                onClick={() => handleReview(slideOver.id, 'REJECTED', reviewNote)}
                disabled={reviewing === slideOver.id}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl py-3 font-semibold text-sm disabled:opacity-50 transition-colors"
                style={{ background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', color: 'var(--color-error)' }}
              >
                <XCircle size={15} /> Reject
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
