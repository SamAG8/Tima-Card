import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Pencil, RotateCcw, XCircle } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { PayrollDetailRow, PayrollReport } from '../lib/payrollReportTypes';
import { PAYROLL_DATE_PRESETS, getPresetDateRange, type DatePreset } from '../lib/payrollDateRange';
import { TARGET_SHIFT_HOURS, classifyShiftHours, type ShiftBand } from '../lib/shiftClassification';

const mono = { fontFamily: "'JetBrains Mono', monospace" };

function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtDateTime(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
}

const BAND_STYLE: Record<ShiftBand, { rowBg: string; border: string; label: string; chipBg: string; chipColor: string }> = {
  early: {
    rowBg: 'rgba(251,191,36,0.06)',
    border: '#F59E0B',
    label: 'Early out',
    chipBg: 'rgba(245,158,11,0.15)',
    chipColor: '#FBBF24',
  },
  late: {
    rowBg: 'rgba(96,165,250,0.08)',
    border: '#3B82F6',
    label: 'Late out',
    chipBg: 'rgba(59,130,246,0.18)',
    chipColor: '#93C5FD',
  },
  normal: {
    rowBg: 'transparent',
    border: 'transparent',
    label: 'On target',
    chipBg: 'rgba(74,222,128,0.12)',
    chipColor: '#4ADE80',
  },
};

const EMPTY_DESCRIPTION = 'Nothing written';

function entryDescriptionParts(row: PayrollDetailRow) {
  const raw = row.description?.trim();
  const isEmpty = !raw;
  return { isEmpty, text: raw || EMPTY_DESCRIPTION };
}

function DescriptionBlock({ row }: { row: PayrollDetailRow }) {
  const { isEmpty, text } = entryDescriptionParts(row);
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <span
        className={`text-xs leading-snug break-words ${isEmpty ? 'italic' : ''}`}
        style={{ color: isEmpty ? 'var(--color-text-subtle)' : 'var(--color-text-muted)' }}
        title={text}
      >
        {text}
      </span>
      {isEmpty && (
        <span
          className="text-[10px] font-semibold w-fit px-1.5 py-0.5 rounded"
          style={{ background: 'rgba(251,191,36,0.14)', color: '#FBBF24' }}
        >
          Manager review
        </span>
      )}
    </div>
  );
}

