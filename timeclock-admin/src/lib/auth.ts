import { createContext, useContext } from 'react';
import type { User } from '@supabase/supabase-js';

interface AuthContextValue {
  user: User | null;
  companyId: string;
  setCompanyId: (id: string) => void;
  isSuperadmin: boolean;
  role: string;
  userId: string;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue>({
  user: null,
  companyId: '',
  setCompanyId: () => {},
  isSuperadmin: false,
  role: 'admin',
  userId: '',
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);
