/**
 * Login route component — self-contained auth flow with router navigation.
 * Reads ?redirect= search param to return to the original page after login.
 */
import { useCallback } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import {
  type AuthStatus,
  type LoginCredentials,
  LoginPage,
} from '@/components/login';
import { SnackbarContainer } from '@/components/snackbar/snackbar-container';
import { filesGetRoots } from '@/generated/api';
import { setApiToken, clearApiToken } from '@/auth-token';
import { resetSocket } from '@/socket';

/** Reads the authentication state; null when the server cannot be reached. */
async function loadAuthStatus(): Promise<AuthStatus | null> {
  try {
    const res = await fetch('/api/auth/status', {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    return (await res.json()) as AuthStatus;
  } catch {
    return null;
  }
}

/** Posts one credential payload and returns the issued token, or an error code. */
async function postCredentials(
  path: '/api/auth/login' | '/api/auth/setup',
  body: LoginCredentials | { username: string; password: string },
): Promise<{ token?: string; errorCode?: string }> {
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as
        | { errorCode?: string }
        | null;
      return { errorCode: payload?.errorCode ?? 'error.http.request_failed' };
    }
    const data = (await res.json()) as { accessToken?: string };
    return { token: data.accessToken };
  } catch {
    return { errorCode: 'error.http.request_failed' };
  }
}

export function LoginRoute() {
  const navigate = useNavigate();
  const { redirect } = useSearch({ from: '/login' });

  const handleLogin = useCallback(
    async (credentials: LoginCredentials): Promise<boolean> => {
      const { token } = await postCredentials('/api/auth/login', credentials);
      if (!token) {
        clearApiToken();
        return false;
      }
      setApiToken(token);
      await filesGetRoots({ throwOnError: true });
      resetSocket();
      void navigate({ to: redirect });
      return true;
    },
    [navigate, redirect],
  );

  const handleSetup = useCallback(
    async (username: string, password: string): Promise<string | null> => {
      const { token, errorCode } = await postCredentials('/api/auth/setup', {
        username,
        password,
      });
      if (!token) return errorCode ?? 'error.http.request_failed';
      setApiToken(token);
      await filesGetRoots({ throwOnError: true });
      resetSocket();
      void navigate({ to: redirect });
      return null;
    },
    [navigate, redirect],
  );

  return (
    <>
      <LoginPage
        loadStatus={loadAuthStatus}
        onLogin={handleLogin}
        onSetup={handleSetup}
      />
      <SnackbarContainer />
    </>
  );
}
