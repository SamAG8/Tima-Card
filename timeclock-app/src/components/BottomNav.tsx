import { NavLink, useLocation } from 'react-router-dom';
import { Clock, History, Calendar, User } from 'lucide-react';
import { useAuth } from '../lib/auth';

const BASE_TABS = [
  { to: '/clock',   label: 'Clock',   icon: Clock,    requireLeave: false },
  { to: '/history', label: 'History', icon: History,  requireLeave: false },
  { to: '/leave',   label: 'Leave',   icon: Calendar, requireLeave: true  },
  { to: '/profile', label: 'Profile', icon: User,     requireLeave: false },
];

export default function BottomNav() {
  const location = useLocation();
  const { hasLeaveAccess } = useAuth();

  const tabs = BASE_TABS.filter(t => !t.requireLeave || hasLeaveAccess);

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 flex pb-safe"
      style={{
        background: 'rgba(10,10,10,0.95)',
        backdropFilter: 'blur(12px)',
        borderTop: '1px solid var(--color-border)',
        height: 'calc(60px + env(safe-area-inset-bottom))',
        zIndex: 50,
      }}
    >
      {tabs.map(({ to, label, icon: Icon }) => {
        const isActive = location.pathname === to;
        return (
          <NavLink
            key={to}
            to={to}
            className="flex-1 flex flex-col items-center justify-center gap-1"
            style={{ height: 60 }}
          >
            <Icon
              size={20}
              strokeWidth={isActive ? 2 : 1.5}
              style={{ color: isActive ? 'var(--color-text)' : 'var(--color-text-subtle)' }}
            />
            <span
              className="text-[10px] font-medium"
              style={{ color: isActive ? 'var(--color-text)' : 'var(--color-text-subtle)' }}
            >
              {label}
            </span>
          </NavLink>
        );
      })}
    </nav>
  );
}
