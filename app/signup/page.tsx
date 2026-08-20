'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Signup failed');
        setLoading(false);
        return;
      }
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Signup failed');
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-ink-50 flex flex-col">
      <nav className="p-6">
        <Link href="/" className="flex items-center gap-2 w-fit">
          <div className="w-8 h-8 rounded-lg bg-ink-950 flex items-center justify-center text-white font-bold text-sm">G4</div>
          <span className="font-semibold text-ink-950">GA4Fix</span>
        </Link>
      </nav>
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl border border-ink-200 p-8 shadow-sm">
            <h1 className="text-2xl font-bold text-ink-950 mb-2">Create your account</h1>
            <p className="text-sm text-ink-500 mb-6">Start monitoring your first site in under a minute.</p>

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
                {error}
              </div>
            )}

            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-ink-600 mb-1">Name (optional)</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Priya Kadam"
                  className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-ink-500 focus:ring-2 focus:ring-brand-500/20"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-600 mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-ink-500 focus:ring-2 focus:ring-brand-500/20"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-600 mb-1">Password</label>
                <input
                  type="password"
                  required
                  minLength={12}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 12 characters"
                  className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-ink-500 focus:ring-2 focus:ring-brand-500/20"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-ink-950 text-white rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-ink-800 disabled:opacity-50"
              >
                {loading ? 'Creating account…' : 'Create account →'}
              </button>
            </form>

            <p className="text-xs text-ink-500 text-center mt-6">
              Already have an account?{' '}
              <Link href="/login" className="text-brand-600 font-medium hover:underline">Log in</Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
