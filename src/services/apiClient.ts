import { Capacitor } from '@capacitor/core';

const TOKEN_STORAGE_KEY = 'prato_treino_auth_token';
const REFRESH_TOKEN_STORAGE_KEY = 'prato_treino_refresh_token';
const AUTH_MODE_STORAGE_KEY = 'prato_treino_auth_mode';
const DEFAULT_NATIVE_API_BASE = 'https://ais-pre-bdavefpacfd4ffbunhz7iu-799767735636.us-east1.run.app';

export type StoredAuthMode = 'personal' | 'credentials';

let refreshInFlight: Promise<boolean> | null = null;
let authExpiredListener: (() => void) | null = null;

export function setAuthExpiredListener(listener: (() => void) | null): void {
  authExpiredListener = listener;
}

export function getApiBaseUrl(): string {
  const configured = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  if (configured) {
    return configured.replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined' && Capacitor.isNativePlatform()) {
    return DEFAULT_NATIVE_API_BASE;
  }
  return '';
}

export function resolveApiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const base = getApiBaseUrl();
  if (!base) return path;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setStoredToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}

export function getStoredRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
}

export function setStoredRefreshToken(refreshToken: string | null): void {
  if (refreshToken) {
    localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, refreshToken);
  } else {
    localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
  }
}

export function getStoredAuthMode(): StoredAuthMode | null {
  const raw = localStorage.getItem(AUTH_MODE_STORAGE_KEY);
  return raw === 'personal' || raw === 'credentials' ? raw : null;
}

export function setStoredAuthMode(mode: StoredAuthMode | null): void {
  if (mode) {
    localStorage.setItem(AUTH_MODE_STORAGE_KEY, mode);
  } else {
    localStorage.removeItem(AUTH_MODE_STORAGE_KEY);
  }
}

export function clearStoredSession(): void {
  setStoredToken(null);
  setStoredRefreshToken(null);
  setStoredAuthMode(null);
}

async function refreshSessionSingleFlight(): Promise<boolean> {
  if (refreshInFlight) {
    return refreshInFlight;
  }

  refreshInFlight = (async () => {
    try {
      const refreshToken = getStoredRefreshToken();
      const authMode = getStoredAuthMode();
      const response = await fetch(resolveApiUrl('/api/auth/refresh'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          refreshToken: refreshToken || undefined,
          allowPersonalFallback: authMode !== 'credentials',
        }),
      });

      if (!response.ok) {
        return false;
      }

      const data = (await response.json()) as {
        token?: string;
        refreshToken?: string | null;
      };

      if (!data.token) {
        return false;
      }

      setStoredToken(data.token);
      if (data.refreshToken) {
        setStoredRefreshToken(data.refreshToken);
      }
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

function shouldAttemptAutoRefresh(path: string): boolean {
  if (path === '/api/auth/me') return true;
  return !path.startsWith('/api/auth/') && path !== '/api/health';
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const executeFetch = async (tokenOverride?: string | null) => {
    const token = tokenOverride !== undefined ? tokenOverride : getStoredToken();
    const headers = new Headers(options.headers || {});

    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const isFormData = options.body instanceof FormData;
    if (!isFormData && !headers.has('Content-Type') && options.body) {
      headers.set('Content-Type', 'application/json');
    }

    return fetch(resolveApiUrl(path), {
      ...options,
      headers,
    });
  };

  let response = await executeFetch();

  if (response.status === 401 && shouldAttemptAutoRefresh(path)) {
    const refreshed = await refreshSessionSingleFlight();
    if (refreshed) {
      response = await executeFetch(getStoredToken());
    } else if (path !== '/api/auth/me') {
      clearStoredSession();
      authExpiredListener?.();
    }
  }

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message =
      typeof data === 'object' && data && 'error' in data
        ? String((data as { error: unknown }).error)
        : `Erro na requisição (${response.status})`;
    throw new Error(message);
  }

  return data as T;
}
