import { Capacitor } from '@capacitor/core';
import type { UserProfile } from '../types';
import { handleLocalMobileRequest } from './localMobileBackend';

const TOKEN_STORAGE_KEY = 'prato_treino_auth_token';
const REFRESH_TOKEN_STORAGE_KEY = 'prato_treino_refresh_token';
const PERSISTENT_TOKEN_STORAGE_KEY = 'prato_treino_persistent_token';
const AUTH_MODE_STORAGE_KEY = 'prato_treino_auth_mode';
const CACHED_PROFILE_STORAGE_KEY = 'prato_treino_cached_profile';
const HAS_ACCOUNT_STORAGE_KEY = 'prato_treino_has_account';
const LAST_EMAIL_STORAGE_KEY = 'prato_treino_last_email';
const DEFAULT_NATIVE_API_BASE = 'https://ais-pre-bdavefpacfd4ffbunhz7iu-799767735636.us-east1.run.app';

export type StoredAuthMode = 'personal' | 'credentials';

let refreshInFlight: Promise<boolean> | null = null;
let authExpiredListener: (() => void) | null = null;
let nativeOfflineFallbackActive =
  typeof window !== 'undefined' &&
  Capacitor.isNativePlatform() &&
  localStorage.getItem(TOKEN_STORAGE_KEY) === 'local-mobile-session';

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

export function getStoredPersistentToken(): string | null {
  return localStorage.getItem(PERSISTENT_TOKEN_STORAGE_KEY);
}

export function setStoredPersistentToken(token: string | null): void {
  if (token) {
    localStorage.setItem(PERSISTENT_TOKEN_STORAGE_KEY, token);
  } else {
    localStorage.removeItem(PERSISTENT_TOKEN_STORAGE_KEY);
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

export function getCachedProfile(): UserProfile | null {
  try {
    const raw = localStorage.getItem(CACHED_PROFILE_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as UserProfile) : null;
  } catch {
    return null;
  }
}

export function setCachedProfile(profile: UserProfile | null): void {
  if (profile) {
    try {
      localStorage.setItem(CACHED_PROFILE_STORAGE_KEY, JSON.stringify(profile));
      if (profile.email) {
        localStorage.setItem(LAST_EMAIL_STORAGE_KEY, profile.email);
      }
      if (profile.onboarding_completed) {
        localStorage.setItem(HAS_ACCOUNT_STORAGE_KEY, '1');
      }
    } catch {
      // Ignore storage quota errors
    }
  } else {
    localStorage.removeItem(CACHED_PROFILE_STORAGE_KEY);
  }
}

export function getHasAccount(): boolean {
  return localStorage.getItem(HAS_ACCOUNT_STORAGE_KEY) === '1';
}

export function markHasAccount(email?: string | null): void {
  localStorage.setItem(HAS_ACCOUNT_STORAGE_KEY, '1');
  if (email && email.trim()) {
    localStorage.setItem(LAST_EMAIL_STORAGE_KEY, email.trim().toLowerCase());
  }
}

export function getLastEmail(): string {
  return localStorage.getItem(LAST_EMAIL_STORAGE_KEY) || '';
}

export function clearStoredSession(): void {
  setStoredToken(null);
  setStoredRefreshToken(null);
  setStoredPersistentToken(null);
  setStoredAuthMode(null);
  setCachedProfile(null);
}

function isNetworkFailureError(err: unknown): boolean {
  if (!err) return false;
  if (err instanceof DOMException && err.name === 'AbortError') return true;
  if (err instanceof TypeError) return true;
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('load failed') ||
    msg.includes('network request failed') ||
    msg.includes('aborted')
  );
}

async function fetchWithOptionalTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
  if (options.signal || typeof AbortController === 'undefined') {
    return fetch(url, options);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function refreshSessionSingleFlight(): Promise<boolean> {
  if (refreshInFlight) {
    return refreshInFlight;
  }

  refreshInFlight = (async () => {
    try {
      const refreshToken = getStoredRefreshToken();
      const persistentToken = getStoredPersistentToken();
      const authMode = getStoredAuthMode();
      const response = await fetchWithOptionalTimeout(
        resolveApiUrl('/api/auth/refresh'),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            refreshToken: refreshToken || undefined,
            persistentToken: persistentToken || undefined,
            allowPersonalFallback: authMode !== 'credentials',
          }),
        },
        8000
      );

      if (!response.ok) {
        return false;
      }

      const data = (await response.json()) as {
        token?: string;
        refreshToken?: string | null;
        persistentToken?: string | null;
        profile?: UserProfile;
      };

      if (!data.token) {
        return false;
      }

      setStoredToken(data.token);
      if (data.refreshToken) {
        setStoredRefreshToken(data.refreshToken);
      }
      if (data.persistentToken) {
        setStoredPersistentToken(data.persistentToken);
      }
      if (data.profile) {
        setCachedProfile(data.profile);
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
  const isNative = typeof window !== 'undefined' && Capacitor.isNativePlatform();

  if (isNative && nativeOfflineFallbackActive) {
    return handleLocalMobileRequest<T>(path, options);
  }

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

    const timeoutMs =
      path === '/api/health'
        ? isNative
          ? 2200
          : 4500
        : path.startsWith('/api/ai/')
          ? 28000
          : 15000;
    return fetchWithOptionalTimeout(
      resolveApiUrl(path),
      {
        ...options,
        headers,
      },
      timeoutMs
    );
  };

  let response: Response;
  try {
    response = await executeFetch();

    const responseContentType = response.headers.get('content-type') || '';
    if (isNative && !responseContentType.includes('application/json')) {
      nativeOfflineFallbackActive = true;
      return handleLocalMobileRequest<T>(path, options);
    }

    if (
      path === '/api/ai/analyze-meal' &&
      (!responseContentType.includes('application/json') || response.status >= 500)
    ) {
      return handleLocalMobileRequest<T>(path, options);
    }

    if (response.status === 401 && shouldAttemptAutoRefresh(path)) {
      const refreshed = await refreshSessionSingleFlight();
      if (refreshed) {
        response = await executeFetch(getStoredToken());
      } else if (path !== '/api/auth/me') {
        clearStoredSession();
        authExpiredListener?.();
      }
    }
  } catch (err) {
    if (isNative && isNetworkFailureError(err)) {
      nativeOfflineFallbackActive = true;
      return handleLocalMobileRequest<T>(path, options);
    }
    if (isNetworkFailureError(err) && path === '/api/ai/analyze-meal') {
      return handleLocalMobileRequest<T>(path, options);
    }
    if (isNetworkFailureError(err)) {
      throw new Error('Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.');
    }
    throw err;
  }

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    if (path === '/api/ai/analyze-meal' && response.status >= 500) {
      return handleLocalMobileRequest<T>(path, options);
    }
    const message =
      typeof data === 'object' && data && 'error' in data
        ? String((data as { error: unknown }).error)
        : `Erro na requisição (${response.status})`;
    throw new Error(message);
  }

  return data as T;
}
