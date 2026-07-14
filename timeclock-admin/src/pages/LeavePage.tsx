import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, Calendar, X } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';

interface LeaveRequest {
  id: string;
  user_id: string;
  leave_type_name?: string;
  start_date: string;
  end_date: string;
  notes: string | null;
  status: string;
}

function fmtDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
}

function daysBetween(start: string, end: string) {
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1;
}

export default function LeavePage() {
  const { companyId } = useAuth();
  const [requests,    setRequests]    = useState<LeaveRequest[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [reviewing,   setReviewing]   = useState<string | null>(null);
  const [slideOver,   setSlideOver]   = useState<LeaveRequest | null>(null);
  const [reviewNote,  setReviewNote]  = useState('');

  const fetchPending = () => {
    setLoading(true);
    api.getPendingLeave(companyId)
      .then(d => setRequests(d as LeaveRequest[]))
      .finally(() => setLoading(false));
  };

  useEffect(fetchPending, [companyId]);

  const handleReview = async (id: string, result: 'APPROVED' | 'REJECTED', note = '') => {
    setReviewing(id);
    try {
      await api.reviewLeave({ company_id: companyId, leave_request_id: id, result, notes: note || undefined });
      setRequests(p => p.filter(r => r.id !== id));
      if (slideOver?.id === id) setSlideOver(null);
    } finally { setReviewing(null); }
  };

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex-1 flex flex-col overflow-hidden">

        <div className="p-8 pb-4">
          <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--color-text)' }}>Leave Requests</h1>
          <p className="text-sm mb-6" style={{ color: 'var(--color-text-muted)' }}>
            Review pending time-off requests from your team.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-8 pb-8">
          {loading ? (
            <div className="space-y-3">
              {[1,2,3].map(i => <div key={i} className="skeleton h-20 rounded-2xl" />)}
            </div>
          ) : requests.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3">
              <Calendar size={40} style={{ color: 'var(--color-surface-high)' }} />
              <p className="font-medium" style={{ color: 'var(--color-text-muted)' }}>All caught up</p>
              <p className="text-sm" style={{ color: 'var(--color-text-subtle)' }}>No pending leave requests</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border-mid)' }}>
                  <th className="text-left py-3 pr-4 font-medium text-xs" style={{ color: 'var(--color-text-subtle)' }}>Employee</th>
                  <th className="text-left py-3 pr-4 font-medium text-xs" style={{ color: 'var(--color-text-subtle)' }}>Type</th>
                  <th className="text-left py-3 pr-4 font-medium text-xs" style={{ color: 'var(--color-text-subtle)' }}>Dates</th>
                  <th className="text-left py-3 pr-4 font-medium text-xs" style={{ color: 'var(--color-text-subtle)' }}>Duration</th>
                  <th className="py-3 w-32" />
                </tr>
              </thead>
              <tbody>
                {requests.map(req => (
                  <tr
                    key={req.id}
                    className="table-row cursor-pointer"
                    style={{ borderBottom: '1px solid var(--color-border)' }}
                    onClick={() => { setSlideOver(req); setReviewNote(''); }}
                  >
                    <td className="py-3.5 pr-4">
                      <span className="font-medium" style={{ color: 'var(--color-text)' }}>
                        {req.user_id.slice(0, 8)}…
                      </span>
                    </td>
                    <td className="py-3.5 pr-4">
                      <span
                        className="text-xs px-2.5 py-1 rounded-full"
                        style={{ background: 'rgba(167,139,250,0.1)', color: '#A78BFA' }}
                      >
                        {req.leave_type_name ?? 'Leave'}
                      </span>
                    </td>
                    <td className="py-3.5 pr-4" style={{ color: 'var(--color-text-muted)' }}>
                      {fmtDate(req.start_date)}
                      {req.end_date !== req.start_date && ` → ${fmtDate(req.end_date)}`}
                    </td>
                    <td className="py-3.5 pr-4" style={{ color: 'var(--color-text-muted)' }}>
                      {daysBetween(req.start_date, req.end_date)} day{daysBetween(req.start_date, req.end_date) !== 1 ? 's' : ''}
                    </td>
                    <td className="py-3.5">
                      <div className="flex items-center gap-2 justify-end" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => handleReview(req.id, 'APPROVED')}
                          disabled={reviewing === req.id}
                          className="p-1.5 rounded-lg transition-colors disabled:opacity-50"
                          style={{ background: 'rgba(22,163,74,0.12)', color: '#4ADE80' }}
                          title="Approve"
                        >
                          <CheckCircle size={15} />
                        </button>
                        <button
                          onClick={() => handleReview(req.id, 'REJECTED')}
                          disabled={reviewing === req.id}
                          className="p-1.5 rounded-lg transition-colors disabled:opacity-50"
                          style={{ background: 'rgba(248,113,113,0.12)', color: '#F87171' }}
                          title="Reject"
                        >
                          <XCircle size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Slide-over */}
      {slideOver && (
        <div className="fixed inset-0 z-40 flex justify-end" onClick={() => setSlideOver(null)}>
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.5)' }} />
          <aside
            className="relative w-full max-w-md flex flex-col slide-in"
            style={{ background: 'var(--color-surface)', borderLeft: '1px solid var(--color-border-mid)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: '1px solid var(--color-border-mid)' }}>
              <div>
                <h3 className="font-semibold" style={{ color: 'var(--color-text)' }}>Leave Request</h3>
                <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-subtle)' }}>
                  {slideOver.leave_type_name ?? 'Leave'} · {daysBetween(slideOver.start_date, slideOver.end_date)} day{daysBetween(slideOver.start_date, slideOver.end_date) !== 1 ? 's' : ''}
                </p>
              </div>
              <button onClick={() => setSlideOver(null)}>
                <X size={20} style={{ color: 'var(--color-text-subtle)' }} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--color-surface-mid)', border: '1px solid var(--color-border-mid)' }}>
                {[
                  { label: 'Start Date', value: fmtDate(slideOver.start_date) },
                  { label: 'End Date',   value: fmtDate(slideOver.end_date)   },
                  { label: 'Duration',   value: `${daysBetween(slideOver.start_date, slideOver.end_date)} days` },
                  { label: 'Employee ID',  value: slideOver.user_id.slice(0, 16) + '…' },
                ].map(row => (
                  <div key={row.label} className="flex justify-between">
                    <p className="text-xs" style={{ color: 'var(--color-text-subtle)' }}>{row.label}</p>
                    <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{row.value}</p>
                  </div>
                ))}
              </div>

              {slideOver.notes && (
                <div>
                  <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--color-text-subtle)' }}>Notes from employee</p>
                  <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{slideOver.notes}</p>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
                  Review Note <span style={{ color: 'var(--color-text-subtle)' }}>(optional)</span>
                </label>
                <textarea
                  value={reviewNote}
                  onChange={e => setReviewNote(e.target.value)}
                  placeholder="Add a note…"
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

            <div className="px-6 py-5 flex gap-3" style={{ borderTop: '1px solid var(--color-border-mid)' }}>
              <button
                onClick={() => handleReview(slideOver.id, 'APPROVED', reviewNote)}
                disabled={reviewing === slideOver.id}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl py-3 font-semibold text-white text-sm disabled:opacity-50"
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
                className="flex-1 flex items-center justify-center gap-2 rounded-xl py-3 font-semibold text-sm disabled:opacity-50"
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
