import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, CheckCircle, XCircle, AlertCircle, Plus, Tag, FolderOpen } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';

interface Entry {
  id: string; work_date: string; clock_in: string; clock_out: string | null;
  user_timezone: string; status: string; entry_type: string;
  description: string | null; tags: string[]; project_id: string;
}

type Filter = 'ALL' | 'ACTIVE' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'ALL',       label: 'All'      },
  { key: 'SUBMITTED', label: 'Pending'  },
  { key: 'APPROVED',  label: 'Approved' },
  { key: 'REJECTED',  label: 'Rejected' },
  { key: 'ACTIVE',    label: 'Active'   },
];

const STATUS_CONFIG: Record<string, { label: string; icon: typeof Clock; color: string; bg: string }> = {
  ACTIVE:    { label: 'Active',    icon: Clock,        color: '#4ADE80', bg: 'rgba(74,222,128,0.12)' },
  SUBMITTED: { label: 'Pending',   icon: AlertCircle,  color: '#FCD34D', bg: 'rgba(252,211,77,0.12)' },
  APPROVED:  { label: 'Approved',  icon: CheckCircle,  color: '#60A5FA', bg: 'rgba(96,165,250,0.12)' },
  REJECTED:  { label: 'Rejected',  icon: XCircle,      color: '#F87171', bg: 'rgba(248,113,113,0.12)' },
};

function fmtTime(iso: string, tz: string) {
  return new Date(iso).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', timeZone: tz });
}

function fmtDuration(cin: string, cout: string | null) {
  if (!cout) return 'Active';
  const ms = new Date(cout).getTime() - new Date(cin).getTime();
  const h  = Math.floor(ms / 3600000);
  const m  = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

function fmtDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-CA', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl p-4 space-y-3" style={{ background: 'var(--color-surface-mid)' }}>
      <div className="skeleton h-4 w-32" />
      <div className="skeleton h-3 w-48" />
      <div className="skeleton h-3 w-24" />
    </div>
  );
}

export default function HistoryScreen() {
  const { companyId } = useAuth();
  const navigate      = useNavigate();
  const [entries,    setEntries]    = useState<Entry[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [filter,     setFilter]     = useState<Filter>('ALL');
  const [projectMap, setProjectMap] = useState<Record<string, string>>({});

  useEffect(() => {
    api.getMyEntries(companyId)
      .then(async (d) => {
        const data = d as Entry[];
        setEntries(data);

        // fetch project names
        const ids = [...new Set(data.map(e => e.project_id).filter(Boolean))];
        if (ids.length) {
          const { data: projs } = await supabase
            .from('projects')
            .select('id, name')
            .in('id', ids);
          const map: Record<string, string> = {};
          projs?.forEach(p => { map[p.id] = p.name; });
          setProjectMap(map);
        }
      })
      .finally(() => setLoading(false));
  }, [companyId]);

  const filtered = filter === 'ALL' ? entries : entries.filter(e => e.status === filter);

  return (
    <div className="flex-1 px-4 pt-6 pb-4 page-enter">

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>Time History</h1>
        <button
          onClick={() => navigate('/manual-entry')}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium"
          style={{ background: 'var(--color-primary)', color: '#fff' }}
        >
          <Plus size={15} /> Manual Entry
        </button>
      </div>

      {/* Filter pills */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-none">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all"
            style={{
              background: filter === f.key ? 'var(--color-primary)' : 'var(--color-surface-mid)',
              color:      filter === f.key ? '#fff'                  : 'var(--color-text-muted)',
              border:     `1px solid ${filter === f.key ? 'var(--color-primary)' : 'var(--color-surface-high)'}`,
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <SkeletonCard key={i} />)}</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Clock size={44} style={{ color: 'var(--color-surface-high)' }} />
          <p className="font-medium" style={{ color: 'var(--color-text-muted)' }}>No entries found</p>
          <p className="text-sm text-center" style={{ color: 'var(--color-text-subtle)' }}>
            {filter === 'ALL' ? 'Clock in to start tracking your time.' : 'No entries match this filter.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(entry => {
            const cfg  = STATUS_CONFIG[entry.status] ?? STATUS_CONFIG.SUBMITTED;
            const Icon = cfg.icon;
            const projectName = projectMap[entry.project_id];
            return (
              <div
                key={entry.id}
                className="rounded-2xl p-4 space-y-2"
                style={{
                  background:  'var(--color-surface-mid)',
                  border:      `1px solid var(--color-surface-high)`,
                  borderLeft:  entry.entry_type === 'MANUAL' ? '3px solid #FCD34D' : undefined,
                }}
              >
                {/* Row 1: date + status */}
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                    {fmtDate(entry.work_date)}
                  </span>
                  <span className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full"
                    style={{ color: cfg.color, background: cfg.bg }}>
                    <Icon size={11} />{cfg.label}
                  </span>
                </div>

                {/* Project name */}
                {projectName && (
                  <div className="flex items-center gap-1.5">
                    <FolderOpen size={11} style={{ color: 'var(--color-text-subtle)' }} />
                    <span className="text-xs" style={{ color: 'var(--color-text-subtle)' }}>
                      {projectName}
                    </span>
                  </div>
                )}

                {/* Row 2: times + duration */}
                <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>
                  <span>{entry.clock_in ? fmtTime(entry.clock_in, entry.user_timezone) : '--'}</span>
                  <span style={{ color: 'var(--color-surface-high)' }}>→</span>
                  <span>{entry.clock_out ? fmtTime(entry.clock_out, entry.user_timezone) : '--'}</span>
                  <span className="ml-auto font-semibold" style={{ color: 'var(--color-text)', fontFamily: "'JetBrains Mono', monospace" }}>
                    {entry.clock_in ? fmtDuration(entry.clock_in, entry.clock_out) : '--'}
                  </span>
                </div>

                {/* Description */}
                {entry.description && (
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-subtle)' }}>
                    {entry.description}
                  </p>
                )}

                {/* Tags */}
                {entry.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 items-center">
                    <Tag size={10} style={{ color: 'var(--color-text-subtle)' }} />
                    {entry.tags.map(tag => (
                      <span key={tag} className="text-xs px-2 py-0.5 rounded-full"
                        style={{ background: 'var(--color-surface-high)', color: 'var(--color-text-muted)' }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {entry.entry_type === 'MANUAL' && (
                  <span className="inline-block text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ background: 'rgba(252,211,77,0.12)', color: '#FCD34D' }}>
                    Manual Entry
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
