import { useCallback, useEffect, useState } from 'react';

export type AppTheme = 'light' | 'dark';
export type WaterQuickStepMl = 200 | 250 | 300 | 500;
export type HydrationReminderIntervalHours = 1 | 2 | 3;

export interface AppSettings {
  theme: AppTheme;
  waterQuickStepMl: WaterQuickStepMl;
  hydrationReminderEnabled: boolean;
  hydrationReminderIntervalHours: HydrationReminderIntervalHours;
}

const STORAGE_KEY = 'prato_treino_app_settings_v1';
const SETTINGS_EVENT = 'pt:app-settings-changed';

export const DEFAULT_APP_SETTINGS: AppSettings = {
  theme: 'light',
  waterQuickStepMl: 250,
  hydrationReminderEnabled: false,
  hydrationReminderIntervalHours: 2,
};

function sanitizeSettings(raw: Partial<AppSettings> | null | undefined): AppSettings {
  const theme: AppTheme = raw?.theme === 'dark' ? 'dark' : 'light';

  const step = Number(raw?.waterQuickStepMl);
  const waterQuickStepMl: WaterQuickStepMl =
    step === 200 || step === 250 || step === 300 || step === 500 ? step : 250;

  const interval = Number(raw?.hydrationReminderIntervalHours);
  const hydrationReminderIntervalHours: HydrationReminderIntervalHours =
    interval === 1 || interval === 2 || interval === 3 ? interval : 2;

  return {
    theme,
    waterQuickStepMl,
    hydrationReminderEnabled: Boolean(raw?.hydrationReminderEnabled),
    hydrationReminderIntervalHours,
  };
}

export function applyAppTheme(theme: AppTheme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute('content', theme === 'dark' ? '#061314' : '#ECF8F3');
  }
}

export function getAppSettings(): AppSettings {
  if (typeof window === 'undefined') return { ...DEFAULT_APP_SETTINGS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_APP_SETTINGS };
    return sanitizeSettings(JSON.parse(raw) as Partial<AppSettings>);
  } catch {
    return { ...DEFAULT_APP_SETTINGS };
  }
}

export function initAppTheme(): AppTheme {
  const settings = getAppSettings();
  applyAppTheme(settings.theme);
  return settings.theme;
}

export function saveAppSettings(patch: Partial<AppSettings>): AppSettings {
  const current = getAppSettings();
  const next = sanitizeSettings({ ...current, ...patch });
  applyAppTheme(next.theme);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      window.dispatchEvent(new CustomEvent(SETTINGS_EVENT, { detail: next }));
    } catch {
      // Ignora erro de quota
    }
  }
  return next;
}

export function resetAppSettings(): AppSettings {
  return saveAppSettings(DEFAULT_APP_SETTINGS);
}

export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings>(() => getAppSettings());

  useEffect(() => {
    applyAppTheme(settings.theme);
  }, [settings.theme]);

  useEffect(() => {
    const handleCustom = (e: Event) => {
      const customEvent = e as CustomEvent<AppSettings>;
      const next = sanitizeSettings(customEvent.detail);
      setSettings(next);
      applyAppTheme(next.theme);
    };
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        const next = getAppSettings();
        setSettings(next);
        applyAppTheme(next.theme);
      }
    };
    window.addEventListener(SETTINGS_EVENT, handleCustom);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener(SETTINGS_EVENT, handleCustom);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    const next = saveAppSettings(patch);
    setSettings(next);
    return next;
  }, []);

  const reset = useCallback(() => {
    const next = resetAppSettings();
    setSettings(next);
    return next;
  }, []);

  return { settings, updateSettings, resetSettings: reset };
}
