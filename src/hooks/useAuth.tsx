import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { AppConfigInfo, UserProfile } from '../types';
import {
  apiRequest,
  clearStoredSession,
  getStoredToken,
  setAuthExpiredListener,
  setStoredAuthMode,
  setStoredRefreshToken,
  setStoredToken,
} from '../services/apiClient';

interface AuthContextValue {
  profile: UserProfile | null;
  loading: boolean;
  initError: string | null;
  configInfo: AppConfigInfo | null;
  login: (email: string, password: string) => Promise<void>;
  register: (fullName: string, email: string, password: string) => Promise<void>;
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
  profile: UserProfile;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
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
    setStoredToken(data.token);
    setStoredRefreshToken(data.refreshToken || null);
    setStoredAuthMode('personal');
    setProfile(data.profile);
  }, []);

  const refreshProfile = useCallback(async () => {
    try {
      const cfg = await apiRequest<AppConfigInfo>('/api/health');
      setConfigInfo(cfg);

      const token = getStoredToken();
      if (token) {
        try {
          const data = await apiRequest<{ profile: UserProfile }>('/api/auth/me');
          setProfile(data.profile);
          setLoading(false);
          return;
        } catch {
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
          setProfile(null);
        }
      } else {
        setProfile(null);
      }
    } catch {
      setProfile(null);
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
    setStoredToken(data.token);
    setStoredRefreshToken(data.refreshToken || null);
    setStoredAuthMode('credentials');
    setProfile(data.profile);
  };

  const register = async (fullName: string, email: string, password: string) => {
    const data = await apiRequest<AuthSessionResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ full_name: fullName, email, password }),
    });
    setStoredToken(data.token);
    setStoredRefreshToken(data.refreshToken || null);
    setStoredAuthMode('credentials');
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
    setStoredToken(data.token);
    setStoredRefreshToken(data.refreshToken || null);
    setStoredAuthMode('credentials');
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
