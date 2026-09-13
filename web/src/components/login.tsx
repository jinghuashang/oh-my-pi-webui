/**
 * Login / first-run setup screen.
 *
 * The server owns the state machine: until an account exists, the page only
 * offers initialization; afterwards it offers account sign-in with the API key
 * as a secondary method for machine credentials.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { KeyRound, Loader2, ShieldCheck, UserRound } from 'lucide-react';

export interface AuthStatus {
  initialized: boolean;
  apiKeyEnabled: boolean;
  passwordPolicy: {
    usernameMin: number;
    usernameMax: number;
    passwordMin: number;
    passwordMax: number;
  };
}

export interface LoginCredentials {
  username?: string;
  password?: string;
  apiKey?: string;
}

interface Props {
  /** Resolves the server's authentication state; null when unreachable. */
  loadStatus: () => Promise<AuthStatus | null>;
  /** Submits account credentials or an API key; false means the server rejected them. */
  onLogin: (credentials: LoginCredentials) => Promise<boolean>;
  /** Creates the first account; returns an error message on rejection. */
  onSetup: (username: string, password: string) => Promise<string | null>;
}

const DEFAULT_POLICY: AuthStatus['passwordPolicy'] = {
  usernameMin: 3,
  usernameMax: 32,
  passwordMin: 8,
  passwordMax: 200,
};

export function LoginPage({ loadStatus, onLogin, onSetup }: Props) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [method, setMethod] = useState<'account' | 'apiKey'>('account');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadStatus().then((next) => {
      if (cancelled) return;
      setStatus(next);
      setStatusLoaded(true);
      if (next && !next.initialized) setMethod('account');
    });
    return () => {
      cancelled = true;
    };
  }, [loadStatus]);

  const initializing = statusLoaded && status !== null && !status.initialized;
  const policy = status?.passwordPolicy ?? DEFAULT_POLICY;

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setError('');

      if (initializing) {
        if (password !== confirm) {
          setError(t('Passwords do not match'));
          return;
        }
        setLoading(true);
        const failure = await onSetup(username.trim(), password);
        setLoading(false);
        // The route reports a stable error code; render it through i18n.
        if (failure) setError(t(failure));
        return;
      }

      setLoading(true);
      const ok =
        method === 'account'
          ? await onLogin({ username: username.trim(), password })
          : await onLogin({ apiKey: apiKey.trim() });
      setLoading(false);
      if (!ok) {
        setError(
          method === 'account'
            ? t('Invalid username or password')
            : t('Invalid API key'),
        );
      }
    },
    [apiKey, confirm, initializing, method, onLogin, onSetup, password, t, username],
  );

  const canSubmit = initializing
    ? username.trim().length >= policy.usernameMin &&
      password.length >= policy.passwordMin &&
      confirm.length > 0
    : method === 'account'
      ? username.trim().length > 0 && password.length > 0
      : apiKey.trim().length > 0;

  return (
    <div className="relative flex h-[var(--app-vh,100dvh)] items-center justify-center overflow-hidden bg-background">
      <form
        onSubmit={handleSubmit}
        className="glass-5 relative z-10 w-full max-w-sm space-y-5 rounded-3xl p-8"
      >
        <div className="flex items-center gap-2.5 text-lg font-semibold">
          {initializing ? (
            <ShieldCheck className="h-5 w-5 opacity-70" />
          ) : (
            <KeyRound className="h-5 w-5 opacity-70" />
          )}
          Oh My Pi WebUI
        </div>

        <p className="text-sm text-muted-foreground">
          {initializing
            ? t('Create the WebUI account to finish setup.')
            : t('Sign in to continue.')}
        </p>

        {!initializing && (
          <div className="flex gap-1 rounded-xl border border-[var(--glass-border)] p-1">
            {(
              [
                { id: 'account' as const, label: t('Account') },
                { id: 'apiKey' as const, label: t('API Key') },
              ] satisfies Array<{ id: 'account' | 'apiKey'; label: string }>
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setMethod(tab.id);
                  setError('');
                }}
                className={
                  method === tab.id
                    ? 'flex-1 rounded-lg bg-muted px-3 py-1.5 text-sm font-medium'
                    : 'flex-1 rounded-lg px-3 py-1.5 text-sm text-muted-foreground'
                }
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {(initializing || method === 'account') && (
          <>
            <Input
              placeholder={t('Username')}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              className="rounded-xl border-[var(--glass-border)] bg-background/40 backdrop-blur-sm transition-all focus:bg-background/60"
              autoFocus
            />
            <Input
              type="password"
              placeholder={t('Password')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={initializing ? 'new-password' : 'current-password'}
              className="rounded-xl border-[var(--glass-border)] bg-background/40 backdrop-blur-sm transition-all focus:bg-background/60"
            />
          </>
        )}

        {initializing && (
          <>
            <Input
              type="password"
              placeholder={t('Confirm password')}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              className="rounded-xl border-[var(--glass-border)] bg-background/40 backdrop-blur-sm transition-all focus:bg-background/60"
            />
            <p className="text-xs text-muted-foreground">
              {t(
                '{{nameMin}}-{{nameMax}} characters for the username; at least {{passwordMin}} for the password.',
                {
                  nameMin: policy.usernameMin,
                  nameMax: policy.usernameMax,
                  passwordMin: policy.passwordMin,
                },
              )}
            </p>
          </>
        )}

        {!initializing && method === 'apiKey' && (
          <Input
            type="password"
            placeholder={t('API Key')}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="rounded-xl border-[var(--glass-border)] bg-background/40 backdrop-blur-sm transition-all focus:bg-background/60"
            autoFocus
          />
        )}

        {error && <p className="text-sm text-red-500">{error}</p>}

        <Button type="submit" className="w-full rounded-xl" disabled={loading || !canSubmit}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {initializing ? t('Initialize') : t('Login')}
        </Button>

        {initializing && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <UserRound className="h-3.5 w-3.5" />
            {t('Initialization can only be done once.')}
          </p>
        )}
      </form>
    </div>
  );
}