export default function PayrollTimeEntriesPanel() {
  const { companyId } = useAuth();
  const [preset, setPreset] = useState<DatePreset>('THIS_MONTH');
  const [startDate, setStartDate] = useState(() => getPresetDateRange('THIS_MONTH')[0]);
  const [endDate, setEndDate] = useState(() => getPresetDateRange('THIS_MONTH')[1]);
  const [report, setReport] = useState<PayrollReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);

  const [editRow, setEditRow] = useState<PayrollDetailRow | null>(null);
  const [editIn, setEditIn] = useState('');
  const [editOut, setEditOut] = useState('');
  const [editNote, setEditNote] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [statusBusyId, setStatusBusyId] = useState<string | null>(null);

  const load = async () => {
    if (!companyId) {
      setError('No company selected. Sign out and sign in again.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = (await api.getPayrollReport(companyId, startDate, endDate)) as PayrollReport;
      setReport(data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load entries';
      setError(msg);
      setReport(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load when range or company changes
  }, [companyId, startDate, endDate]);

  const handlePreset = (p: DatePreset) => {
    setPreset(p);
    if (p !== 'CUSTOM') {
      const [s, e] = getPresetDateRange(p);
      setStartDate(s);
      setEndDate(e);
    }
  };

  const openEdit = (row: PayrollDetailRow) => {
    setEditRow(row);
    setEditIn(toDatetimeLocalValue(row.clock_in));
    setEditOut(toDatetimeLocalValue(row.clock_out));
    setEditNote('');
  };

  const saveEdit = async () => {
    if (!companyId || !editRow || !editIn || !editOut) return;
    setSavingEdit(true);
    setError(null);
    try {
      const ci = new Date(editIn);
      const co = new Date(editOut);
      if (co <= ci) {
        setError('Clock out must be after clock in.');
        return;
      }
      await api.adminUpdateEntryTimes({
        entry_id: editRow.entry_id,
        company_id: companyId,
        clock_in: ci.toISOString(),
        clock_out: co.toISOString(),
        admin_note: editNote.trim() || undefined,
      });
      setEditRow(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save changes');
    } finally {
      setSavingEdit(false);
    }
  };

  const setEntryStatus = async (row: PayrollDetailRow, status: 'REJECTED' | 'SUBMITTED') => {
    if (!companyId) return;
    const ok =
      status === 'REJECTED'
        ? window.confirm('Reject this entry? It will be removed from payroll until corrected.')
        : window.confirm('Send this entry back to the review queue (SUBMITTED)?');
    if (!ok) return;
    setStatusBusyId(row.entry_id);
    setError(null);
    try {
      await api.adminSetEntryStatus({ entry_id: row.entry_id, company_id: companyId, status });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update status');
    } finally {
      setStatusBusyId(null);
    }
  };

  const inputStyle = {
    background: 'var(--color-surface-mid)',
    border: '1.5px solid var(--color-border-mid)',
    color: 'var(--color-text)',
  };

  const rows = report?.rows ?? [];

  const btnTouch = 'min-h-[44px] touch-manipulation active:opacity-90';

  return (
    <div
      className="rounded-2xl overflow-hidden mb-6 max-w-full"
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-mid)' }}
    >
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className={`w-full flex items-start sm:items-center justify-between gap-3 px-4 sm:px-5 py-4 text-left ${btnTouch}`}
        style={{ borderBottom: expanded ? '1px solid var(--color-border-mid)' : undefined }}
      >
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-[15px] sm:text-base" style={{ color: 'var(--color-text)' }}>
            Time entries — review
          </h2>
          <p className="text-[11px] sm:text-xs mt-1 leading-snug" style={{ color: 'var(--color-text-muted)' }}>
            vs ~{TARGET_SHIFT_HOURS}h day: <span style={{ color: '#FBBF24' }}>early</span> &lt; 7.25h,{' '}
            <span style={{ color: '#93C5FD' }}>late</span> &gt; 9.25h. Empty work notes show as{' '}
            <strong style={{ color: 'var(--color-text)' }}>{EMPTY_DESCRIPTION}</strong> — managers should confirm before payroll.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 pt-0.5">
          <span className="text-xs whitespace-nowrap" style={{ color: 'var(--color-text-subtle)' }}>
            {rows.length} entries
          </span>
          {expanded ? (
            <ChevronUp size={18} style={{ color: 'var(--color-text-subtle)' }} />
          ) : (
            <ChevronDown size={18} style={{ color: 'var(--color-text-subtle)' }} />
          )}
        </div>
      </button>

      {expanded && (
        <div className="p-4 sm:p-5 pt-2 space-y-4">
          <div className="flex gap-2 flex-wrap">
            {PAYROLL_DATE_PRESETS.map(p => (
              <button
                key={p.key}
                type="button"
                onClick={() => handlePreset(p.key)}
                className={`px-4 py-2.5 sm:py-1.5 rounded-full text-xs font-medium transition-all ${btnTouch}`}
                style={{
                  background: preset === p.key ? 'var(--color-primary)' : 'var(--color-surface-mid)',
                  color: preset === p.key ? '#fff' : 'var(--color-text-muted)',
                  border: `1px solid ${preset === p.key ? 'var(--color-primary)' : 'var(--color-border-mid)'}`,
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          {preset === 'CUSTOM' && (
            <div className="grid grid-cols-2 gap-3 max-w-md">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-muted)' }}>
                  Start
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="w-full rounded-xl px-3 py-2 text-sm"
                  style={inputStyle}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-muted)' }}>
                  End
                </label>
                <input
                  type="date"
                  value={endDate}
                  min={startDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="w-full rounded-xl px-3 py-2 text-sm"
                  style={inputStyle}
                />
              </div>
            </div>
          )}

          {preset !== 'CUSTOM' && (
            <p className="text-xs" style={{ color: 'var(--color-text-subtle)' }}>
              {startDate} → {endDate}
            </p>
          )}

          {error && (
            <p
              className="text-sm rounded-xl px-4 py-3"
              style={{
                background: 'rgba(248,113,113,0.12)',
                color: '#F87171',
                border: '1px solid rgba(248,113,113,0.35)',
              }}
            >
              {error}
            </p>
          )}

          {loading ? (
            <div className="py-12 flex justify-center">
              <span className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--color-primary)' }} />
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm py-8 text-center" style={{ color: 'var(--color-text-subtle)' }}>
              No <strong style={{ color: 'var(--color-text)' }}>APPROVED</strong> entries in this range.
            </p>
          ) : (
            <>
              {/* Mobile: stacked cards, full-width action buttons (44px min touch target) */}
              <div className="md:hidden space-y-3">
                {rows.map(row => {
                  const band = classifyShiftHours(row.hours_worked);
                  const st = BAND_STYLE[band];
                  const busy = statusBusyId === row.entry_id;
                  return (
                    <div
                      key={row.entry_id}
                      className="rounded-xl p-4"
                      style={{
                        background: st.rowBg,
                        border: '1px solid var(--color-border-mid)',
                        boxShadow: band !== 'normal' ? `inset 4px 0 0 0 ${st.border}` : undefined,
                      }}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                        <span
                          className="text-xs px-2.5 py-1 rounded-full font-medium"
                          style={{ background: st.chipBg, color: st.chipColor }}
                        >
                          {st.label}
                        </span>
                        <span
                          className="text-xs px-2.5 py-1 rounded-full font-medium"
                          style={{ background: 'rgba(74,222,128,0.12)', color: '#4ADE80' }}
                        >
                          Approved
                        </span>
                      </div>
                      <dl className="space-y-2 text-sm mb-4">
                        <div className="flex justify-between gap-3">
                          <dt className="shrink-0 text-xs" style={{ color: 'var(--color-text-subtle)' }}>Date</dt>
                          <dd style={{ color: 'var(--color-text-muted)' }} className="text-right break-all">{row.work_date}</dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="shrink-0 text-xs" style={{ color: 'var(--color-text-subtle)' }}>Employee</dt>
                          <dd className="text-right font-medium break-all" style={{ color: 'var(--color-text)' }}>
                            {row.worker_email ?? row.user_id.slice(0, 8) + '…'}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="shrink-0 text-xs" style={{ color: 'var(--color-text-subtle)' }}>Project</dt>
                          <dd className="text-right break-words" style={{ color: 'var(--color-text-muted)' }}>
                            {row.project_name ?? '—'}
                          </dd>
                        </div>
                        <div className="flex flex-col gap-1.5 sm:flex-row sm:justify-between sm:gap-3">
                          <dt className="shrink-0 text-xs pt-0.5" style={{ color: 'var(--color-text-subtle)' }}>
                            Description
                          </dt>
                          <dd className="text-right sm:max-w-[65%] min-w-0">
                            <DescriptionBlock row={row} />
                          </dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="shrink-0 text-xs" style={{ color: 'var(--color-text-subtle)' }}>Clock in</dt>
                          <dd className="text-right text-xs" style={{ ...mono, color: 'var(--color-text)' }}>{fmtDateTime(row.clock_in)}</dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="shrink-0 text-xs" style={{ color: 'var(--color-text-subtle)' }}>Clock out</dt>
                          <dd className="text-right text-xs" style={{ ...mono, color: 'var(--color-text)' }}>{fmtDateTime(row.clock_out)}</dd>
                        </div>
                        <div className="flex justify-between gap-3 pt-1 border-t border-[var(--color-border)]">
                          <dt className="shrink-0 text-xs font-semibold" style={{ color: 'var(--color-text-subtle)' }}>Hours</dt>
                          <dd className="font-bold text-base" style={{ ...mono, color: 'var(--color-text)' }}>
                            {row.hours_worked.toFixed(2)}h
                          </dd>
                        </div>
                      </dl>
                      <div className="flex flex-col gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => openEdit(row)}
                          className={`w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium ${btnTouch}`}
                          style={{
                            background: 'var(--color-surface-mid)',
                            color: 'var(--color-primary)',
                            border: '1px solid var(--color-border-mid)',
                          }}
                        >
                          <Pencil size={16} /> Adjust
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setEntryStatus(row, 'SUBMITTED')}
                          className={`w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium ${btnTouch}`}
                          style={{
                            background: 'rgba(96,165,250,0.12)',
                            color: '#93C5FD',
                            border: '1px solid rgba(96,165,250,0.35)',
                          }}
                        >
                          <RotateCcw size={16} /> Send back
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setEntryStatus(row, 'REJECTED')}
                          className={`w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium ${btnTouch}`}
                          style={{
                            background: 'rgba(248,113,113,0.1)',
                            color: '#F87171',
                            border: '1px solid rgba(248,113,113,0.35)',
                          }}
                        >
                          <XCircle size={16} /> Reject
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Tablet/desktop: table */}
              <div className="hidden md:block overflow-x-auto -mx-1">
                <table className="w-full text-sm min-w-[880px]">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--color-border-mid)' }}>
                      <th className="text-left px-3 py-2 text-xs font-medium" style={{ color: 'var(--color-text-subtle)' }}>
                        Shift
                      </th>
                      <th className="text-left px-3 py-2 text-xs font-medium" style={{ color: 'var(--color-text-subtle)' }}>
                        Date
                      </th>
                      <th className="text-left px-3 py-2 text-xs font-medium" style={{ color: 'var(--color-text-subtle)' }}>
                        Employee
                      </th>
                      <th className="text-left px-3 py-2 text-xs font-medium" style={{ color: 'var(--color-text-subtle)' }}>
                        Project
                      </th>
                      <th
                        className="text-left px-3 py-2 text-xs font-medium max-w-[200px]"
                        style={{ color: 'var(--color-text-subtle)' }}
                        title="Work notes from the employee. If empty, confirm with the manager before payroll."
                      >
                        Description
                      </th>
                      <th className="text-left px-3 py-2 text-xs font-medium" style={{ color: 'var(--color-text-subtle)' }}>
                        Clock in
                      </th>
                      <th className="text-left px-3 py-2 text-xs font-medium" style={{ color: 'var(--color-text-subtle)' }}>
                        Clock out
                      </th>
                      <th className="text-right px-3 py-2 text-xs font-medium" style={{ color: 'var(--color-text-subtle)' }}>
                        Hours
                      </th>
                      <th className="text-right px-3 py-2 text-xs font-medium" style={{ color: 'var(--color-text-subtle)' }}>
                        Status
                      </th>
                      <th className="text-right px-3 py-2 text-xs font-medium" style={{ color: 'var(--color-text-subtle)' }}>
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(row => {
                      const band = classifyShiftHours(row.hours_worked);
                      const st = BAND_STYLE[band];
                      const busy = statusBusyId === row.entry_id;
                      return (
                        <tr
                          key={row.entry_id}
                          className="table-row"
                          style={{
                            borderBottom: '1px solid var(--color-border)',
                            background: st.rowBg,
                            boxShadow: band !== 'normal' ? `inset 3px 0 0 0 ${st.border}` : undefined,
                          }}
                        >
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span
                              className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                              style={{ background: st.chipBg, color: st.chipColor }}
                            >
                              {st.label}
                            </span>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--color-text-muted)' }}>
                            {row.work_date}
                          </td>
                          <td className="px-3 py-2 font-medium max-w-[140px] truncate" style={{ color: 'var(--color-text)' }} title={row.worker_email ?? undefined}>
                            {row.worker_email ?? row.user_id.slice(0, 8) + '…'}
                          </td>
                          <td className="px-3 py-2 max-w-[120px] truncate" style={{ color: 'var(--color-text-muted)' }} title={row.project_name ?? undefined}>
                            {row.project_name ?? '—'}
                          </td>
                          <td className="px-3 py-2 align-top max-w-[200px]">
                            <DescriptionBlock row={row} />
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs" style={{ ...mono, color: 'var(--color-text)' }}>
                            {fmtDateTime(row.clock_in)}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs" style={{ ...mono, color: 'var(--color-text)' }}>
                            {fmtDateTime(row.clock_out)}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold" style={{ ...mono, color: 'var(--color-text)' }}>
                            {row.hours_worked.toFixed(2)}h
                          </td>
                          <td className="px-3 py-2 text-right">
                            <span
                              className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                              style={{ background: 'rgba(74,222,128,0.12)', color: '#4ADE80' }}
                            >
                              Approved
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <div className="inline-flex flex-wrap gap-1 justify-end">
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => openEdit(row)}
                                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-[10px] font-medium min-h-[36px] ${btnTouch}`}
                                style={{
                                  background: 'var(--color-surface-mid)',
                                  color: 'var(--color-primary)',
                                  border: '1px solid var(--color-border-mid)',
                                }}
                              >
                                <Pencil size={11} /> Adjust
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => setEntryStatus(row, 'SUBMITTED')}
                                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-[10px] font-medium min-h-[36px] ${btnTouch}`}
                                style={{
                                  background: 'rgba(96,165,250,0.1)',
                                  color: '#93C5FD',
                                  border: '1px solid rgba(96,165,250,0.25)',
                                }}
                              >
                                <RotateCcw size={11} /> Send back
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => setEntryStatus(row, 'REJECTED')}
                                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-[10px] font-medium min-h-[36px] ${btnTouch}`}
                                style={{
                                  background: 'rgba(248,113,113,0.1)',
                                  color: '#F87171',
                                  border: '1px solid rgba(248,113,113,0.25)',
                                }}
                              >
                                <XCircle size={11} /> Reject
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {editRow && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ background: 'rgba(0,0,0,0.65)' }}
          onClick={() => {
            if (!savingEdit) setEditRow(null);
          }}
        >
          <div
            className="rounded-t-2xl sm:rounded-2xl max-w-lg w-full max-h-[min(92vh,900px)] overflow-y-auto p-5 sm:p-6 shadow-xl"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-mid)' }}
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold mb-1" style={{ color: 'var(--color-text)' }}>
              Adjust clock in / out
            </h3>
            <p className="text-xs mb-4" style={{ color: 'var(--color-text-muted)' }}>
              {editRow.worker_email} · {editRow.work_date}
            </p>
            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-muted)' }}>
                  Clock in (local browser time)
                </label>
                <input
                  type="datetime-local"
                  value={editIn}
                  onChange={e => setEditIn(e.target.value)}
                  className="w-full rounded-xl px-4 py-3 sm:py-2.5 text-sm min-h-[44px] touch-manipulation"
                  style={inputStyle}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-muted)' }}>
                  Clock out
                </label>
                <input
                  type="datetime-local"
                  value={editOut}
                  onChange={e => setEditOut(e.target.value)}
                  className="w-full rounded-xl px-4 py-3 sm:py-2.5 text-sm min-h-[44px] touch-manipulation"
                  style={inputStyle}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-muted)' }}>
                  Admin note (optional)
                </label>
                <textarea
                  value={editNote}
                  onChange={e => setEditNote(e.target.value)}
                  rows={2}
                  placeholder="e.g. Correcting a forgotten punch"
                  className="w-full rounded-xl px-4 py-3 sm:py-2.5 text-sm resize-none min-h-[88px] touch-manipulation"
                  style={inputStyle}
                />
              </div>
            </div>
            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-1">
              <button
                type="button"
                disabled={savingEdit}
                onClick={() => setEditRow(null)}
                className={`w-full sm:w-auto px-4 rounded-xl text-sm font-medium ${btnTouch}`}
                style={{ background: 'var(--color-surface-mid)', color: 'var(--color-text)' }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingEdit}
                onClick={saveEdit}
                className={`w-full sm:w-auto px-4 rounded-xl text-sm font-semibold text-white ${btnTouch}`}
                style={{ background: 'var(--color-primary)' }}
              >
                {savingEdit ? '…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
