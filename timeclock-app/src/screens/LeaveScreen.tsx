import { useEffect, useState } from 'react';
import { Calendar, CheckCircle, XCircle, AlertCircle, Clock, Plus, X, ChevronDown } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';

interface Balance {
  leave_type_id: string;
  leave_type_name: string;
  year: number;
  total_days: number;
  used_days: number;
  remaining_days: number;
  is_unlimited: boolean;
}

interface LeaveRequest {
  id: string;
  leave_type_id: string;
  leave_type_name?: string;
  start_date: string;
  end_date: string;
  status: string;
  notes: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; icon: typeof Clock; color: string; bg: string }> = {
  PENDING:   { label: 'Pending',   icon: AlertCircle,  color: '#FCD34D', bg: 'rgba(252,211,77,0.12)'  },
  APPROVED:  { label: 'Approved',  icon: CheckCircle,  color: '#4ADE80', bg: 'rgba(74,222,128,0.12)'  },
  REJECTED:  { label: 'Rejected',  icon: XCircle,      color: '#F87171', bg: 'rgba(248,113,113,0.12)' },
  CANCELLED: { label: 'Cancelled', icon: XCircle,      color: '#64748B', bg: 'rgba(100,116,139,0.12)' },
};

function fmtDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-CA', {
    month: 'short', day: 'numeric',
  });
}

function daysBetween(start: string, end: string) {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.round(ms / 86400000) + 1;
}

