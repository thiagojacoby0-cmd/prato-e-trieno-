import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { AppConfigInfo, UserProfile } from '../types';
import {
  apiRequest,
  clearStoredSession,
  getCachedProfile,
  getStoredToken,
  markHasAccount,
  setAuthExpiredListener,
  setCachedProfile,
  setStoredAuthMode,
  setStoredPersistentToken,
  setStoredRefreshToken,
  setStoredToken,
} from '../services/apiClient';

interface AuthContextValue {
  profile: UserProfile | null;
  loading: boolean;
  initError: string | null;
  configInfo: AppConfigInfo | null;
  login: (email: string, password: string) => Promise<void>;
  register: (
    fullName: string,
    email: string,
    password: string,
    extraProfile?: Partial<UserProfile>
  ) => Promise<void>;
  sendEmailOtp: (email: string) => Promise<void>;
  verifyEmailOtp: (email: string, code: string) => Promise<void>;
  enterPersonalMode: () => Promise<void>;
  logout: () => void;
  updateProfile: (updates: Partial<UserProfile>) => Promise<UserProfile>;
  refreshProfile: () => Promise<void>;
}

interface AuthSessionResponse {
  token: string;
  refreshToken?: string | null;
  persistentToken?: string | null;
  profile: UserProfile;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function persistAuthSession(data: AuthSessionResponse, mode: 'personal' | 'credentials'): void {
  setStoredToken(data.token);
  setStoredRefreshToken(data.refreshToken || null);
  if (data.persistentToken) {
    setStoredPersistentToken(data.persistentToken);
  }
  setStoredAuthMode(mode);
  setCachedProfile(data.profile);
  if (data.profile.onboarding_completed || mode === 'credentials') {
    markHasAccount(data.profile.email);
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const initialToken = typeof window !== 'undefined' ? getStoredToken() : null;
  const initialCachedProfile = typeof window !== 'undefined' && initialToken ? getCachedProfile() : null;

  const [profile, setProfile] = useState<UserProfile | null>(initialCachedProfile);
  const [loading, setLoading] = useState(!initialCachedProfile);
  const [initError, setInitError] = useState<string | null>(null);
  const [configInfo, setConfigInfo] = useState<AppConfigInfo | null>(null);

  useEffect(() => {
    setAuthExpiredListener(() => {
      setProfile(null);
    });
    return () => setAuthExpiredListener(null);
  }, []);

  const enterPersonalMode = useCallback(async () => {
    setInitError(null);
    const data = await apiRequest<AuthSessionResponse>('/api/auth/personal', {
      method: 'POST',
    });
    persistAuthSession(data, 'personal');
    setProfile(data.profile);
  }, []);

  const refreshProfile = useCallback(async () => {
    const cached = getStoredToken() ? getCachedProfile() : null;
    try {
      const cfg = await apiRequest<AppConfigInfo>('/api/health');
      setConfigInfo(cfg);

      const token = getStoredToken();
      if (token) {
        try {
          const data = await apiRequest<{ profile: UserProfile }>('/api/auth/me');
          setCachedProfile(data.profile);
          if (data.profile.onboarding_completed) {
            markHasAccount(data.profile.email);
          }
          setProfile(data.profile);
          setLoading(false);
          return;
        } catch (err) {
          const msg = err instanceof Error ? err.message.toLowerCase() : '';
          const isAuthRejection =
            msg.includes('sessão') ||
            msg.includes('token') ||
            msg.includes('autenticada') ||
            msg.includes('401') ||
            msg.includes('perfil não encontrado');

          if (!isAuthRejection && cached) {
            setProfile(cached);
            setLoading(false);
            return;
          }
          clearStoredSession();
        }
      }

      // Acesso direto sem senha no modo local ou quando SUPABASE_SERVICE_ROLE_KEY está configurada
      if (!cfg.supabaseConfigured || cfg.supabaseServiceRole) {
        try {
          await enterPersonalMode();
          return;
        } catch (err) {
          setInitError(err instanceof Error ? err.message : null);
          setProfile(cached);
        }
      } else {
        setProfile(null);
      }
    } catch {
      if (cached) {
        setProfile(cached);
      } else {
        setProfile(null);
      }
    } finally {
      setLoading(false);
    }
  }, [enterPersonalMode]);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  const login = async (email: string, password: string) => {
    const data = await apiRequest<AuthSessionResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    persistAuthSession(data, 'credentials');
    setProfile(data.profile);
  };

  const register = async (
    fullName: string,
    email: string,
    password: string,
    extraProfile?: Partial<UserProfile>
  ) => {
    const data = await apiRequest<AuthSessionResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ full_name: fullName, email, password }),
    });
    persistAuthSession(data, 'credentials');
    if (extraProfile && Object.keys(extraProfile).length > 0) {
      const updated = await apiRequest<{ profile: UserProfile }>('/api/profile', {
        method: 'PUT',
        body: JSON.stringify({
          full_name: fullName,
          ...extraProfile,
        }),
      });
      setCachedProfile(updated.profile);
      markHasAccount(updated.profile.email);
      setProfile(updated.profile);
      return;
    }
    setProfile(data.profile);
  };

  const sendEmailOtp = async (email: string) => {
    await apiRequest('/api/auth/otp-send', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  };

  const verifyEmailOtp = async (email: string, code: string) => {
    const data = await apiRequest<AuthSessionResponse>('/api/auth/otp-verify', {
      method: 'POST',
      body: JSON.stringify({ email, code }),
    });
    persistAuthSession(data, 'credentials');
    setProfile(data.profile);
  };

  const logout = () => {
    clearStoredSession();
    setProfile(null);
  };

  const updateProfile = async (updates: Partial<UserProfile>) => {
    const data = await apiRequest<{ profile: UserProfile }>('/api/profile', {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    setCachedProfile(data.profile);
    if (data.profile.onboarding_completed) {
      markHasAccount(data.profile.email);
    }
    setProfile(data.profile);
    return data.profile;
  };

  return (
    <AuthContext.Provider
      value={{
        profile,
        loading,
        initError,
        configInfo,
        login,
        register,
        sendEmailOtp,
        verifyEmailOtp,
        enterPersonalMode,
        logout,
        updateProfile,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return ctx;
}
