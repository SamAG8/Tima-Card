import { useState } from 'react';
import { Download, BarChart2, ChevronDown, ChevronUp, TrendingUp, Clock, DollarSign, Tag, Layers } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { PayrollReport } from '../lib/payrollReportTypes';
import { PAYROLL_DATE_PRESETS, getPresetDateRange, type DatePreset } from '../lib/payrollDateRange';

const PRESETS = PAYROLL_DATE_PRESETS;

function getPresetDates(preset: DatePreset): [string, string] {
  return getPresetDateRange(preset);
}

function SummaryCard({ label, value, icon: Icon, color }: { label: string; value: string; icon: typeof Clock; color: string }) {
  return (
    <div
      className="flex-1 rounded-2xl p-5"
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-mid)' }}
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon size={15} style={{ color }} />
        <p className="text-xs font-medium" style={{ color: 'var(--color-text-subtle)' }}>{label}</p>
      </div>
      <p className="text-2xl font-bold" style={{ color: 'var(--color-text)', fontFamily: "'JetBrains Mono', monospace" }}>
        {value}
      </p>
    </div>
  );
}

function Accordion({
  title, count, countLabel, expanded, onToggle, children,
}: {
  title: string; count: number; countLabel: string;
  expanded: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-mid)' }}
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4"
        style={{ borderBottom: expanded ? '1px solid var(--color-border-mid)' : undefined }}
      >
        <span className="font-semibold text-sm" style={{ color: 'var(--color-text)' }}>{title}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: 'var(--color-text-subtle)' }}>
            {count} {countLabel}
          </span>
          {expanded
            ? <ChevronUp size={16} style={{ color: 'var(--color-text-subtle)' }} />
            : <ChevronDown size={16} style={{ color: 'var(--color-text-subtle)' }} />
          }
        </div>
      </button>
      {expanded && children}
    </div>
  );
}

const mono = { fontFamily: "'JetBrains Mono', monospace" };

