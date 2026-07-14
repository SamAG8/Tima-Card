import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Geolocation } from '@capacitor/geolocation';
import { MapPin, LogIn, LogOut, X, ChevronDown, Check, Clock, FolderOpen, AlertCircle, ChevronRight } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';

interface ActiveEntry { id: string; clock_in: string; project_id: string; user_timezone: string; }
interface Project     { id: string; name: string; latitude?: number | null; longitude?: number | null; dist?: number; }
interface HistoryEntry {
  id: string; clock_in: string; clock_out: string | null;
  project_id: string; project_name?: string; duration_minutes: number | null;
}
interface BudgetCode  { id: string; code: string; name: string; category: string; division: string; }

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatDate(): string {
  return new Date().toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function toLocalISO(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

const GEOFENCE_RADIUS_M = 500;

function useElapsed(startIso: string | null) {
  const [elapsed, setElapsed] = useState('00:00:00');
  useEffect(() => {
    if (!startIso) { setElapsed('00:00:00'); return; }
    const tick = () => {
      const ms = Date.now() - new Date(startIso).getTime();
      const h = Math.floor(ms / 3600000).toString().padStart(2, '0');
      const m = Math.floor((ms % 3600000) / 60000).toString().padStart(2, '0');
      const s = Math.floor((ms % 60000) / 1000).toString().padStart(2, '0');
      setElapsed(`${h}:${m}:${s}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startIso]);
  return elapsed;
}

// ─── iOS Drum Roller ─────────────────────────────────────────────────────────
const ITEM_H = 50;
const VISIBLE = 5;

function DrumColumn({
  items, selected, onChange,
}: { items: string[]; selected: string; onChange: (v: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const idx          = items.indexOf(selected);
  const startY       = useRef(0);
  const startScroll  = useRef(0);
  const isDragging   = useRef(false);
  const velocity     = useRef(0);
  const lastY        = useRef(0);
  const lastT        = useRef(0);
  const rafId        = useRef(0);

  const scrollTo = useCallback((i: number, smooth = false) => {
    const el = containerRef.current;
    if (!el) return;
    if (smooth) {
      el.scrollTo({ top: i * ITEM_H, behavior: 'smooth' });
    } else {
      el.scrollTop = i * ITEM_H;
    }
  }, []);

  useEffect(() => { scrollTo(idx < 0 ? 0 : idx); }, [selected]); // eslint-disable-line

  const snapToNearest = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const newIdx = Math.round(el.scrollTop / ITEM_H);
    const clamped = Math.max(0, Math.min(items.length - 1, newIdx));
    scrollTo(clamped, true);
    if (items[clamped] !== selected) onChange(items[clamped]);
  }, [items, selected, onChange, scrollTo]);

  const onTouchStart = (e: React.TouchEvent) => {
    cancelAnimationFrame(rafId.current);
    isDragging.current  = true;
    startY.current      = e.touches[0].clientY;
    lastY.current       = e.touches[0].clientY;
    lastT.current       = Date.now();
    velocity.current    = 0;
    startScroll.current = containerRef.current?.scrollTop ?? 0;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
    const el = containerRef.current;
    if (!el) return;
    const dy = startY.current - e.touches[0].clientY;
    el.scrollTop = startScroll.current + dy;

    const now = Date.now();
    const dt  = now - lastT.current;
    if (dt > 0) velocity.current = (lastY.current - e.touches[0].clientY) / dt;
    lastY.current = e.touches[0].clientY;
    lastT.current = now;
  };

  const onTouchEnd = () => {
    isDragging.current = false;
    const el = containerRef.current;
    if (!el) return;

    // momentum flick
    let v = velocity.current * 15;
    const decay = 0.92;
    const animate = () => {
      el.scrollTop += v;
      v *= decay;
      if (Math.abs(v) > 0.5) {
        rafId.current = requestAnimationFrame(animate);
      } else {
        snapToNearest();
      }
    };
    rafId.current = requestAnimationFrame(animate);
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const cur = items.indexOf(selected);
    const newIdx = Math.max(0, Math.min(items.length - 1, cur + (e.deltaY > 0 ? 1 : -1)));
    onChange(items[newIdx]);
    scrollTo(newIdx, true);
  };

  const BG = '#1C1C1E'; // iOS dark sheet color

  return (
    <div style={{ position: 'relative', width: 96, height: ITEM_H * VISIBLE, overflow: 'hidden', background: BG }}>
      {/* selection lines — exact iOS style */}
      <div style={{
        position: 'absolute', top: ITEM_H * 2, left: 0, right: 0, height: ITEM_H,
        borderTop: '0.5px solid rgba(255,255,255,0.25)',
        borderBottom: '0.5px solid rgba(255,255,255,0.25)',
        pointerEvents: 'none', zIndex: 2,
      }} />
      {/* fade top */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: ITEM_H * 2,
        background: `linear-gradient(to bottom, ${BG} 5%, rgba(28,28,30,0.6) 100%)`,
        pointerEvents: 'none', zIndex: 3,
      }} />
      {/* fade bottom */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: ITEM_H * 2,
        background: `linear-gradient(to top, ${BG} 5%, rgba(28,28,30,0.6) 100%)`,
        pointerEvents: 'none', zIndex: 3,
      }} />

      <div
        ref={containerRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onWheel={onWheel}
        style={{
          height: '100%', overflowY: 'scroll',
          scrollbarWidth: 'none', msOverflowStyle: 'none',
          paddingTop: ITEM_H * 2, paddingBottom: ITEM_H * 2,
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {items.map(item => {
          const isSelected = item === selected;
          return (
            <div
              key={item}
              style={{
                height: ITEM_H,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: isSelected ? 28 : 22,
                fontWeight: isSelected ? 400 : 300,
                color: isSelected ? '#FFFFFF' : 'rgba(255,255,255,0.35)',
                transition: 'font-size 0.12s ease, color 0.12s ease',
                fontVariantNumeric: 'tabular-nums',
                fontFamily: "-apple-system, 'SF Pro Text', 'Helvetica Neue', sans-serif",
                letterSpacing: 1,
                userSelect: 'none',
              }}
            >
              {item}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function IosTimePicker({ value, onChange, maxDate }: { value: Date; onChange: (d: Date) => void; maxDate: Date }) {
  const hours   = useMemo(() => Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')), []);
  const minutes = useMemo(() => Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')), []);

  const hStr = String(value.getHours()).padStart(2, '0');
  const mStr = String(value.getMinutes()).padStart(2, '0');

  const setH = (h: string) => {
    const d = new Date(value); d.setHours(parseInt(h));
    if (d > maxDate) d.setTime(maxDate.getTime());
    onChange(d);
  };
  const setM = (m: string) => {
    const d = new Date(value); d.setMinutes(parseInt(m));
    if (d > maxDate) d.setTime(maxDate.getTime());
    onChange(d);
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#1C1C1E', borderRadius: 14, overflow: 'hidden',
    }}>
      <DrumColumn items={hours}   selected={hStr} onChange={setH} />
      <span style={{
        color: '#FFFFFF', fontSize: 28, fontWeight: 300,
        fontFamily: "-apple-system, 'SF Pro Text', sans-serif",
        marginBottom: 2, paddingBottom: 2, userSelect: 'none',
      }}>:</span>
      <DrumColumn items={minutes} selected={mStr} onChange={setM} />
    </div>
  );
}

// ─── Time Adjustment Popup ────────────────────────────────────────────────────
interface TimeAdjustPopupProps {
  type: 'clock_in' | 'clock_out';
  actualTime: Date;
  onConfirm: (time: Date, isAdjusted: boolean) => void;
  onCancel: () => void;
}

function TimeAdjustPopup({ type, actualTime, onConfirm, onCancel }: TimeAdjustPopupProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [pickedTime, setPickedTime] = useState(actualTime);
  const label = type === 'clock_in' ? 'Clock In' : 'Clock Out';
  const adjustLabel = type === 'clock_in' ? 'Adjust Clock In Time' : 'Adjust Clock Out Time';

  return (
    <div className="fixed inset-0 flex items-end justify-center" style={{ zIndex: 70 }}>
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.75)' }} onClick={onCancel} />
      <div
        className="relative w-full rounded-t-3xl"
        style={{ background: 'var(--color-surface-mid)', border: '1px solid var(--color-border-mid)', paddingBottom: 'env(safe-area-inset-bottom, 16px)' }}
      >
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10, paddingBottom: 4 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.2)' }} />
        </div>

        <div className="px-5 pb-4">
          <h3 className="text-base font-semibold mb-0.5 text-center" style={{ color: 'var(--color-text)' }}>
            Confirm {label} Time
          </h3>
          <p className="text-xs text-center mb-5" style={{ color: 'var(--color-text-subtle)' }}>
            {type === 'clock_in' ? 'Did you start' : 'Did you finish'} at{' '}
            <strong style={{ color: 'var(--color-text)' }}>{formatTime(actualTime.toISOString())}</strong>?
          </p>

          {/* Confirm button */}
          <button
            onClick={() => onConfirm(actualTime, false)}
            className="w-full py-3.5 rounded-2xl text-sm font-semibold mb-3"
            style={{ background: 'var(--color-text)', color: '#000' }}
          >
            Yes, {formatTime(actualTime.toISOString())}
          </button>

          {/* Adjust link */}
          <button
            onClick={() => setShowPicker(v => !v)}
            className="w-full py-2 text-sm text-center"
            style={{ color: 'var(--color-primary)', textDecoration: 'underline', textUnderlineOffset: 3 }}
          >
            {adjustLabel}
          </button>

          {/* iOS drum roller */}
          {showPicker && (
            <div className="mt-3 mb-2">
              <div className="rounded-2xl overflow-hidden">
                <IosTimePicker value={pickedTime} onChange={setPickedTime} maxDate={actualTime} />
              </div>
              <p className="text-xs mt-2 text-center" style={{ color: 'var(--color-text-subtle)' }}>
                Your manager will review and approve this adjustment.
              </p>
              <button
                onClick={() => onConfirm(pickedTime, true)}
                className="w-full py-3.5 rounded-2xl text-sm font-semibold mt-3"
                style={{ background: 'var(--color-primary)', color: '#fff' }}
              >
                Submit Adjustment Request
              </button>
            </div>
          )}

          {/* Cancel */}
          <button
            onClick={onCancel}
            className="w-full py-3 rounded-2xl text-sm font-medium mt-2"
            style={{ background: 'var(--color-surface-high)', border: '1px solid var(--color-border)', color: 'var(--color-text-subtle)' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Budget Code Picker ───────────────────────────────────────────────────────
interface BudgetCodePickerProps {
  codes: BudgetCode[];
  selected: BudgetCode | null;
  onSelect: (code: BudgetCode) => void;
  onClose: () => void;
}

function BudgetCodePicker({ codes, selected, onSelect, onClose }: BudgetCodePickerProps) {
  const [search, setSearch] = useState('');
  const divisions = [...new Set(codes.map(c => c.division))];

  const filtered = search.trim()
    ? codes.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.code.toLowerCase().includes(search.toLowerCase()) ||
        c.division.toLowerCase().includes(search.toLowerCase())
      )
    : codes;

  const groupedByDivision = divisions.reduce<Record<string, BudgetCode[]>>((acc, div) => {
    const items = filtered.filter(c => c.division === div);
    if (items.length) acc[div] = items;
    return acc;
  }, {});

  return (
    <div className="fixed inset-0" style={{ zIndex: 70 }} onClick={onClose}>
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.8)' }} />
      <div
        className="absolute bottom-0 left-0 right-0 rounded-t-2xl"
        style={{ background: 'var(--color-surface-mid)', border: '1px solid var(--color-border-mid)', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full" style={{ background: 'var(--color-border-mid)' }} />
        </div>

        <div className="px-5 pt-2 pb-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>Select Budget Code</h3>
            <button onClick={onClose}><X size={18} style={{ color: 'var(--color-text-subtle)' }} /></button>
          </div>
          <input
            type="text"
            placeholder="Search codes…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
            className="w-full rounded-xl px-4 py-2.5 text-sm focus:outline-none"
            style={{ background: 'var(--color-surface-high)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
          />
        </div>

        <div className="overflow-y-auto flex-1">
          {Object.entries(groupedByDivision).map(([division, items]) => (
            <div key={division}>
              <p className="px-5 py-2 text-xs font-semibold uppercase tracking-widest"
                style={{ color: 'var(--color-text-subtle)', background: 'var(--color-bg)' }}>
                {division}
              </p>
              {items.map(code => (
                <button
                  key={code.id}
                  onClick={() => { onSelect(code); onClose(); }}
                  className="w-full flex items-center justify-between px-5 py-3.5 transition-colors"
                  style={{ borderBottom: '1px solid var(--color-border)' }}
                >
                  <div className="text-left">
                    <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{code.name}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-subtle)' }}>
                      {code.code} · {code.category}
                    </p>
                  </div>
                  {selected?.id === code.id && (
                    <Check size={14} style={{ color: 'var(--color-text)' }} />
                  )}
                </button>
              ))}
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="text-sm text-center py-8" style={{ color: 'var(--color-text-subtle)' }}>
              No codes found
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function ClockScreen() {
  const { companyId, projectId: defaultProjectId, userTimezone, user } = useAuth();

  const [activeEntry,       setActiveEntry]       = useState<ActiveEntry | null>(null);
  const [loading,           setLoading]           = useState(true);
  const [actionLoading,     setActionLoading]      = useState(false);
  const [description,       setDescription]       = useState('');
  const [error,             setError]             = useState('');
  const [projects,          setProjects]          = useState<Project[]>([]);
  const [selectedProject,   setSelectedProject]   = useState<Project | null>(null);
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [todayHistory,      setTodayHistory]      = useState<HistoryEntry[]>([]);
  const [nearbyProject,     setNearbyProject]     = useState<Project | null | undefined>(undefined);
  const [showClockOutSheet, setShowClockOutSheet] = useState(false);
  const [aiSummary,         setAiSummary]         = useState<string | null>(null);
  const [aiLoading,         setAiLoading]         = useState(false);

  // Budget codes
  const [budgetCodes,       setBudgetCodes]       = useState<BudgetCode[]>([]);
  const [selectedCode,      setSelectedCode]      = useState<BudgetCode | null>(null);
  const [showCodePicker,    setShowCodePicker]    = useState(false);

  // Time adjustment
  const [showAdjustPopup,   setShowAdjustPopup]   = useState(false);
  const [adjustType,        setAdjustType]        = useState<'clock_in' | 'clock_out'>('clock_in');
  const [adjustActualTime,  setAdjustActualTime]  = useState<Date>(new Date());
  const pendingAction = useRef<((time: Date, isAdjusted: boolean) => void) | null>(null);

  const sheetRef = useRef<HTMLDivElement>(null);
  const elapsed = useElapsed(activeEntry?.clock_in ?? null);

  const fetchActive = useCallback(async () => {
    try {
      const res = await api.getActiveEntry(companyId) as { clocked_in: boolean; entry: ActiveEntry | null };
      setActiveEntry(res.clocked_in ? res.entry : null);
    } finally { setLoading(false); }
  }, [companyId]);

  const fetchTodayHistory = useCallback(async () => {
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await supabase
      .schema('time_clock')
      .from('time_entries')
      .select('id, clock_in, clock_out, project_id, duration_minutes')
      .eq('user_id', user?.id)
      .eq('work_date', today)
      .neq('status', 'ACTIVE')
      .order('clock_in', { ascending: false });

    if (!data?.length) { setTodayHistory([]); return; }
    const projectIds = [...new Set(data.map(e => e.project_id))];
    const { data: projs } = await supabase.from('projects').select('id, name').in('id', projectIds);
    const projMap: Record<string, string> = {};
    projs?.forEach(p => { projMap[p.id] = p.name; });
    setTodayHistory(data.map(e => ({ ...e, project_name: projMap[e.project_id] ?? '' })));
  }, [user?.id]);

  useEffect(() => {
    fetchActive();
    fetchTodayHistory();
    api.getBudgetCodes(companyId).then(codes => setBudgetCodes(codes as BudgetCode[]));
  }, [fetchActive, fetchTodayHistory, companyId]);

  useEffect(() => {
    if (!user?.id) return;
    supabase.from('memberships').select('company_id').eq('user_id', user.id)
      .then(async ({ data }) => {
        if (!data?.length) return;
        const companyIds = [...new Set(data.map((m: any) => m.company_id).filter(Boolean))];
        const { data: projs } = await supabase
          .from('projects').select('id, name, latitude, longitude')
          .in('company_id', companyIds).order('name');
        const list: Project[] = projs ?? [];
        if (!list.length) return;
        try {
          const pos = await Geolocation.getCurrentPosition({ timeout: 6000 });
          const { latitude: uLat, longitude: uLon } = pos.coords;
          const withDist = list.map(p => ({
            ...p,
            dist: p.latitude && p.longitude ? distanceMeters(uLat, uLon, p.latitude, p.longitude) : Infinity,
          }));
          withDist.sort((a, b) => (a.dist ?? Infinity) - (b.dist ?? Infinity));
          const nearest = withDist[0];
          setProjects(withDist);
          setNearbyProject((nearest.dist ?? Infinity) <= GEOFENCE_RADIUS_M ? nearest : null);
          setSelectedProject(nearest);
        } catch {
          setProjects(list);
          setNearbyProject(undefined);
          setSelectedProject(list[0]);
        }
      });
  }, [user?.id, defaultProjectId]);

  const getPosition = async () => {
    try {
      const pos = await Geolocation.getCurrentPosition({ timeout: 8000 });
      return { lat: pos.coords.latitude, lng: pos.coords.longitude };
    } catch { return { lat: undefined, lng: undefined }; }
  };

  // ── Clock In ────────────────────────────────────────────────────────────────
  const handleClockInPress = () => {
    const now = new Date();
    setAdjustType('clock_in');
    setAdjustActualTime(now);
    pendingAction.current = async (time: Date, isAdjusted: boolean) => {
      setShowAdjustPopup(false);
      setActionLoading(true); setError('');
      try {
        const { lat, lng } = await getPosition();
        await api.clockIn({
          company_id: companyId,
          project_id: selectedProject?.id ?? defaultProjectId,
          user_timezone: userTimezone,
          lat, lng,
        });
        // If adjusted, submit adjustment request after entry is created
        if (isAdjusted) {
          await fetchActive().then(async () => {
            // we'll handle adjustment after entry is live — for now just note it
            // full flow: entry is created at actual now(), then adjustment request is submitted
          });
        }
        await fetchActive();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to clock in');
      } finally { setActionLoading(false); }
    };
    setShowAdjustPopup(true);
  };

  // ── Clock Out ───────────────────────────────────────────────────────────────
  const handleClockOutPress = () => {
    setDescription(''); setSelectedCode(null); setAiSummary(null);
    setShowClockOutSheet(true);
  };

  const handleAnalyze = async () => {
    if (!description.trim()) return;
    setAiLoading(true);
    try {
      const projectName = projects.find(p => p.id === activeEntry?.project_id)?.name;
      const elapsed_ms  = activeEntry ? Date.now() - new Date(activeEntry.clock_in).getTime() : 0;
      const result = await api.analyzeWork({
        description,
        company_id: companyId,
        project_name: projectName,
        duration_minutes: Math.round(elapsed_ms / 60000),
      });
      setAiSummary(result.summary ?? null);
      // Auto-select budget code returned by AI
      if (result.budget_code_id && budgetCodes.length) {
        const match = budgetCodes.find(c => c.id === result.budget_code_id);
        if (match && !selectedCode) setSelectedCode(match);
      }
    } catch { /* silent */ } finally { setAiLoading(false); }
  };

  const handleConfirmClockOut = async () => {
    const now = new Date();
    setAdjustType('clock_out');
    setAdjustActualTime(now);
    pendingAction.current = async (time: Date, isAdjusted: boolean) => {
      setShowAdjustPopup(false);
      setActionLoading(true); setError('');
      try {
        const { lat, lng } = await getPosition();
        await api.clockOut({
          company_id: companyId,
          description,
          budget_code_id: selectedCode?.id,
          ai_summary: aiSummary ?? undefined,
          tags: selectedCode ? [selectedCode.code] : [],
          lat, lng,
        });
        if (isAdjusted && activeEntry) {
          await api.requestTimeAdjustment({
            company_id: companyId,
            time_entry_id: activeEntry.id,
            adjustment_type: 'CLOCK_OUT',
            original_clock_out: now.toISOString(),
            requested_clock_out: time.toISOString(),
            reason: 'Worker adjusted clock-out time',
          });
        }
        setActiveEntry(null); setDescription(''); setSelectedCode(null); setAiSummary(null);
        setShowClockOutSheet(false);
        await fetchTodayHistory();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to clock out');
      } finally { setActionLoading(false); }
    };
    setShowAdjustPopup(true);
  };

  const activeProjectName = projects.find(p => p.id === activeEntry?.project_id)?.name;
  const firstName = user?.user_metadata?.full_name?.split(' ')[0] ?? '';

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
          style={{ borderColor: 'var(--color-text-subtle)', borderTopColor: 'transparent' }} />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col px-5 pt-8 pb-4 overflow-y-auto page-enter"
      style={{ background: 'var(--color-bg)' }}>

      {/* Greeting */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--color-text)' }}>
          {greeting()}{firstName ? `, ${firstName}` : ''} 👋
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--color-text-subtle)' }}>
          {formatDate()}
        </p>
      </div>

      {/* Center block */}
      <div className="flex-1 flex flex-col items-center justify-center w-full">

        {/* Clock ring */}
        <div className="flex flex-col items-center mb-6">
          <div
            className={`w-56 h-56 rounded-full flex flex-col items-center justify-center transition-all duration-700 ${activeEntry ? 'animate-clock-pulse' : ''}`}
            style={{
              border: `1.5px ${activeEntry ? 'solid' : 'dashed'} ${activeEntry ? 'var(--color-success)' : 'var(--color-border-mid)'}`,
              background: activeEntry ? 'rgba(34,197,94,0.04)' : 'var(--color-surface-mid)',
            }}
          >
            {activeEntry ? (
              <>
                <span className="text-4xl font-bold tabular-nums tracking-tight"
                  style={{ fontFamily: "'JetBrains Mono', monospace", color: 'var(--color-text)' }}>
                  {elapsed}
                </span>
                <span className="text-xs mt-2 flex items-center gap-1 font-medium"
                  style={{ color: 'var(--color-success)' }}>
                  <MapPin size={10} /> {activeProjectName ?? 'Clocked in'}
                </span>
              </>
            ) : (
              <>
                <span className="text-3xl font-bold tabular-nums opacity-20"
                  style={{ fontFamily: "'JetBrains Mono', monospace", color: 'var(--color-text)' }}>
                  --:--:--
                </span>
                <span className="text-xs mt-2" style={{ color: 'var(--color-text-subtle)' }}>
                  Not clocked in
                </span>
              </>
            )}
          </div>
        </div>

        {/* Project selector */}
        {!activeEntry && (
          <div className="w-full mb-3 space-y-2">
            <button
              onClick={() => setShowProjectPicker(true)}
              className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl transition-colors"
              style={{ background: 'var(--color-surface-mid)', border: '1px solid var(--color-border)' }}
            >
              <div className="flex items-center gap-2.5">
                <FolderOpen size={14} style={{ color: 'var(--color-text-subtle)' }} />
                <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                  {selectedProject?.name ?? 'Select Project'}
                </span>
              </div>
              <ChevronDown size={14} style={{ color: 'var(--color-text-subtle)' }} />
            </button>

            {nearbyProject === undefined && (
              <p className="text-xs text-center" style={{ color: 'var(--color-text-subtle)' }}>
                Detecting location…
              </p>
            )}
            {nearbyProject != null && (
              <div className="flex items-center justify-center gap-1.5">
                <MapPin size={11} style={{ color: 'var(--color-text-subtle)' }} />
                <p className="text-xs" style={{ color: 'var(--color-text-subtle)' }}>
                  {nearbyProject.name} · {nearbyProject.dist != null ? `${Math.round(nearbyProject.dist)}m` : ''}
                </p>
              </div>
            )}
            {nearbyProject === null && (
              <div className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg"
                style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
                <AlertCircle size={12} style={{ color: 'var(--color-error)' }} />
                <p className="text-xs" style={{ color: 'var(--color-error)' }}>
                  You are not near any project site
                </p>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="w-full mb-3 px-4 py-3 rounded-xl text-sm"
            style={{ background: 'rgba(239,68,68,0.08)', color: 'var(--color-error)', border: '1px solid rgba(239,68,68,0.15)' }}>
            {error}
          </div>
        )}

        {/* Main CTA */}
        <button
          onClick={activeEntry ? handleClockOutPress : handleClockInPress}
          disabled={actionLoading}
          className="w-full flex items-center justify-center gap-2.5 rounded-2xl font-semibold text-sm transition-all active:scale-[0.98] disabled:opacity-40"
          style={{ height: 54, background: activeEntry ? 'var(--color-error)' : 'var(--color-text)', color: activeEntry ? '#fff' : '#000' }}
        >
          {actionLoading
            ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            : activeEntry
              ? <><LogOut size={17} /> Clock Out</>
              : <><LogIn  size={17} /> Clock In</>
          }
        </button>

      </div>

      {/* Today's entries */}
      {todayHistory.length > 0 && (
        <div className="w-full mt-8">
          <p className="text-xs font-medium uppercase tracking-widest mb-3"
            style={{ color: 'var(--color-text-subtle)' }}>
            Today
          </p>
          <div className="space-y-2">
            {todayHistory.map(entry => (
              <div key={entry.id}
                className="flex items-center justify-between px-4 py-3 rounded-xl"
                style={{ background: 'var(--color-surface-mid)', border: '1px solid var(--color-border)' }}>
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center"
                    style={{ background: 'rgba(34,197,94,0.08)' }}>
                    <Clock size={12} style={{ color: 'var(--color-success)' }} />
                  </div>
                  <div>
                    <p className="text-xs font-medium" style={{ color: 'var(--color-text)' }}>
                      {entry.project_name}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-subtle)' }}>
                      {formatTime(entry.clock_in)} → {entry.clock_out ? formatTime(entry.clock_out) : '…'}
                    </p>
                  </div>
                </div>
                {entry.duration_minutes != null && (
                  <span className="text-xs font-semibold"
                    style={{ fontFamily: "'JetBrains Mono', monospace", color: 'var(--color-text-muted)' }}>
                    {formatDuration(entry.duration_minutes)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Clock Out Sheet ──────────────────────────────────────────────────── */}
      {showClockOutSheet && (
        <div className="fixed inset-0" style={{ zIndex: 60 }} onClick={() => setShowClockOutSheet(false)}>
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.75)' }} />
          <div
            className="absolute bottom-0 left-0 right-0 rounded-t-2xl sheet-enter"
            style={{ background: 'var(--color-surface-mid)', border: '1px solid var(--color-border-mid)', maxHeight: '85vh' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full" style={{ background: 'var(--color-border-mid)' }} />
            </div>

            <div className="px-5 pb-2 pt-2 overflow-y-auto" style={{ maxHeight: 'calc(85vh - 40px)' }}>
              <h3 className="text-base font-semibold mb-4" style={{ color: 'var(--color-text)' }}>Clock Out</h3>

              {/* Description */}
              <div className="mb-3">
                <label className="block text-xs font-medium mb-2" style={{ color: 'var(--color-text-subtle)' }}>
                  What did you work on?
                </label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Describe your work today…"
                  rows={3}
                  autoFocus
                  className="w-full rounded-xl px-4 py-3 text-sm resize-none focus:outline-none"
                  style={{ background: 'var(--color-surface-high)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
                />
              </div>

              {/* AI analyze button */}
              <button
                onClick={handleAnalyze}
                disabled={aiLoading || !description.trim()}
                className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-medium mb-4 transition-all disabled:opacity-40"
                style={{ background: 'var(--color-surface-high)', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}
              >
                {aiLoading ? (
                  <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
                  </svg>
                )}
                {aiLoading ? 'Analyzing…' : 'Suggest budget code with AI'}
              </button>

              {/* AI summary */}
              {aiSummary && (
                <div className="mb-4 px-3 py-2.5 rounded-xl text-xs"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--color-border)', color: 'var(--color-text-subtle)' }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>AI summary: </span>{aiSummary}
                </div>
              )}

              {/* Budget Code picker */}
              <div className="mb-5">
                <label className="block text-xs font-medium mb-2" style={{ color: 'var(--color-text-subtle)' }}>
                  Budget Code
                </label>
                <button
                  onClick={() => setShowCodePicker(true)}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-xl transition-colors"
                  style={{ background: 'var(--color-surface-high)', border: '1px solid var(--color-border)' }}
                >
                  {selectedCode ? (
                    <div className="text-left">
                      <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{selectedCode.name}</p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-subtle)' }}>
                        {selectedCode.code} · {selectedCode.division}
                      </p>
                    </div>
                  ) : (
                    <span className="text-sm" style={{ color: 'var(--color-text-subtle)' }}>Select budget code…</span>
                  )}
                  <ChevronRight size={14} style={{ color: 'var(--color-text-subtle)' }} />
                </button>
              </div>

              {error && (
                <div className="mb-4 px-4 py-2 rounded-xl text-xs"
                  style={{ background: 'rgba(239,68,68,0.08)', color: 'var(--color-error)' }}>
                  {error}
                </div>
              )}

              {/* Submit */}
              <button
                onClick={handleConfirmClockOut}
                disabled={actionLoading}
                className="w-full flex items-center justify-center gap-2 rounded-2xl font-semibold text-sm transition-all active:scale-[0.98] disabled:opacity-40 mb-safe"
                style={{ height: 52, background: 'var(--color-error)', color: '#fff' }}
              >
                {actionLoading
                  ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <><LogOut size={16} /> Confirm Clock Out</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Budget Code Picker ───────────────────────────────────────────────── */}
      {showCodePicker && (
        <BudgetCodePicker
          codes={budgetCodes}
          selected={selectedCode}
          onSelect={setSelectedCode}
          onClose={() => setShowCodePicker(false)}
        />
      )}

      {/* ── Time Adjustment Popup ────────────────────────────────────────────── */}
      {showAdjustPopup && (
        <TimeAdjustPopup
          type={adjustType}
          actualTime={adjustActualTime}
          onConfirm={(time, isAdjusted) => pendingAction.current?.(time, isAdjusted)}
          onCancel={() => setShowAdjustPopup(false)}
        />
      )}

      {/* ── Project Picker Modal ─────────────────────────────────────────────── */}
      {showProjectPicker && (
        <div className="fixed inset-0 flex items-center justify-center px-5"
          style={{ zIndex: 60 }} onClick={() => setShowProjectPicker(false)}>
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.8)' }} />
          <div ref={sheetRef}
            className="relative w-full rounded-2xl overflow-hidden"
            style={{ background: 'var(--color-surface-mid)', border: '1px solid var(--color-border-mid)', zIndex: 1 }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4"
              style={{ borderBottom: '1px solid var(--color-border)' }}>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>Select Project</h3>
              <button onClick={() => setShowProjectPicker(false)}>
                <X size={18} style={{ color: 'var(--color-text-subtle)' }} />
              </button>
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: '60vh' }}>
              {projects.map((p: any) => {
                const isNear = p.dist !== undefined && p.dist <= GEOFENCE_RADIUS_M;
                const distLabel = !p.dist || p.dist === Infinity ? null
                  : p.dist < 1000 ? `${Math.round(p.dist)}m`
                  : `${(p.dist / 1000).toFixed(1)}km`;
                return (
                  <button key={p.id}
                    onClick={() => { setSelectedProject(p); setShowProjectPicker(false); }}
                    className="w-full flex items-center justify-between px-5 py-3.5 transition-colors"
                    style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <div className="flex items-center gap-3">
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ background: isNear ? 'var(--color-success)' : 'var(--color-border-mid)' }} />
                      <div className="text-left">
                        <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{p.name}</p>
                        {distLabel && (
                          <p className="text-xs mt-0.5" style={{ color: isNear ? 'var(--color-success)' : 'var(--color-text-subtle)' }}>
                            {distLabel} away
                          </p>
                        )}
                      </div>
                    </div>
                    {selectedProject?.id === p.id && (
                      <Check size={14} style={{ color: 'var(--color-text)' }} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
