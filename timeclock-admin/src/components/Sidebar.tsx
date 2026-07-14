import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, CheckSquare, Users, Calendar,
  BarChart2, Settings, Clock, LogOut, Tag, Sun, Moon,
  PanelLeftClose, PanelLeftOpen,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAuth } from '../lib/auth';

const nav = [
  { to: '/dashboard',    label: 'Dashboard',    icon: LayoutDashboard },
  { to: '/approvals',    label: 'Approvals',    icon: CheckSquare     },
  { to: '/workers',      label: 'Employees',    icon: Users           },
  { to: '/budget-codes', label: 'Budget Codes', icon: Tag             },
  { to: '/leave',        label: 'Leave',        icon: Calendar        },
  { to: '/reports',      label: 'Reports',      icon: BarChart2       },
  { to: '/settings',     label: 'Settings',     icon: Settings        },
];

export default function Sidebar() {
  const { signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('tc-theme') as 'dark' | 'light') ?? 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('tc-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  const w = collapsed ? 56 : 240;

  const itemStyle = (isActive: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: collapsed ? 0 : 10,
    padding: collapsed ? '9px 0' : '8px 10px',
    justifyContent: collapsed ? 'center' : 'flex-start',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: isActive ? 500 : 400,
    color: isActive ? 'var(--color-text)' : 'var(--color-text-muted)',
    background: isActive ? 'var(--color-surface-mid)' : 'transparent',
    transition: 'background 120ms, color 120ms',
    textDecoration: 'none',
    width: '100%',
    cursor: 'pointer',
    border: 'none',
    outline: 'none',
  });

  return (
    <aside
      style={{
        width: w,
        minWidth: w,
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--color-surface)',
        borderRight: '1px solid var(--color-border)',
        transition: 'width 200ms cubic-bezier(0.4,0,0.2,1)',
        overflow: 'hidden',
      }}
    >
      {/* Logo */}
      <div
        style={{
          height: 56,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: collapsed ? '0 12px' : '0 14px',
          justifyContent: collapsed ? 'center' : 'flex-start',
          borderBottom: '1px solid var(--color-border)',
          flexShrink: 0,
        }}
      >
        <div style={{
          width: 28, height: 28,
          background: 'var(--color-primary)',
          borderRadius: 7,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Clock size={14} color="#fff" strokeWidth={2.5} />
        </div>
        {!collapsed && (
          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--color-text)', lineHeight: 1.3 }}>
              Time Clock
            </p>
            <p style={{ margin: 0, fontSize: 11, color: 'var(--color-text-subtle)', lineHeight: 1.3 }}>
              Admin Panel · Constralabs
            </p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '8px 8px', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
        {nav.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            title={collapsed ? label : undefined}
            style={({ isActive }) => itemStyle(isActive)}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLElement;
              if (!el.dataset.active) el.style.background = 'var(--color-surface-mid)';
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLElement;
              if (!el.dataset.active) el.style.background = 'transparent';
            }}
          >
            {({ isActive }) => (
              <>
                <Icon size={16} strokeWidth={isActive ? 2 : 1.75} style={{ flexShrink: 0 }} />
                {!collapsed && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bottom actions */}
      <div style={{ padding: '8px 8px', borderTop: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: 2 }}>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to Light' : 'Switch to Dark'}
          style={itemStyle(false)}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-mid)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          {theme === 'dark'
            ? <Sun size={16} strokeWidth={1.75} style={{ flexShrink: 0 }} />
            : <Moon size={16} strokeWidth={1.75} style={{ flexShrink: 0 }} />
          }
          {!collapsed && <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>}
        </button>

        {/* Collapse */}
        <button
          onClick={() => setCollapsed(v => !v)}
          title={collapsed ? 'Expand' : 'Collapse'}
          style={itemStyle(false)}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-mid)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          {collapsed
            ? <PanelLeftOpen size={16} strokeWidth={1.75} style={{ flexShrink: 0 }} />
            : <PanelLeftClose size={16} strokeWidth={1.75} style={{ flexShrink: 0 }} />
          }
          {!collapsed && <span>Collapse</span>}
        </button>

        {/* Sign out */}
        <button
          onClick={signOut}
          title={collapsed ? 'Sign Out' : undefined}
          style={itemStyle(false)}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'var(--color-surface-mid)';
            e.currentTarget.style.color = 'var(--color-error)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'var(--color-text-muted)';
          }}
        >
          <LogOut size={16} strokeWidth={1.75} style={{ flexShrink: 0 }} />
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>
    </aside>
  );
}
