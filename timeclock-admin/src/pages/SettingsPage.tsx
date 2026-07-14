import { useEffect, useState } from 'react';
import { Globe, Clock, DollarSign, Calendar, Save } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';

type SettingsTab = 'GENERAL' | 'TIME_TRACKING' | 'PAYROLL' | 'LEAVE_TYPES';

const TABS: { key: SettingsTab; label: string; icon: typeof Globe }[] = [
  { key: 'GENERAL',       label: 'General',       icon: Globe      },
  { key: 'TIME_TRACKING', label: 'Time Tracking',  icon: Clock      },
  { key: 'PAYROLL',       label: 'Payroll Rules',  icon: DollarSign },
  { key: 'LEAVE_TYPES',   label: 'Leave Types',    icon: Calendar   },
];

const TIMEZONES = [
  'America/Toronto',
  'America/Vancouver',
  'America/Edmonton',
  'America/Winnipeg',
  'America/Halifax',
  'America/St_Johns',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
];

interface Settings {
  default_timezone: string;
  default_currency: string;
  overtime_threshold_daily: number;
  overtime_threshold_weekly: number;
  overtime_multiplier: number;
  break_deduction_minutes: number;
  require_gps: boolean;
  allow_manual_entry: boolean;
}

export default function SettingsPage() {
  const { companyId } = useAuth();
  const [tab,     setTab]     = useState<SettingsTab>('GENERAL');
  const [form,    setForm]    = useState<Settings>({
    default_timezone:          'America/Toronto',
    default_currency:          'CAD',
    overtime_threshold_daily:  8,
    overtime_threshold_weekly: 44,
    overtime_multiplier:       1.5,
    break_deduction_minutes:   0,
    require_gps:               false,
    allow_manual_entry:        true,
  });
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);

  useEffect(() => {
    api.getCompanySettings(companyId)
      .then(d => { if (d) setForm(d as Settings); })
      .finally(() => setLoading(false));
  }, [companyId]);

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setForm(f => ({ ...f, [key]: value }));

  const handleSave = async () => {
    setSaving(true); setSaved(false);
    try {
      await api.updateCompanySettings({ company_id: companyId, ...form });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally { setSaving(false); }
  };

  const inputStyle = {
    background: 'var(--color-surface-mid)',
    border: '1.5px solid var(--color-border-mid)',
    color: 'var(--color-text)',
  };

  function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
      <div className="flex items-start justify-between gap-8 py-4" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{label}</p>
          {hint && <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-subtle)' }}>{hint}</p>}
        </div>
        <div className="flex-shrink-0">{children}</div>
      </div>
    );
  }

  function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
    return (
      <button
        onClick={() => onChange(!value)}
        className="relative w-10 h-6 rounded-full transition-colors"
        style={{ background: value ? 'var(--color-primary)' : 'var(--color-surface-high)' }}
      >
        <span
          className="absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform"
          style={{ transform: value ? 'translateX(16px)' : 'translateX(0)' }}
        />
      </button>
    );
  }

  return (
    <div className="flex flex-1 overflow-hidden">

      {/* Vertical tab list */}
      <div
        className="w-52 flex-shrink-0 flex flex-col py-4"
        style={{ borderRight: '1px solid var(--color-border-mid)' }}
      >
        {TABS.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="flex items-center gap-3 px-5 py-3 text-sm transition-colors text-left"
              style={{
                background: tab === t.key ? 'rgba(37,99,235,0.1)' : 'transparent',
                color:      tab === t.key ? '#93C5FD'              : 'var(--color-text-muted)',
                fontWeight: tab === t.key ? 600                    : 400,
                borderRight: tab === t.key ? '2px solid var(--color-primary)' : '2px solid transparent',
              }}
            >
              <Icon size={16} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-xl px-8 py-6">
          <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--color-text)' }}>
            {TABS.find(t => t.key === tab)?.label}
          </h1>
          <p className="text-sm mb-6" style={{ color: 'var(--color-text-muted)' }}>
            Manage your company's {TABS.find(t => t.key === tab)?.label.toLowerCase()} configuration.
          </p>

          {loading ? (
            <div className="space-y-4">
              {[1,2,3,4].map(i => <div key={i} className="skeleton h-14 rounded-xl" />)}
            </div>
          ) : (
            <>
              {/* GENERAL tab */}
              {tab === 'GENERAL' && (
                <div>
                  <Field label="Default Timezone" hint="Used as fallback when employee timezone is not set">
                    <select
                      value={form.default_timezone}
                      onChange={e => set('default_timezone', e.target.value)}
                      className="rounded-lg px-3 py-2 text-sm focus:outline-none"
                      style={inputStyle}
                    >
                      {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                    </select>
                  </Field>
                  <Field label="Default Currency" hint="Currency for payroll calculations">
                    <select
                      value={form.default_currency}
                      onChange={e => set('default_currency', e.target.value)}
                      className="rounded-lg px-3 py-2 text-sm focus:outline-none"
                      style={inputStyle}
                    >
                      <option value="CAD">CAD — Canadian Dollar</option>
                      <option value="USD">USD — US Dollar</option>
                    </select>
                  </Field>
                </div>
              )}

              {/* TIME TRACKING tab */}
              {tab === 'TIME_TRACKING' && (
                <div>
                  <Field label="Require GPS on Clock In/Out" hint="Employees must have location enabled">
                    <Toggle value={form.require_gps} onChange={v => set('require_gps', v)} />
                  </Field>
                  <Field label="Allow Manual Entries" hint="Employees can submit past time entries for approval">
                    <Toggle value={form.allow_manual_entry} onChange={v => set('allow_manual_entry', v)} />
                  </Field>
                  <Field label="Break Deduction" hint="Automatically deduct break time (minutes)">
                    <input
                      type="number"
                      min={0}
                      max={120}
                      value={form.break_deduction_minutes}
                      onChange={e => set('break_deduction_minutes', parseInt(e.target.value) || 0)}
                      className="w-20 rounded-lg px-3 py-2 text-sm text-center focus:outline-none"
                      style={inputStyle}
                    />
                  </Field>
                </div>
              )}

              {/* PAYROLL tab */}
              {tab === 'PAYROLL' && (
                <div>
                  <Field label="Daily Overtime Threshold" hint="Hours per day before overtime kicks in">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={24}
                        step={0.5}
                        value={form.overtime_threshold_daily}
                        onChange={e => set('overtime_threshold_daily', parseFloat(e.target.value) || 8)}
                        className="w-20 rounded-lg px-3 py-2 text-sm text-center focus:outline-none"
                        style={inputStyle}
                      />
                      <span className="text-xs" style={{ color: 'var(--color-text-subtle)' }}>hrs/day</span>
                    </div>
                  </Field>
                  <Field label="Weekly Overtime Threshold" hint="Hours per week before overtime kicks in">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={168}
                        value={form.overtime_threshold_weekly}
                        onChange={e => set('overtime_threshold_weekly', parseInt(e.target.value) || 44)}
                        className="w-20 rounded-lg px-3 py-2 text-sm text-center focus:outline-none"
                        style={inputStyle}
                      />
                      <span className="text-xs" style={{ color: 'var(--color-text-subtle)' }}>hrs/week</span>
                    </div>
                  </Field>
                  <Field label="Overtime Multiplier" hint="Rate multiplier for overtime hours (e.g. 1.5x)">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={3}
                        step={0.25}
                        value={form.overtime_multiplier}
                        onChange={e => set('overtime_multiplier', parseFloat(e.target.value) || 1.5)}
                        className="w-20 rounded-lg px-3 py-2 text-sm text-center focus:outline-none"
                        style={inputStyle}
                      />
                      <span className="text-xs" style={{ color: 'var(--color-text-subtle)' }}>×</span>
                    </div>
                  </Field>
                </div>
              )}

              {/* LEAVE TYPES tab */}
              {tab === 'LEAVE_TYPES' && (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                  <Calendar size={36} style={{ color: 'var(--color-surface-high)' }} />
                  <p className="text-sm" style={{ color: 'var(--color-text-subtle)' }}>
                    Leave type configuration coming soon
                  </p>
                  <p className="text-xs" style={{ color: 'var(--color-text-subtle)' }}>
                    Contact support to configure leave types for your company.
                  </p>
                </div>
              )}

              {/* Save button */}
              {tab !== 'LEAVE_TYPES' && (
                <div className="pt-6">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 rounded-xl px-5 py-2.5 font-semibold text-sm text-white disabled:opacity-50 transition-all"
                    style={{ background: saved ? 'var(--color-success)' : 'var(--color-primary)' }}
                  >
                    {saving
                      ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      : saved
                        ? 'Saved!'
                        : <><Save size={14} /> Save Changes</>
                    }
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
