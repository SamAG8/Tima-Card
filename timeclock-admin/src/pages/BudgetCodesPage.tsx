import { useEffect, useState } from 'react';
import { Tag, ChevronRight, ChevronDown, Plus, Search } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';

interface BudgetCode {
  id: string;
  code: string;
  name: string;
  category: string;
  division: string;
  is_active: boolean;
}

interface GroupedDivision {
  name: string;
  categories: {
    name: string;
    codes: BudgetCode[];
  }[];
}

export default function BudgetCodesPage() {
  const { companyId } = useAuth();
  const [codes,    setCodes]    = useState<BudgetCode[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    api.getBudgetCodes(companyId)
      .then(data => { setCodes(data as BudgetCode[]); })
      .finally(() => setLoading(false));
  }, [companyId]);

  const filtered = search.trim()
    ? codes.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.code.toLowerCase().includes(search.toLowerCase()) ||
        c.division.toLowerCase().includes(search.toLowerCase()) ||
        c.category.toLowerCase().includes(search.toLowerCase())
      )
    : codes;

  // Group by division → category
  const grouped: GroupedDivision[] = [];
  for (const code of filtered) {
    let div = grouped.find(d => d.name === code.division);
    if (!div) { div = { name: code.division, categories: [] }; grouped.push(div); }
    let cat = div.categories.find(c => c.name === code.category);
    if (!cat) { cat = { name: code.category, codes: [] }; div.categories.push(cat); }
    cat.codes.push(code);
  }

  const toggleDiv = (divName: string) => setExpanded(p => ({ ...p, [divName]: !p[divName] }));

  const inputStyle = { background: 'var(--color-surface-mid)', border: '1.5px solid var(--color-border-mid)', color: 'var(--color-text)' };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="p-8 pb-4">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>Budget Codes</h1>
          <button
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white"
            style={{ background: 'var(--color-primary)' }}
            onClick={() => alert('Add budget code — coming soon')}
          >
            <Plus size={14} /> Add Code
          </button>
        </div>
        <p className="text-sm mb-5" style={{ color: 'var(--color-text-muted)' }}>
          Manage the trade categories and codes used for tagging work entries.
        </p>

        {/* Stats */}
        <div className="flex gap-4 mb-5">
          {[
            { label: 'Divisions',   value: grouped.length },
            { label: 'Categories',  value: grouped.reduce((s, d) => s + d.categories.length, 0) },
            { label: 'Codes',       value: filtered.length },
          ].map(s => (
            <div key={s.label} className="px-4 py-3 rounded-xl" style={{ background: 'var(--color-surface-mid)', border: '1px solid var(--color-border)' }}>
              <p className="text-2xl font-bold tabular-nums" style={{ color: 'var(--color-text)' }}>{s.value}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-subtle)' }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--color-text-subtle)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search codes…"
            className="w-full rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none" style={inputStyle} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 pb-8">
        {loading ? (
          <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="skeleton h-14 rounded-xl" />)}</div>
        ) : grouped.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Tag size={40} style={{ color: 'var(--color-surface-high)' }} />
            <p className="text-sm" style={{ color: 'var(--color-text-subtle)' }}>No budget codes found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {grouped.map(div => {
              const isOpen = expanded[div.name] !== false; // open by default
              const totalCodes = div.categories.reduce((s, c) => s + c.codes.length, 0);
              return (
                <div key={div.name} className="rounded-xl overflow-hidden"
                  style={{ border: '1px solid var(--color-border-mid)', background: 'var(--color-surface)' }}>

                  {/* Division header */}
                  <button
                    onClick={() => toggleDiv(div.name)}
                    className="w-full flex items-center justify-between px-5 py-4 transition-colors"
                    style={{ borderBottom: isOpen ? '1px solid var(--color-border)' : 'none' }}
                  >
                    <div className="flex items-center gap-3">
                      {isOpen
                        ? <ChevronDown size={16} style={{ color: 'var(--color-text-subtle)' }} />
                        : <ChevronRight size={16} style={{ color: 'var(--color-text-subtle)' }} />
                      }
                      <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{div.name}</p>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full"
                      style={{ background: 'var(--color-surface-mid)', color: 'var(--color-text-subtle)' }}>
                      {totalCodes} codes
                    </span>
                  </button>

                  {/* Categories + Codes */}
                  {isOpen && (
                    <div>
                      {div.categories.map((cat, ci) => (
                        <div key={cat.name} style={{ borderBottom: ci < div.categories.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
                          <div className="px-5 py-2.5 flex items-center justify-between"
                            style={{ background: 'rgba(255,255,255,0.02)' }}>
                            <p className="text-xs font-semibold uppercase tracking-wider"
                              style={{ color: 'var(--color-text-muted)' }}>{cat.name}</p>
                            <span className="text-xs" style={{ color: 'var(--color-text-subtle)' }}>
                              {cat.codes.length} {cat.codes.length === 1 ? 'code' : 'codes'}
                            </span>
                          </div>
                          {cat.codes.map((code, ki) => (
                            <div key={code.id}
                              className="flex items-center justify-between px-5 py-3"
                              style={{ borderTop: '1px solid var(--color-border)' }}>
                              <div className="flex items-center gap-3">
                                <span className="text-xs font-mono px-2 py-0.5 rounded"
                                  style={{ background: 'var(--color-surface-mid)', color: 'var(--color-text-subtle)', border: '1px solid var(--color-border)' }}>
                                  {code.code}
                                </span>
                                <p className="text-sm" style={{ color: 'var(--color-text)' }}>{code.name}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full"
                                  style={{ background: code.is_active ? 'var(--color-success)' : 'var(--color-text-subtle)' }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
