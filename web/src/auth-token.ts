/** Manages the WebUI JWT for REST and WebSocket authentication. */
import { withBasePath } from './base-path';

const STORAGE_KEY = 'omp.webui.jwt';
/** Key used before the rename; read once so open tabs are not logged out. */
const LEGACY_STORAGE_KEY = 'codex.webui.jwt';

/** Returns the stored JWT, or null if not yet set. */
export function getApiToken(): string | null {
  const token = sessionStorage.getItem(STORAGE_KEY);
  if (token) return token;
  const legacy = sessionStorage.getItem(LEGACY_STORAGE_KEY);
  if (!legacy) return null;
  sessionStorage.setItem(STORAGE_KEY, legacy);
  sessionStorage.removeItem(LEGACY_STORAGE_KEY);
  return legacy;
}

/** Stores the JWT in session storage. */
export function setApiToken(token: string): void {
  sessionStorage.setItem(STORAGE_KEY, token);
}

/** Clears the stored JWT. */
export function clearApiToken(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}

/** Returns the Authorization header value, or null if no token. */
export function getAuthorizationHeader(): string | null {
  const token = getApiToken();
  return token ? `Bearer ${token}` : null;
}

/**
 * Builds a URL to the `/api/files/serve` endpoint with inline auth token.
 * Suitable for `<img src>`, `<embed src>`, etc. that cannot set Authorization headers.
 */
export function buildFileServeUrl(filePath: string): string {
  const token = getApiToken();
  const params = new URLSearchParams({ path: filePath });
  if (token) params.set('access_token', token);
  return `${withBasePath('/api/files/serve')}?${params.toString()}`;
}
