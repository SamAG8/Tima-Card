import { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';

export default function AuthScreen() {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPw,   setShowPw]   = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => { emailRef.current?.focus(); }, []);

  const handleSignIn = async () => {
    if (!email.trim() || !password) return;
    setLoading(true); setError('');
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (err) setError(err.message);
  };

  const input = {
    background: 'var(--color-surface-mid)',
    border: '1px solid var(--color-border)',
    color: 'var(--color-text)',
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6"
      style={{ background: 'var(--color-bg)' }}>
      <div className="w-full max-w-sm page-enter">

        {/* Logo */}
        <div className="flex flex-col items-center mb-12">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-5"
            style={{ background: 'var(--color-surface-mid)', border: '1px solid var(--color-border)' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
          </div>
          <h1 className="text-xl font-semibold tracking-tight" style={{ color: 'var(--color-text)' }}>
            Time Clock
          </h1>
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-subtle)' }}>
            Constralabs
          </p>
        </div>

        <div className="space-y-3">
          {/* Email */}
          <div className="relative">
            <Mail size={14} className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: 'var(--color-text-subtle)' }} />
            <input ref={emailRef} type="email" inputMode="email" autoComplete="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(''); }}
              onKeyDown={(e) => e.key === 'Enter' && handleSignIn()}
              placeholder="you@company.com"
              className="w-full rounded-xl py-3.5 pl-10 pr-4 text-sm focus:outline-none transition-colors"
              style={{ ...input, ...(error ? { border: '1px solid var(--color-error)' } : {}) }}
            />
          </div>

          {/* Password */}
          <div className="relative">
            <Lock size={14} className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: 'var(--color-text-subtle)' }} />
            <input type={showPw ? 'text' : 'password'} autoComplete="current-password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
              onKeyDown={(e) => e.key === 'Enter' && handleSignIn()}
              placeholder="Password"
              className="w-full rounded-xl py-3.5 pl-10 pr-10 text-sm focus:outline-none transition-colors"
              style={{ ...input, ...(error ? { border: '1px solid var(--color-error)' } : {}) }}
            />
            <button type="button" onClick={() => setShowPw(p => !p)}
              className="absolute right-4 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--color-text-subtle)' }}>
              {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>

          {error && (
            <p className="text-xs px-1" style={{ color: 'var(--color-error)' }}>{error}</p>
          )}

          <button
            onClick={handleSignIn}
            disabled={loading || !email.trim() || !password}
            className="w-full flex items-center justify-center rounded-xl font-semibold text-sm transition-all active:scale-[0.98] disabled:opacity-40"
            style={{ height: 46, background: 'var(--color-text)', color: '#000' }}
          >
            {loading
              ? <span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
              : 'Sign In'
            }
          </button>
        </div>
      </div>
    </div>
  );
}
