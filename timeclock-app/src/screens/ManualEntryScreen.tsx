import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, AlertTriangle, Clock, ChevronDown } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';

interface Project { id: string; name: string; }

const MANUAL_REASONS = [
  { value: 'FORGOT',       label: 'Forgot to clock in/out' },
  { value: 'NO_PHONE',     label: 'Did not have phone'      },
  { value: 'SYSTEM_ERROR', label: 'System error'            },
  { value: 'OTHER',        label: 'Other'                   },
];

function calcDuration(cin: string, cout: string): string | null {
  if (!cin || !cout) return null;
  const [ih, im] = cin.split(':').map(Number);
  const [oh, om] = cout.split(':').map(Number);
  const diff = (oh * 60 + om) - (ih * 60 + im);
  if (diff <= 0) return null;
  return `${Math.floor(diff / 60)}h ${diff % 60}m`;
}

export default function ManualEntryScreen() {
  const navigate = useNavigate();
  const { companyId, userTimezone, user } = useAuth();

  const today = new Date().toISOString().split('T')[0];
  const [workDate,    setWorkDate]    = useState(today);
  const [clockIn,     setClockIn]     = useState('08:00');
  const [clockOut,    setClockOut]    = useState('17:00');
  const [reason,      setReason]      = useState('FORGOT');
  const [note,        setNote]        = useState('');
  const [description, setDescription] = useState('');
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');

  const [projects,         setProjects]         = useState<Project[]>([]);
  const [selectedProject,  setSelectedProject]  = useState<Project | null>(null);
  const [showProjectPicker, setShowProjectPicker] = useState(false);

  const duration = useMemo(() => calcDuration(clockIn, clockOut), [clockIn, clockOut]);
  const isValid  = !!duration && !!selectedProject;

  // Load all projects from all companies this user belongs to
  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from('memberships')
      .select('company_id')
      .eq('user_id', user.id)
      .then(({ data }) => {
        if (!data?.length) return;
        const companyIds = [...new Set((data as any[]).map(m => m.company_id).filter(Boolean))];
        supabase.from('projects').select('id, name').in('company_id', companyIds).order('name')
          .then(({ data: projs }) => {
            const list = projs ?? [];
            setProjects(list);
            setSelectedProject(list[0] ?? null);
          });
      });
  }, [user?.id]);

  const handleSubmit = async () => {
    if (!isValid || !selectedProject) return;
    setLoading(true); setError('');
    try {
      await api.createManualEntry({
        company_id:    companyId,
        project_id:    selectedProject.id,
        work_date:     workDate,
        clock_in:      `${workDate}T${clockIn}:00`,
        clock_out:     `${workDate}T${clockOut}:00`,
        user_timezone: userTimezone,
        manual_reason: reason,
        manual_note:   note        || undefined,
        description:   description || undefined,
      });
      navigate('/history');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to submit');
    } finally { setLoading(false); }
  };

  const inputStyle = {
    background: 'var(--color-surface-mid)',
    border: '1.5px solid var(--color-surface-high)',
    color: 'var(--color-text)',
  };

  return (
    <div className="flex-1 px-4 pt-6 pb-6 overflow-y-auto page-enter">

      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => navigate(-1)}
          className="w-9 h-9 flex items-center justify-center rounded-xl"
          style={{ background: 'var(--color-surface-mid)' }}>
          <ArrowLeft size={20} style={{ color: 'var(--color-text-muted)' }} />
        </button>
        <h1 className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>Manual Entry</h1>
      </div>

      {/* Approval notice */}
      <div className="flex items-start gap-3 rounded-xl px-4 py-3 mb-5"
        style={{ background: 'rgba(217,119,6,0.12)', border: '1px solid rgba(217,119,6,0.3)' }}>
        <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" style={{ color: '#FCD34D' }} />
        <p className="text-xs leading-relaxed" style={{ color: '#FCD34D' }}>
          Manual entries require <span className="font-semibold">manager approval</span> before they count toward your timesheet.
        </p>
      </div>

      <div className="space-y-4">

        {/* Project picker */}
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
            Project
          </label>
          <button
            onClick={() => setShowProjectPicker(true)}
            className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm"
            style={inputStyle}
          >
            <span style={{ color: selectedProject ? 'var(--color-text)' : 'var(--color-text-subtle)' }}>
              {selectedProject?.name ?? 'Select project…'}
            </span>
            <ChevronDown size={16} style={{ color: 'var(--color-text-subtle)' }} />
          </button>
        </div>

        {/* Date */}
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
            Work Date
          </label>
          <input type="date" value={workDate} max={today}
            onChange={(e) => setWorkDate(e.target.value)}
            className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none"
            style={inputStyle} />
        </div>

        {/* Time row */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-muted)' }}>Clock In</label>
            <input type="time" value={clockIn} onChange={(e) => setClockIn(e.target.value)}
              className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none" style={inputStyle} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-muted)' }}>Clock Out</label>
            <input type="time" value={clockOut} onChange={(e) => setClockOut(e.target.value)}
              className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none" style={inputStyle} />
          </div>
        </div>

        {/* Duration pill */}
        <div className="flex justify-center">
          {duration ? (
            <span className="flex items-center gap-1.5 text-sm font-semibold px-4 py-1.5 rounded-full"
              style={{ background: 'rgba(22,163,74,0.12)', color: 'var(--color-success)' }}>
              <Clock size={13} /> {duration}
            </span>
          ) : (
            <span className="text-xs px-4 py-1.5 rounded-full"
              style={{ background: 'rgba(220,38,38,0.1)', color: 'var(--color-error)' }}>
              Clock out must be after clock in
            </span>
          )}
        </div>

        {/* Reason */}
        <div>
          <label className="block text-xs font-medium mb-2" style={{ color: 'var(--color-text-muted)' }}>Reason</label>
          <div className="grid grid-cols-2 gap-2">
            {MANUAL_REASONS.map((r) => (
              <button key={r.value} onClick={() => setReason(r.value)}
                className="text-left px-3 py-3 rounded-xl text-sm transition-all"
                style={{
                  background: reason === r.value ? 'rgba(37,99,235,0.15)' : 'var(--color-surface-mid)',
                  border: `1.5px solid ${reason === r.value ? 'var(--color-primary)' : 'var(--color-surface-high)'}`,
                  color: reason === r.value ? '#93C5FD' : 'var(--color-text-muted)',
                  fontWeight: reason === r.value ? 600 : 400,
                }}>
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* Note */}
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
            Additional Note <span style={{ color: 'var(--color-text-subtle)' }}>(optional)</span>
          </label>
          <input value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="Explain further…"
            className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none" style={inputStyle} />
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
            Work Description <span style={{ color: 'var(--color-text-subtle)' }}>(optional)</span>
          </label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="What did you work on?" rows={3}
            className="w-full rounded-xl px-4 py-3 text-sm resize-none focus:outline-none" style={inputStyle} />
        </div>

        {error && (
          <div className="px-4 py-3 rounded-xl text-sm"
            style={{ background: 'rgba(220,38,38,0.1)', color: 'var(--color-error)' }}>
            {error}
          </div>
        )}

        <button onClick={handleSubmit} disabled={loading || !isValid}
          className="w-full flex items-center justify-center gap-2 rounded-2xl font-bold text-white text-base transition-all active:scale-[0.98] disabled:opacity-50"
          style={{ height: 56, background: 'var(--color-primary)' }}>
          {loading
            ? <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            : <><Clock size={18} /> Submit for Approval</>
          }
        </button>
      </div>

      {/* Project picker modal */}
      {showProjectPicker && (
        <div className="fixed inset-0 flex items-center justify-center px-6"
          style={{ zIndex: 60 }} onClick={() => setShowProjectPicker(false)}>
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.7)' }} />
          <div className="relative w-full rounded-2xl overflow-hidden"
            style={{ background: 'var(--color-surface-mid)', zIndex: 1 }}
            onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--color-surface-high)' }}>
              <h3 className="font-semibold" style={{ color: 'var(--color-text)' }}>Select Project</h3>
            </div>
            {projects.map(p => (
              <button key={p.id}
                onClick={() => { setSelectedProject(p); setShowProjectPicker(false); }}
                className="w-full flex items-center justify-between px-5 py-4"
                style={{ borderBottom: '1px solid var(--color-surface-high)', color: 'var(--color-text)' }}>
                <span className="text-sm font-medium">{p.name}</span>
                {selectedProject?.id === p.id && (
                  <span className="w-2 h-2 rounded-full" style={{ background: 'var(--color-primary)' }} />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