export default function ReportsPage() {
  const { companyId } = useAuth();
  const [preset,    setPreset]    = useState<DatePreset>('THIS_MONTH');
  const [startDate, setStartDate] = useState(() => getPresetDates('THIS_MONTH')[0]);
  const [endDate,   setEndDate]   = useState(() => getPresetDates('THIS_MONTH')[1]);
  const [report,    setReport]    = useState<PayrollReport | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [expanded,  setExpanded]  = useState({
    workers: true, projects: false, budgetCodes: false, divisions: false,
  });

  const toggle = (key: keyof typeof expanded) =>
    setExpanded(e => ({ ...e, [key]: !e[key] }));

  const handlePreset = (p: DatePreset) => {
    setPreset(p);
    if (p !== 'CUSTOM') {
      const [s, e] = getPresetDates(p);
      setStartDate(s); setEndDate(e);
    }
  };

  const handleGenerate = async () => {
    if (!companyId) {
      setError('No company selected. Sign out and sign in again.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await api.getPayrollReport(companyId, startDate, endDate) as PayrollReport;
      setReport(data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load report';
      setError(msg);
      setReport(null);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try { await api.downloadPayrollExcel(companyId, startDate, endDate); }
    finally { setExporting(false); }
  };

  const inputStyle = {
    background: 'var(--color-surface-mid)',
    border: '1.5px solid var(--color-border-mid)',
    color: 'var(--color-text)',
  };

  return (
    <div className="flex-1 p-8 overflow-y-auto page-enter">

      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--color-text)' }}>Payroll Reports</h1>
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Rollups for <strong style={{ color: 'var(--color-text)' }}>APPROVED</strong> entries in the selected range. Review, adjust, or change status of individual punches on the{' '}
          <strong style={{ color: 'var(--color-text)' }}>Dashboard</strong> (Time entries — review).
        </p>
      </div>

      {/* Filter card */}
      <div
        className="rounded-2xl p-6 mb-6"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-mid)' }}
      >
        <div className="flex gap-2 mb-5 flex-wrap">
          {PRESETS.map(p => (
            <button
              key={p.key}
              onClick={() => handlePreset(p.key)}
              className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
              style={{
                background: preset === p.key ? 'var(--color-primary)' : 'var(--color-surface-mid)',
                color:      preset === p.key ? '#fff' : 'var(--color-text-muted)',
                border:     `1px solid ${preset === p.key ? 'var(--color-primary)' : 'var(--color-border-mid)'}`,
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        {preset === 'CUSTOM' && (
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-muted)' }}>Start Date</label>
              <input
                type="date" value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full rounded-xl px-4 py-2.5 text-sm focus:outline-none"
                style={inputStyle}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-muted)' }}>End Date</label>
              <input
                type="date" value={endDate} min={startDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full rounded-xl px-4 py-2.5 text-sm focus:outline-none"
                style={inputStyle}
              />
            </div>
          </div>
        )}

        {preset !== 'CUSTOM' && (
          <p className="text-xs mb-4" style={{ color: 'var(--color-text-subtle)' }}>
            {startDate} → {endDate}
          </p>
        )}

        {error && (
          <p className="text-sm mb-4 rounded-xl px-4 py-3" style={{ background: 'rgba(248,113,113,0.12)', color: '#F87171', border: '1px solid rgba(248,113,113,0.35)' }}>
            {error}
          </p>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 font-semibold text-sm text-white disabled:opacity-50 transition-colors"
            style={{ background: 'var(--color-primary)' }}
          >
            {loading
              ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <><BarChart2 size={15} /> Generate Report</>
            }
          </button>
          {report && (
            <button
              onClick={handleExport}
              disabled={exporting}
              className="flex items-center gap-2 rounded-xl px-4 py-2.5 font-medium text-sm text-white disabled:opacity-50 transition-colors"
              style={{ background: 'var(--color-success)' }}
            >
              <Download size={15} />
              {exporting ? 'Exporting…' : 'Excel'}
            </button>
          )}
        </div>
      </div>

      {/* Results */}
      {report && report.total_entries === 0 && (
        <p className="text-sm mb-4 rounded-xl px-4 py-3" style={{ background: 'var(--color-surface-mid)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border-mid)' }}>
          No <strong style={{ color: 'var(--color-text)' }}>APPROVED</strong> entries in this range. Change the date range or confirm data exists for this company.
        </p>
      )}

      {report && (
        <div className="space-y-5">
          {/* KPI cards */}
          <div className="flex gap-4 flex-wrap">
            <SummaryCard label="Total Entries" value={String(report.total_entries)}                            icon={TrendingUp} color="var(--color-primary)" />
            <SummaryCard label="Total Hours"   value={`${(report.total_hours ?? 0).toFixed(1)}h`}             icon={Clock}      color="var(--color-success)" />
            <SummaryCard label="Total Cost"    value={`${(report.total_cost  ?? 0).toFixed(2)} ${report.currency ?? 'CAD'}`} icon={DollarSign} color="#FCD34D" />
          </div>

          {/* By Division */}
          <Accordion
            title="By Division"
            count={report.by_division?.length ?? 0}
            countLabel="divisions"
            expanded={expanded.divisions}
            onToggle={() => toggle('divisions')}
          >
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border-mid)' }}>
                  <th className="text-left px-5 py-3 text-xs font-medium" style={{ color: 'var(--color-text-subtle)' }}>Division</th>
                  <th className="text-right px-5 py-3 text-xs font-medium" style={{ color: 'var(--color-text-subtle)' }}>Entries</th>
                  <th className="text-right px-5 py-3 text-xs font-medium" style={{ color: 'var(--color-text-subtle)' }}>Hours</th>
                  <th className="text-right px-5 py-3 text-xs font-medium" style={{ color: 'var(--color-text-subtle)' }}>Cost</th>
                </tr>
              </thead>
              <tbody>
                {(report.by_division ?? []).map((row, idx) => (
                  <tr key={idx} className="table-row" style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td className="px-5 py-3 font-medium" style={{ color: 'var(--color-text)' }}>
                      <div className="flex items-center gap-2">
                        <Layers size={13} style={{ color: 'var(--color-primary)', opacity: 0.7 }} />
                        {row.division ?? '— Untagged'}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right" style={{ color: 'var(--color-text-muted)' }}>{row.entries}</td>
                    <td className="px-5 py-3 text-right font-semibold" style={{ color: 'var(--color-text)', ...mono }}>{row.total_hours.toFixed(1)}h</td>
                    <td className="px-5 py-3 text-right font-semibold" style={{ color: '#4ADE80', ...mono }}>
                      {row.total_cost != null ? `${row.total_cost.toFixed(2)} ${row.currency}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Accordion>

          {/* By Budget Code */}
          <Accordion
            title="By Budget Code"
            count={report.by_budget_code?.length ?? 0}
            countLabel="codes"
            expanded={expanded.budgetCodes}
            onToggle={() => toggle('budgetCodes')}
          >
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border-mid)' }}>
                  <th className="text-left px-5 py-3 text-xs font-medium" style={{ color: 'var(--color-text-subtle)' }}>Code</th>
                  <th className="text-left px-5 py-3 text-xs font-medium" style={{ color: 'var(--color-text-subtle)' }}>Name</th>
                  <th className="text-left px-5 py-3 text-xs font-medium" style={{ color: 'var(--color-text-subtle)' }}>Division</th>
                  <th className="text-right px-5 py-3 text-xs font-medium" style={{ color: 'var(--color-text-subtle)' }}>Entries</th>
                  <th className="text-right px-5 py-3 text-xs font-medium" style={{ color: 'var(--color-text-subtle)' }}>Hours</th>
                  <th className="text-right px-5 py-3 text-xs font-medium" style={{ color: 'var(--color-text-subtle)' }}>Cost</th>
                </tr>
              </thead>
              <tbody>
                {(report.by_budget_code ?? []).map((row, idx) => (
                  <tr key={idx} className="table-row" style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td className="px-5 py-3">
                      <span
                        className="px-2 py-0.5 rounded text-xs font-semibold"
                        style={{ background: 'var(--color-surface-mid)', color: 'var(--color-primary)', ...mono }}
                      >
                        {row.budget_code ?? '—'}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-medium" style={{ color: 'var(--color-text)' }}>
                      {row.budget_code_name ?? 'No Budget Code'}
                    </td>
                    <td className="px-5 py-3 text-xs" style={{ color: 'var(--color-text-subtle)' }}>
                      <div className="flex items-center gap-1">
                        <Tag size={11} />
                        {row.division ?? '—'}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right" style={{ color: 'var(--color-text-muted)' }}>{row.entries}</td>
                    <td className="px-5 py-3 text-right font-semibold" style={{ color: 'var(--color-text)', ...mono }}>{row.total_hours.toFixed(1)}h</td>
                    <td className="px-5 py-3 text-right font-semibold" style={{ color: '#4ADE80', ...mono }}>
                      {row.total_cost != null ? `${row.total_cost.toFixed(2)} ${row.currency}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Accordion>

          {/* By employee */}
          <Accordion
            title="By Employee"
            count={report.by_worker.length}
            countLabel="employees"
            expanded={expanded.workers}
            onToggle={() => toggle('workers')}
          >
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border-mid)' }}>
                  <th className="text-left px-5 py-3 text-xs font-medium"  style={{ color: 'var(--color-text-subtle)' }}>Employee</th>
                  <th className="text-right px-5 py-3 text-xs font-medium" style={{ color: 'var(--color-text-subtle)' }}>Entries</th>
                  <th className="text-right px-5 py-3 text-xs font-medium" style={{ color: 'var(--color-text-subtle)' }}>Hours</th>
                  <th className="text-right px-5 py-3 text-xs font-medium" style={{ color: 'var(--color-text-subtle)' }}>Cost</th>
                </tr>
              </thead>
              <tbody>
                {report.by_worker.map(row => (
                  <tr key={row.user_id} className="table-row" style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td className="px-5 py-3 font-medium" style={{ color: 'var(--color-text)' }}>
                      {row.full_name ?? row.email ?? row.user_id.slice(0, 8) + '…'}
                    </td>
                    <td className="px-5 py-3 text-right" style={{ color: 'var(--color-text-muted)' }}>{row.entries ?? '—'}</td>
                    <td className="px-5 py-3 text-right font-semibold" style={{ color: 'var(--color-text)', ...mono }}>{row.total_hours.toFixed(1)}h</td>
                    <td className="px-5 py-3 text-right font-semibold" style={{ color: '#4ADE80', ...mono }}>
                      {(row.total_cost ?? 0).toFixed(2)} {row.currency}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Accordion>

          {/* By Project */}
          <Accordion
            title="By Project"
            count={report.by_project.length}
            countLabel="projects"
            expanded={expanded.projects}
            onToggle={() => toggle('projects')}
          >
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border-mid)' }}>
                  <th className="text-left px-5 py-3 text-xs font-medium"  style={{ color: 'var(--color-text-subtle)' }}>Project</th>
                  <th className="text-right px-5 py-3 text-xs font-medium" style={{ color: 'var(--color-text-subtle)' }}>Hours</th>
                  <th className="text-right px-5 py-3 text-xs font-medium" style={{ color: 'var(--color-text-subtle)' }}>Cost</th>
                </tr>
              </thead>
              <tbody>
                {report.by_project.map(row => (
                  <tr key={row.project_id} className="table-row" style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td className="px-5 py-3 font-medium" style={{ color: 'var(--color-text)' }}>
                      {row.project_name ?? row.project_id.slice(0, 8) + '…'}
                    </td>
                    <td className="px-5 py-3 text-right font-semibold" style={{ color: 'var(--color-text)', ...mono }}>{row.total_hours.toFixed(1)}h</td>
                    <td className="px-5 py-3 text-right font-semibold" style={{ color: '#4ADE80', ...mono }}>{row.total_cost.toFixed(2)} {row.currency}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Accordion>
        </div>
      )}
    </div>
  );
}
