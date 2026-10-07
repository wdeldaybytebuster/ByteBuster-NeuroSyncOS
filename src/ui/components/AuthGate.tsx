/**
 * §2.2 (V2) — the operator gate.
 *
 * On mount it probes `GET /api/auth/session` (an auth endpoint, so a 401 here
 * is an answer, not a dead session) and picks one of three screens:
 *
 *   - credential exists  → login screen (Argon2id verification server-side)
 *   - no credential yet  → first-run setup screen (boot window + loopback only,
 *                          enforced server-side — this screen is just the form)
 *   - probe reachable + authenticated → children render untouched
 *
 * A network failure SUPPRESSES the gate (never lock the operator out of the
 * shell because the core is rebooting), and a 401 from any other API route —
 * the `onUnauthorized` signal from lib/api.ts — re-opens the login screen
 * without a page reload.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { authFetch, onUnauthorized, setSessionToken } from '../lib/api';

/** Mirrors MIN_PASSWORD_LENGTH in src/server/auth/credentials.ts (§2.2). */
const MIN_PASSWORD_LENGTH = 12;

type GateState = 'probing' | 'setup' | 'login' | 'open';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GateState>('probing');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const probe = useCallback(async () => {
    try {
      const res = await authFetch('/api/auth/session');
      if (res.ok) {
        setState('open');
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setState(body.error === 'setup-required' ? 'setup' : 'login');
    } catch {
      // core unreachable — render the shell rather than a lockout
      setState('open');
    }
  }, []);

  useEffect(() => {
    void probe();
    return onUnauthorized(() => {
      setError(null);
      setPassword('');
      setState((prev) => (prev === 'open' ? 'login' : prev));
    });
  }, [probe]);

  const submit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (state === 'setup' && password.length < MIN_PASSWORD_LENGTH) {
        setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const endpoint = state === 'setup' ? '/api/auth/setup' : '/api/auth/login';
        const res = await authFetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password }),
        });
        const body = (await res.json().catch(() => ({}))) as { ok?: boolean; token?: string; error?: string };
        if (res.ok && body.ok && typeof body.token === 'string') {
          setSessionToken(body.token);
          window.location.reload();
          return;
        }
        if (body.error === 'weak-password') {
          setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
        } else if (body.error === 'already-configured') {
          setError('This operator credential already exists — sign in instead.');
          setState('login');
        } else if (body.error === 'setup-required') {
          setError('Setup has not run yet — set the operator credential first.');
          setState('setup');
        } else if (res.status === 403) {
          setError('Setup is only available from the loopback address, during the boot window.');
        } else if (res.status === 429) {
          setError('Too many attempts — wait a moment and try again.');
        } else {
          setError(state === 'setup' ? 'Setup failed — try again.' : 'Incorrect password.');
        }
      } catch {
        setError('Cannot reach the NeuroSync core.');
      } finally {
        setBusy(false);
      }
    },
    [state, password]
  );

  if (state === 'open') return <>{children}</>;

  if (state === 'probing') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-white/70">
        <div className="text-sm tracking-widest uppercase">NeuroSync · verifying operator…</div>
      </div>
    );
  }

  const isSetup = state === 'setup';
  return (
    <div className="flex min-h-screen items-center justify-center bg-black px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-xl border border-white/10 bg-white/[0.03] p-6 shadow-[0_0_40px_rgba(0,0,0,0.6)]"
      >
        <h1 className="text-lg font-semibold text-white">NeuroSync Sovereign OS</h1>
        <p className="mt-1 text-xs text-white/50">
          {isSetup
            ? 'First run — set the operator credential (minimum 12 characters).'
            : 'Enter the operator credential to unlock the console.'}
        </p>

        <label className="mt-5 block text-xs uppercase tracking-wider text-white/60" htmlFor="operator-password">
          {isSetup ? 'New credential' : 'Credential'}
        </label>
        <input
          id="operator-password"
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded-md border border-white/15 bg-black/60 px-3 py-2 text-sm text-white outline-none focus:border-white/40"
          placeholder={isSetup ? `at least ${MIN_PASSWORD_LENGTH} characters` : '••••••••••••'}
        />

        {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={busy || password.length === 0}
          className="mt-5 w-full rounded-md bg-white/90 px-3 py-2 text-sm font-medium text-black transition hover:bg-white disabled:opacity-40"
        >
          {busy ? 'Verifying…' : isSetup ? 'Create credential' : 'Unlock'}
        </button>
      </form>
    </div>
  );
}
