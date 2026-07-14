import { createContext, useContext } from 'react';
import type { User } from '@supabase/supabase-js';

interface AuthContextValue {
  user: User | null;
  companyId: string;
  role: string;
  userId: string;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue>({
  user: null,
  companyId: '',
  role: 'admin',
  userId: '',
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);
