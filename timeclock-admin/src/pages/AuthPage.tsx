import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Mail, Lock, Clock, Eye, EyeOff } from 'lucide-react';

export default function AuthPage() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const handleSignIn = async () => {
    if (!email.trim() || !password) return;
    setLoading(true);
    setError('');
    const { error: err } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (err) setError(err.message);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: 'var(--color-bg)' }}>
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="flex items-center gap-3 mb-10">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--color-primary)' }}>
            <Clock size={20} className="text-white" />
          </div>
          <div>
            <h1 className="font-bold text-lg" style={{ color: 'var(--color-text)' }}>Time Clock</h1>
            <p className="text-xs" style={{ color: 'var(--color-text-subtle)' }}>Admin Panel · Constralabs</p>
          </div>
        </div>

        <div className="rounded-2xl p-8 space-y-5"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-surface-mid)' }}>

          <div>
            <h2 className="font-semibold text-xl" style={{ color: 'var(--color-text)' }}>Sign in</h2>
            <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>Admin access only</p>
          </div>

          {/* Email */}
          <div className="relative">
            <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: 'var(--color-text-subtle)' }} />
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(''); }}
              onKeyDown={(e) => e.key === 'Enter' && handleSignIn()}
              placeholder="admin@company.com"
              className="w-full rounded-xl py-3 pl-9 pr-4 text-sm focus:outline-none transition-colors"
              style={{
                background: 'var(--color-surface-mid)',
                border: `1px solid ${error ? 'var(--color-error)' : 'var(--color-surface-high)'}`,
                color: 'var(--color-text)',
              }}
            />
          </div>

          {/* Password */}
          <div className="relative">
            <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: 'var(--color-text-subtle)' }} />
            <input
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
              onKeyDown={(e) => e.key === 'Enter' && handleSignIn()}
              placeholder="••••••••"
              autoComplete="current-password"
              className="w-full rounded-xl py-3 pl-9 pr-10 text-sm focus:outline-none transition-colors"
              style={{
                background: 'var(--color-surface-mid)',
                border: `1px solid ${error ? 'var(--color-error)' : 'var(--color-surface-high)'}`,
                color: 'var(--color-text)',
              }}
            />
            <button type="button" onClick={() => setShowPw(p => !p)}
              className="absolute right-3 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--color-text-subtle)' }}>
              {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          {error && <p className="text-sm" style={{ color: 'var(--color-error)' }}>{error}</p>}

          <button
            onClick={handleSignIn}
            disabled={loading || !email.trim() || !password}
            className="w-full font-semibold py-3 rounded-xl text-white text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: 'var(--color-primary)' }}
          >
            {loading
              ? <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Signing in…
                </span>
              : 'Sign In'
            }
          </button>
        </div>
      </div>
    </div>
  );
}
