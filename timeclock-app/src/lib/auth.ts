import { createContext, useContext } from 'react';
import type { User, Session } from '@supabase/supabase-js';

export interface AuthContextValue {
  user: User | null;
  session: Session | null;
  companyId: string;
  projectId: string;
  userTimezone: string;
  role: string;
  hasLeaveAccess: boolean;
  hasReportAccess: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue>({
  user: null,
  session: null,
  companyId: '',
  projectId: '',
  userTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  role: 'worker',
  hasLeaveAccess: false,
  hasReportAccess: false,
  loading: true,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);