export default function LeaveScreen() {
  const { companyId, hasLeaveAccess } = useAuth();

  if (!hasLeaveAccess) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center"
        style={{ background: 'var(--color-bg)' }}>
        <Calendar size={40} style={{ color: 'var(--color-text-subtle)', marginBottom: 16, opacity: 0.4 }} />
        <p className="text-base font-semibold mb-2" style={{ color: 'var(--color-text)' }}>
          Leave Not Available
        </p>
        <p className="text-sm" style={{ color: 'var(--color-text-subtle)' }}>
          Your account is not set up for leave requests. Contact your manager for more information.
        </p>
      </div>
    );
  }
  const [balances,  setBalances]  = useState<Balance[]>([]);
  const [requests,  setRequests]  = useState<LeaveRequest[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [showForm,  setShowForm]  = useState(false);

  // Form state
  const today = new Date().toISOString().split('T')[0];
  const [formType,  setFormType]  = useState('');
  const [startDate, setStartDate] = useState(today);
  const [endDate,   setEndDate]   = useState(today);
  const [notes,     setNotes]     = useState('');
  const [submitting,setSubmitting]= useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    Promise.all([
      api.getLeaveBalances(companyId),
      api.getMyLeaveRequests(companyId),
    ]).then(([b, r]) => {
      setBalances(b as Balance[]);
      setRequests(r as LeaveRequest[]);
      if ((b as Balance[]).length > 0) setFormType((b as Balance[])[0].leave_type_id);
    }).finally(() => setLoading(false));
  }, [companyId]);

  const handleSubmit = async () => {
    if (!formType) return;
    setSubmitting(true); setFormError('');
    try {
      await api.requestLeave({
        company_id:    companyId,
        leave_type_id: formType,
        start_date:    startDate,
        end_date:      endDate,
        notes:         notes || undefined,
      });
      const r = await api.getMyLeaveRequests(companyId);
      setRequests(r as LeaveRequest[]);
      setShowForm(false);
      setNotes('');
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'Failed to submit');
    } finally { setSubmitting(false); }
  };

  const inputStyle = {
    background: 'var(--color-surface-mid)',
    border: '1.5px solid var(--color-surface-high)',
    color: 'var(--color-text)',
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div
          className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
          style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 px-4 pt-6 pb-4 overflow-y-auto page-enter">

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>Time Off</h1>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium"
          style={{ background: 'var(--color-primary)', color: '#fff' }}
        >
          <Plus size={15} /> Request
        </button>
      </div>

      {/* Balances card */}
      <div
        className="rounded-2xl overflow-hidden mb-5"
        style={{ background: 'var(--color-surface-mid)', border: '1px solid var(--color-surface-high)' }}
      >
        <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--color-surface-high)' }}>
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-text-subtle)' }}>
            Balances — {new Date().getFullYear()}
          </p>
        </div>

        {balances.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm" style={{ color: 'var(--color-text-subtle)' }}>
            No leave types configured
          </div>
        ) : (
          balances.map((b, i) => {
            const pct = b.is_unlimited ? 100 : b.total_days > 0 ? (b.used_days / b.total_days) * 100 : 0;
            return (
              <div
                key={b.leave_type_id}
                className="px-4 py-4"
                style={{ borderBottom: i < balances.length - 1 ? '1px solid var(--color-surface-high)' : undefined }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                    {b.leave_type_name}
                  </span>
                  <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                    {b.is_unlimited ? '∞' : `${b.remaining_days} / ${b.total_days}`}
                    <span className="text-xs font-normal ml-1" style={{ color: 'var(--color-text-subtle)' }}>
                      {b.is_unlimited ? '' : 'days left'}
                    </span>
                  </span>
                </div>
                {!b.is_unlimited && (
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-surface-high)' }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(pct, 100)}%`,
                        background: pct > 80 ? 'var(--color-error)' : pct > 50 ? 'var(--color-warning)' : 'var(--color-primary)',
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Requests history */}
      <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--color-text-subtle)' }}>
        Recent Requests
      </p>

      {requests.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <Calendar size={40} style={{ color: 'var(--color-surface-high)' }} />
          <p className="text-sm" style={{ color: 'var(--color-text-subtle)' }}>No requests yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map(req => {
            const cfg  = STATUS_CONFIG[req.status] ?? STATUS_CONFIG.PENDING;
            const Icon = cfg.icon;
            const days = daysBetween(req.start_date, req.end_date);
            return (
              <div
                key={req.id}
                className="rounded-2xl p-4 space-y-2"
                style={{ background: 'var(--color-surface-mid)', border: '1px solid var(--color-surface-high)' }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                    {req.leave_type_name ?? 'Leave'}
                  </span>
                  <span
                    className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full"
                    style={{ color: cfg.color, background: cfg.bg }}
                  >
                    <Icon size={11} /> {cfg.label}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>
                  <Calendar size={13} />
                  <span>
                    {fmtDate(req.start_date)}
                    {req.end_date !== req.start_date && ` → ${fmtDate(req.end_date)}`}
                  </span>
                  <span className="ml-auto text-xs" style={{ color: 'var(--color-text-subtle)' }}>
                    {days} day{days !== 1 ? 's' : ''}
                  </span>
                </div>
                {req.notes && (
                  <p className="text-xs" style={{ color: 'var(--color-text-subtle)' }}>{req.notes}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Bottom sheet — Request form */}
      {showForm && (
        <div className="fixed inset-0 z-50" onClick={() => setShowForm(false)}>
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.6)' }} />
          <div
            className="absolute bottom-0 left-0 right-0 rounded-t-2xl sheet-enter overflow-y-auto"
            style={{ background: 'var(--color-surface-mid)', maxHeight: '85vh' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Sheet header */}
            <div
              className="flex items-center justify-between px-5 py-4 sticky top-0"
              style={{ background: 'var(--color-surface-mid)', borderBottom: '1px solid var(--color-surface-high)' }}
            >
              <h3 className="font-semibold" style={{ color: 'var(--color-text)' }}>Request Time Off</h3>
              <button onClick={() => setShowForm(false)}>
                <X size={20} style={{ color: 'var(--color-text-subtle)' }} />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">

              {/* Leave type */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
                  Leave Type
                </label>
                <div className="relative">
                  <select
                    value={formType}
                    onChange={e => setFormType(e.target.value)}
                    className="w-full appearance-none rounded-xl px-4 py-3 text-sm focus:outline-none pr-10"
                    style={inputStyle}
                  >
                    {balances.map(b => (
                      <option key={b.leave_type_id} value={b.leave_type_id}>
                        {b.leave_type_name}
                        {!b.is_unlimited && ` (${b.remaining_days} days left)`}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ color: 'var(--color-text-subtle)' }} />
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={e => { setStartDate(e.target.value); if (e.target.value > endDate) setEndDate(e.target.value); }}
                    className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
                    End Date
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    min={startDate}
                    onChange={e => setEndDate(e.target.value)}
                    className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none"
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Duration pill */}
              <div className="flex justify-center">
                <span
                  className="text-xs font-medium px-4 py-1.5 rounded-full"
                  style={{ background: 'rgba(37,99,235,0.12)', color: '#93C5FD' }}
                >
                  {daysBetween(startDate, endDate)} day{daysBetween(startDate, endDate) !== 1 ? 's' : ''} requested
                </span>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
                  Notes <span style={{ color: 'var(--color-text-subtle)' }}>(optional)</span>
                </label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Reason for time off…"
                  rows={3}
                  className="w-full rounded-xl px-4 py-3 text-sm resize-none focus:outline-none"
                  style={inputStyle}
                />
              </div>

              {formError && (
                <div
                  className="px-4 py-3 rounded-xl text-sm"
                  style={{ background: 'rgba(220,38,38,0.1)', color: 'var(--color-error)' }}
                >
                  {formError}
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={submitting || !formType}
                className="w-full flex items-center justify-center gap-2 rounded-2xl font-bold text-white text-base transition-all active:scale-[0.98] disabled:opacity-50"
                style={{ height: 52, background: 'var(--color-primary)' }}
              >
                {submitting ? (
                  <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  'Submit Request'
                )}
              </button>

              <div className="pb-safe" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
