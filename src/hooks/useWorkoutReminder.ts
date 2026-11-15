import { useEffect, useState } from 'react';
import { apiRequest } from '../services/apiClient';
import type { WorkoutPreferences } from '../types';
import { getTodayISO } from '../utils/nutrition';

export function useWorkoutReminder(enabledUser: boolean) {
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!enabledUser || typeof window === 'undefined') return;

    let cancelled = false;
    let prefsCache: WorkoutPreferences | null = null;
    let lastFetch = 0;

    const checkSchedule = async () => {
      try {
        const nowTs = Date.now();
        if (!prefsCache || nowTs - lastFetch > 120_000) {
          const res = await apiRequest<{ preferences: WorkoutPreferences }>('/api/training/preferences');
          if (cancelled) return;
          prefsCache = res.preferences;
          lastFetch = nowTs;
        }

        if (!prefsCache?.reminder_enabled) return;

        const now = new Date();
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        const currentHHMM = `${hh}:${mm}`;
        const dayOfWeek = now.getDay(); // 0=Dom..6=Sab
        const today = getTodayISO();

        // Verifica se hoje está dentro da frequência configurada
        let isTodayScheduled = false;
        if (prefsCache.reminder_frequency === 'diario') {
          isTodayScheduled = true;
        } else if (prefsCache.reminder_frequency === 'alternado') {
          const dayNum = Math.floor(now.getTime() / 86_400_000);
          isTodayScheduled = dayNum % 2 === 0;
        } else {
          isTodayScheduled = prefsCache.reminder_days.includes(dayOfWeek);
        }

        const fireOnce = (keySuffix: string, title: string, body: string) => {
          const storageKey = `pt_reminder_${today}_${keySuffix}`;
          if (localStorage.getItem(storageKey)) return;
          localStorage.setItem(storageKey, '1');
          setBannerMessage(`${title}: ${body}`);

          if ('Notification' in window && Notification.permission === 'granted') {
            try {
              new Notification(title, {
                body,
                icon: '/pwa-192x192.png',
                tag: storageKey,
              });
            } catch {
              // Ignora se plataforma restringir Notification sem service worker
            }
          }
        };

        if (isTodayScheduled && currentHHMM === prefsCache.reminder_time) {
          fireOnce(
            'workout',
            'Hora do treino no PRATO & TREINO',
            'Seu treino diário guiado já está pronto. Comece com 3 minutos de aquecimento!'
          );
        }

        if (prefsCache.rest_time_reminder && currentHHMM === prefsCache.rest_time_reminder) {
          fireOnce(
            'rest',
            'Momento de recuperação muscular',
            'Horário programado de descanso para consolidar resultados e sono reparador.'
          );
        }
      } catch {
        // Silencioso para não poluir interface caso usuário esteja offline
      }
    };

    checkSchedule();
    const interval = setInterval(checkSchedule, 25_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [enabledUser]);

  return {
    bannerMessage,
    dismissBanner: () => setBannerMessage(null),
  };
}
