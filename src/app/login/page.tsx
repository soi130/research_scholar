'use client';

import { useState } from 'react';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error || 'Unable to sign in.');
        return;
      }

      window.location.href = '/';
    } catch {
      setError('Unable to sign in.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)] flex items-center justify-center px-6">
      <div className="w-full max-w-md rounded-[2rem] border border-[color:var(--border)] bg-[var(--surface-strong)] shadow-2xl shadow-slate-200/30 p-8">
        <div className="space-y-3 mb-8">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-violet-600">Scholar.AI</p>
          <h1 className="text-3xl font-black tracking-tight">Shared Library Access</h1>
          <p className="text-sm text-slate-500">
            Enter the shared password for this local installation to continue.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block space-y-2">
            <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-2xl border border-[color:var(--border)] bg-[var(--surface-muted)] px-4 py-3 outline-none focus:border-violet-500/40 focus:ring-4 focus:ring-violet-500/10"
              placeholder="Shared password"
              autoFocus
            />
          </label>

          {error ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={loading || !password.trim()}
            className="w-full rounded-2xl bg-violet-600 px-4 py-3 text-sm font-black text-white shadow-lg shadow-violet-600/20 transition-all hover:bg-violet-700 disabled:opacity-50"
          >
            {loading ? 'Signing In...' : 'Enter Library'}
          </button>
        </form>
      </div>
    </main>
  );
}
