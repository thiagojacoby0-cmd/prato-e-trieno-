import React, { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import {
  Bell,
  Check,
  Database,
  Download,
  Droplets,
  Dumbbell,
  LogOut,
  Moon,
  RefreshCw,
  RotateCcw,
  Save,
  Settings,
  Sliders,
  Sun,
  Upload,
  User,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { apiRequest } from '../services/apiClient';
import {
  NutritionBackupPayload,
  NutritionRestoreResult,
  WorkoutLevel,
  WorkoutPreferences,
} from '../types';
import {
  calculateNutritionTargets,
  formatWaterLiters,
  getTodayISO,
  WORKOUT_LEVEL_LABELS,
} from '../utils/nutrition';
import { sanitizeNutritionBackup } from '../utils/nutritionHistory';
import { overwriteLocalNutritionMirror } from '../utils/localNutritionMirror';
import {
  HydrationReminderIntervalHours,
  useAppSettings,
  WaterQuickStepMl,
} from '../utils/appSettings';
import { PWAInstallButton } from '../components/PWAInstallButton';
import type { AppRoute } from '../components/AppLayout';

const WEEKDAY_LABELS = [
  { id: 0, short: 'Dom' },
  { id: 1, short: 'Seg' },
  { id: 2, short: 'Ter' },
  { id: 3, short: 'Qua' },
  { id: 4, short: 'Qui' },
  { id: 5, short: 'Sex' },
  { id: 6, short: 'Sáb' },
];

export function SettingsPage({ onNavigate }: { onNavigate: (route: AppRoute) => void }) {
  const { profile, updateProfile, configInfo, logout } = useAuth();
  const { settings, updateSettings, resetSettings } = useAppSettings();
  const isNativeApp = typeof window !== 'undefined' && Capacitor.isNativePlatform();
  const restoreInputRef = useRef<HTMLInputElement | null>(null);

  // Metas de nutrição e hidratação (salvas no perfil)
  const [waterTargetMl, setWaterTargetMl] = useState(profile?.water_target_ml || 2000);
  const [calorieTarget, setCalorieTarget] = useState(profile?.daily_calorie_target || 2000);
  const [proteinTarget, setProteinTarget] = useState(profile?.protein_target_g || 150);
  const [carbsTarget, setCarbsTarget] = useState(profile?.carbs_target_g || 200);
  const [fatTarget, setFatTarget] = useState(profile?.fat_target_g || 60);
  const [savingTargets, setSavingTargets] = useState(false);
  const [targetsSaved, setTargetsSaved] = useState(false);
  const [targetsError, setTargetsError] = useState<string | null>(null);

  // Preferências de treino e lembretes (salvas em /api/training/preferences)
  const [prefs, setPrefs] = useState<WorkoutPreferences | null>(null);
  const [loadingPrefs, setLoadingPrefs] = useState(true);
  const [savingPrefsKey, setSavingPrefsKey] = useState<string | null>(null);
  const [prefsNotice, setPrefsNotice] = useState<string | null>(null);
  const [prefsError, setPrefsError] = useState<string | null>(null);

  // Notificações e backup
  const [notifFeedback, setNotifFeedback] = useState<string | null>(null);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | 'unsupported'>(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
    return Notification.permission;
  });
  const [downloadingBackup, setDownloadingBackup] = useState(false);
  const [restoringBackup, setRestoringBackup] = useState(false);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    setWaterTargetMl(profile.water_target_ml);
    setCalorieTarget(profile.daily_calorie_target);
    setProteinTarget(profile.protein_target_g);
    setCarbsTarget(profile.carbs_target_g);
    setFatTarget(profile.fat_target_g);
  }, [profile]);

  useEffect(() => {
    let active = true;
    const loadPrefs = async () => {
      try {
        const res = await apiRequest<{ preferences: WorkoutPreferences }>('/api/training/preferences');
        if (active) setPrefs(res.preferences);
      } catch (err) {
        if (active) {
          setPrefsError(err instanceof Error ? err.message : 'Erro ao carregar preferências de treino.');
        }
      } finally {
        if (active) setLoadingPrefs(false);
      }
    };
    void loadPrefs();
    return () => {
      active = false;
    };
  }, []);

  if (!profile) return null;

  const handleRecalculateTargets = () => {
    const rec = calculateNutritionTargets({
      age: profile.age,
      sex: profile.sex,
      height_cm: profile.height_cm,
      current_weight_kg: profile.current_weight_kg,
      activity_level: profile.activity_level,
      goal: profile.goal,
    });
    setWaterTargetMl(rec.water_target_ml);
    setCalorieTarget(rec.daily_calorie_target);
    setProteinTarget(rec.protein_target_g);
    setCarbsTarget(rec.carbs_target_g);
    setFatTarget(rec.fat_target_g);
    setTargetsError(null);
  };

  const handleSaveTargets = async (e: React.FormEvent) => {
    e.preventDefault();
    setTargetsError(null);
    setTargetsSaved(false);

    if (!Number.isFinite(waterTargetMl) || waterTargetMl < 500 || waterTargetMl > 10000) {
      setTargetsError('Informe uma meta de água válida entre 500 ml e 10.000 ml.');
      return;
    }
    if (!Number.isFinite(calorieTarget) || calorieTarget < 800 || calorieTarget > 8000) {
      setTargetsError('Informe uma meta calórica válida entre 800 e 8.000 kcal.');
      return;
    }
    if (!Number.isFinite(proteinTarget) || proteinTarget < 20 || proteinTarget > 500) {
      setTargetsError('Informe uma meta de proteína válida entre 20 g e 500 g.');
      return;
    }
    if (!Number.isFinite(carbsTarget) || carbsTarget < 0 || carbsTarget > 1000) {
      setTargetsError('Informe uma meta de carboidratos válida entre 0 g e 1.000 g.');
      return;
    }
    if (!Number.isFinite(fatTarget) || fatTarget < 15 || fatTarget > 350) {
      setTargetsError('Informe uma meta de gordura válida entre 15 g e 350 g.');
      return;
    }

    setSavingTargets(true);
    try {
      await updateProfile({
        water_target_ml: Math.round(waterTargetMl),
        daily_calorie_target: Math.round(calorieTarget),
        protein_target_g: Math.round(proteinTarget),
        carbs_target_g: Math.round(carbsTarget),
        fat_target_g: Math.round(fatTarget),
      });
      setTargetsSaved(true);
      setTimeout(() => setTargetsSaved(false), 3000);
    } catch (err) {
      setTargetsError(err instanceof Error ? err.message : 'Erro ao salvar metas diárias.');
    } finally {
      setSavingTargets(false);
    }
  };

  const handleUpdatePrefs = async (patch: Partial<WorkoutPreferences>, keyLabel = 'prefs') => {
    setPrefsError(null);
    setSavingPrefsKey(keyLabel);
    try {
      const res = await apiRequest<{ preferences: WorkoutPreferences }>('/api/training/preferences', {
        method: 'PUT',
        body: JSON.stringify(patch),
      });
      setPrefs(res.preferences);
      setPrefsNotice('Preferência atualizada');
      setTimeout(() => setPrefsNotice(null), 2000);
    } catch (err) {
      setPrefsError(err instanceof Error ? err.message : 'Não foi possível salvar a preferência.');
    } finally {
      setSavingPrefsKey(null);
    }
  };

  const handleRequestNotifications = async () => {
    setNotifFeedback(null);
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setNotifFeedback('Seu navegador atual não suporta notificações do sistema; os alertas aparecem no topo do app.');
      return;
    }
    try {
      const perm = await Notification.requestPermission();
      setNotifPermission(perm);
      if (perm === 'granted') {
        new Notification('PRATO & TREINO · Notificações ativas', {
          body: 'Seus lembretes de treino, descanso e hidratação estão configurados.',
          icon: '/pwa-192x192.png',
        });
        setNotifFeedback('Notificação de teste enviada! Alertas do sistema estão ativados.');
      } else if (perm === 'denied') {
        setNotifFeedback('Permissão bloqueada no navegador. Libere notificações nas permissões do site para receber fora da aba.');
      } else {
        setNotifFeedback('Permissão pendente. Os lembretes continuam aparecendo no topo do aplicativo.');
      }
    } catch {
      setNotifFeedback('Não foi possível testar notificações neste dispositivo.');
    }
  };

  const handleExportBackup = async () => {
    setDownloadingBackup(true);
    setBackupError(null);
    setBackupMessage(null);
    try {
      const backup = await apiRequest<NutritionBackupPayload>('/api/nutrition/backup');
      overwriteLocalNutritionMirror(backup);
      const fileName = `prato-treino-backup-${getTodayISO()}.json`;
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setBackupMessage(
        `Backup exportado (${backup.meals.length} refeições, ${backup.water_logs.length} dias de água e ${backup.weight_logs.length} registros de peso).`
      );
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : 'Erro ao exportar backup.');
    } finally {
      setDownloadingBackup(false);
    }
  };

  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setRestoringBackup(true);
    setBackupError(null);
    setBackupMessage(null);
    try {
      const rawText = await file.text();
      const parsed = JSON.parse(rawText);
      const sanitized = sanitizeNutritionBackup(parsed);
      if (!sanitized) {
        setBackupError('Arquivo inválido. Escolha um arquivo .json exportado pelo PRATO & TREINO.');
        return;
      }
      const res = await apiRequest<{ ok: boolean } & NutritionRestoreResult>('/api/nutrition/restore', {
        method: 'POST',
        body: JSON.stringify(sanitized),
      });
      const refreshed = await apiRequest<NutritionBackupPayload>('/api/nutrition/backup');
      overwriteLocalNutritionMirror(refreshed);
      setBackupMessage(
        `Restauração concluída: ${res.meals_added} refeições adicionadas` +
          (res.meals_skipped > 0 ? `, ${res.meals_skipped} já existentes` : '') +
          (res.water_days_merged > 0 ? `, ${res.water_days_merged} dias de água atualizados` : '') +
          (res.weights_added > 0 ? `, ${res.weights_added} pesos` : '') +
          '.'
      );
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : 'Não foi possível restaurar o backup.');
    } finally {
      setRestoringBackup(false);
    }
  };

  const handleResetAppDefaults = () => {
    resetSettings();
    setBackupMessage('Preferências locais do aplicativo restauradas (incremento de água em +250 ml).');
    setBackupError(null);
  };

  return (
    <div className="space-y-6 pb-10">
      {/* Cabeçalho resumo */}
      <section className="flex flex-col justify-between gap-4 rounded-3xl border border-[#E1EEE9] bg-white p-5 shadow-[0_10px_28px_-14px_rgba(15,42,42,0.09)] sm:flex-row sm:items-center sm:p-6">
        <div className="flex items-start gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#12BFA3]/15 text-[#0C947E]">
            <Settings className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold text-[#0F2A2A]">Configurações do Aplicativo</h2>
            <p className="mt-0.5 text-xs text-[#648482]">
              Ajuste metas de água e calorias, botões rápidos, temporizador dos treinos, áudio, lembretes e backup.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('profile')}
          className="inline-flex min-h-[40px] shrink-0 items-center justify-center gap-2 rounded-xl border border-[#DCECE6] bg-[#F4FAF7] px-3.5 py-2 text-xs font-medium text-[#0F2A2A] hover:bg-[#E7F4EF]"
        >
          <User className="h-3.5 w-3.5 text-[#0C947E]" />
          Dados físicos &amp; Perfil
        </button>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Coluna Principal */}
        <div className="space-y-6 lg:col-span-7">
          {/* 0. Aparência (Modo Claro / Modo Escuro) */}
          <section className="rounded-3xl border border-[#E1EEE9] bg-white p-5 shadow-[0_10px_28px_-14px_rgba(15,42,42,0.08)] sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E3F7F2] text-[#0C947E]">
                  {settings.theme === 'dark' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
                </div>
                <div>
                  <h3 className="font-display text-base font-semibold text-[#0F2A2A]">Aparência do Aplicativo</h3>
                  <p className="text-xs text-[#648482]">
                    Escolha entre o tema claro suave ou o modo escuro para conforto visual.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 rounded-2xl border border-[#DCECE6] bg-[#EDF7F3] p-1">
                <button
                  type="button"
                  onClick={() => updateSettings({ theme: 'light' })}
                  className={`inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                    settings.theme === 'light'
                      ? 'bg-[#12BFA3] text-white shadow-sm'
                      : 'text-[#4B6B68] hover:text-[#0F2A2A]'
                  }`}
                >
                  <Sun className="h-3.5 w-3.5" />
                  Modo claro
                </button>
                <button
                  type="button"
                  onClick={() => updateSettings({ theme: 'dark' })}
                  className={`inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                    settings.theme === 'dark'
                      ? 'bg-[#12BFA3] text-white shadow-sm'
                      : 'text-[#4B6B68] hover:text-[#0F2A2A]'
                  }`}
                >
                  <Moon className="h-3.5 w-3.5" />
                  Modo escuro
                </button>
              </div>
            </div>
          </section>

          {/* 1. Metas de Água, Calorias & Macros */}
          <form
            onSubmit={handleSaveTargets}
            className="space-y-5 rounded-3xl border border-[#E1EEE9] bg-white p-5 shadow-[0_10px_28px_-14px_rgba(15,42,42,0.08)] sm:p-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5F1EC] pb-4">
              <div className="flex items-center gap-2.5">
                <Droplets className="h-5 w-5 text-sky-500" />
                <div>
                  <h3 className="font-display text-base font-semibold text-[#0F2A2A]">
                    Hidratação &amp; Metas Nutricionais
                  </h3>
                  <p className="text-xs text-[#648482]">
                    Defina sua meta diária de água (padrão 2 L), calorias e macronutrientes.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleRecalculateTargets}
                className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-[#DCECE6] bg-[#F4FAF7] px-3 py-1.5 text-xs font-medium text-[#0C947E] hover:bg-[#E7F4EF]"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Recalcular pelo perfil
              </button>
            </div>

            {targetsError && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                {targetsError}
              </div>
            )}

            {/* Meta de água + atalhos */}
            <div className="space-y-3 rounded-2xl border border-sky-200 bg-sky-50/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label htmlFor="cfg-water-target" className="text-xs font-medium text-[#2E4A48]">
                  Meta diária de água ·{' '}
                  <span className="font-mono font-semibold text-sky-600">
                    {formatWaterLiters(waterTargetMl)} ({Number(waterTargetMl || 0).toLocaleString('pt-BR')} ml)
                  </span>
                </label>
                <div className="flex flex-wrap items-center gap-1.5">
                  {[1500, 2000, 2500, 3000].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setWaterTargetMl(preset)}
                      className={`min-h-[30px] rounded-lg px-2.5 font-mono text-[11px] font-semibold transition-colors ${
                        waterTargetMl === preset
                          ? 'bg-sky-500 text-white'
                          : 'border border-sky-200 bg-white text-[#2E4A48] hover:bg-sky-100'
                      }`}
                    >
                      {formatWaterLiters(preset)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="cfg-water-target" className="mb-1 block text-[11px] text-[#5C7B79]">
                    Valor personalizado (ml)
                  </label>
                  <input
                    id="cfg-water-target"
                    type="number"
                    inputMode="numeric"
                    min={500}
                    max={10000}
                    step={100}
                    value={waterTargetMl}
                    onChange={(e) => setWaterTargetMl(Number(e.target.value))}
                    className="min-h-[42px] w-full rounded-xl border border-[#D3E5DF] bg-white px-3.5 py-2 font-mono text-sm text-[#0F2A2A] focus:border-sky-500 focus:outline-none"
                  />
                </div>

                <div>
                  <span className="mb-1 block text-[11px] text-[#5C7B79]">
                    Botão rápido de água no painel
                  </span>
                  <div className="grid grid-cols-4 gap-1.5">
                    {([200, 250, 300, 500] as WaterQuickStepMl[]).map((step) => {
                      const active = settings.waterQuickStepMl === step;
                      return (
                        <button
                          key={step}
                          type="button"
                          onClick={() => updateSettings({ waterQuickStepMl: step })}
                          className={`min-h-[42px] rounded-xl border font-mono text-xs font-semibold transition-colors ${
                            active
                              ? 'border-sky-500 bg-sky-500 text-white'
                              : 'border-[#D3E5DF] bg-white text-[#4B6B68] hover:bg-sky-50'
                          }`}
                        >
                          +{step}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Calorias & Macros */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#2E4A48]">Calorias (kcal)</label>
                <input
                  type="number"
                  inputMode="numeric"
                  min={800}
                  max={8000}
                  value={calorieTarget}
                  onChange={(e) => setCalorieTarget(Number(e.target.value))}
                  className="min-h-[42px] w-full rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-3 py-2 font-mono text-sm text-[#0F2A2A] focus:border-[#12BFA3] focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#2E4A48]">Proteína (g)</label>
                <input
                  type="number"
                  inputMode="numeric"
                  min={20}
                  max={500}
                  value={proteinTarget}
                  onChange={(e) => setProteinTarget(Number(e.target.value))}
                  className="min-h-[42px] w-full rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-3 py-2 font-mono text-sm text-[#0F2A2A] focus:border-[#12BFA3] focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#2E4A48]">Carboidrato (g)</label>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={1000}
                  value={carbsTarget}
                  onChange={(e) => setCarbsTarget(Number(e.target.value))}
                  className="min-h-[42px] w-full rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-3 py-2 font-mono text-sm text-[#0F2A2A] focus:border-[#12BFA3] focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#2E4A48]">Gordura (g)</label>
                <input
                  type="number"
                  inputMode="numeric"
                  min={15}
                  max={350}
                  value={fatTarget}
                  onChange={(e) => setFatTarget(Number(e.target.value))}
                  className="min-h-[42px] w-full rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-3 py-2 font-mono text-sm text-[#0F2A2A] focus:border-[#12BFA3] focus:outline-none"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <button
                type="submit"
                disabled={savingTargets}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#12BFA3] px-5 py-2 text-xs font-semibold text-white shadow-sm shadow-[#12BFA3]/20 hover:bg-[#0EA88F] disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                {savingTargets ? 'Salvando...' : 'Salvar metas diárias'}
              </button>
              {targetsSaved && (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0C947E]">
                  <Check className="h-4 w-4" /> Metas atualizadas com sucesso
                </span>
              )}
            </div>
          </form>

          {/* 2. Treinos, Áudio & Temporizador */}
          <section className="space-y-4 rounded-3xl border border-[#E1EEE9] bg-white p-5 shadow-[0_10px_28px_-14px_rgba(15,42,42,0.08)] sm:p-6">
            <div className="flex items-center justify-between gap-3 border-b border-[#E5F1EC] pb-4">
              <div className="flex items-center gap-2.5">
                <Dumbbell className="h-5 w-5 text-[#0C947E]" />
                <div>
                  <h3 className="font-display text-base font-semibold text-[#0F2A2A]">
                    Treinos, Temporizador &amp; Áudio
                  </h3>
                  <p className="text-xs text-[#648482]">
                    Personalize contagem regressiva, descanso entre séries, voz e efeitos sonoros do player.
                  </p>
                </div>
              </div>
              {prefsNotice && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#0C947E]">
                  <Check className="h-3.5 w-3.5" /> {prefsNotice}
                </span>
              )}
            </div>

            {prefsError && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                {prefsError}
              </div>
            )}

            {loadingPrefs || !prefs ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-16 animate-pulse rounded-xl bg-[#EEF7F3]" />
                ))}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div>
                    <label className="mb-1.5 block text-xs text-[#2E4A48]">Nível padrão</label>
                    <select
                      value={prefs.preferred_level}
                      disabled={savingPrefsKey === 'level'}
                      onChange={(e) =>
                        void handleUpdatePrefs(
                          { preferred_level: e.target.value as WorkoutLevel },
                          'level'
                        )
                      }
                      className="min-h-[42px] w-full rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-2.5 py-2 text-xs text-[#0F2A2A]"
                    >
                      {Object.entries(WORKOUT_LEVEL_LABELS).map(([k, label]) => (
                        <option key={k} value={k}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs text-[#2E4A48]">Duração alvo</label>
                    <select
                      value={prefs.preferred_duration_min}
                      disabled={savingPrefsKey === 'duration'}
                      onChange={(e) =>
                        void handleUpdatePrefs(
                          { preferred_duration_min: Number(e.target.value) },
                          'duration'
                        )
                      }
                      className="min-h-[42px] w-full rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-2.5 py-2 font-mono text-xs text-[#0F2A2A]"
                    >
                      {[15, 20, 25, 35, 45].map((m) => (
                        <option key={m} value={m}>
                          {m} min
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs text-[#2E4A48]">Preparação</label>
                    <select
                      value={prefs.countdown_seconds}
                      disabled={savingPrefsKey === 'countdown'}
                      onChange={(e) =>
                        void handleUpdatePrefs(
                          { countdown_seconds: Number(e.target.value) },
                          'countdown'
                        )
                      }
                      className="min-h-[42px] w-full rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-2.5 py-2 font-mono text-xs text-[#0F2A2A]"
                    >
                      {[3, 5, 8, 10].map((s) => (
                        <option key={s} value={s}>
                          {s} seg
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs text-[#2E4A48]">Descanso padrão</label>
                    <select
                      value={prefs.rest_seconds}
                      disabled={savingPrefsKey === 'rest'}
                      onChange={(e) =>
                        void handleUpdatePrefs({ rest_seconds: Number(e.target.value) }, 'rest')
                      }
                      className="min-h-[42px] w-full rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-2.5 py-2 font-mono text-xs text-[#0F2A2A]"
                    >
                      {[15, 20, 25, 30, 45].map((s) => (
                        <option key={s} value={s}>
                          {s} seg
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() =>
                      void handleUpdatePrefs({ voice_enabled: !prefs.voice_enabled }, 'voice')
                    }
                    className={`flex items-center justify-between gap-3 rounded-xl border p-3.5 text-left transition-colors ${
                      prefs.voice_enabled
                        ? 'border-[#12BFA3]/45 bg-[#EBF9F6]'
                        : 'border-[#DCECE6] bg-[#F4FAF7]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      {prefs.voice_enabled ? (
                        <Volume2 className="h-4 w-4 text-[#0C947E]" />
                      ) : (
                        <VolumeX className="h-4 w-4 text-[#648482]" />
                      )}
                      <div>
                        <p className="text-xs font-semibold text-[#0F2A2A]">Coach por voz (PT-BR)</p>
                        <p className="text-[11px] text-[#648482]">
                          Instruções faladas no início e troca de exercícios
                        </p>
                      </div>
                    </div>
                    <span
                      className={`rounded-lg px-2 py-1 text-[11px] font-semibold ${
                        prefs.voice_enabled
                          ? 'bg-[#12BFA3] text-white'
                          : 'bg-[#DCECE6] text-[#4B6B68]'
                      }`}
                    >
                      {prefs.voice_enabled ? 'Ativo' : 'Mudo'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      void handleUpdatePrefs({ sound_enabled: !prefs.sound_enabled }, 'sound')
                    }
                    className={`flex items-center justify-between gap-3 rounded-xl border p-3.5 text-left transition-colors ${
                      prefs.sound_enabled
                        ? 'border-[#12BFA3]/45 bg-[#EBF9F6]'
                        : 'border-[#DCECE6] bg-[#F4FAF7]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Sliders
                        className={`h-4 w-4 ${prefs.sound_enabled ? 'text-[#0C947E]' : 'text-[#648482]'}`}
                      />
                      <div>
                        <p className="text-xs font-semibold text-[#0F2A2A]">Bipes de temporizador</p>
                        <p className="text-[11px] text-[#648482]">
                          Sinal sonoro nos últimos segundos e fim do descanso
                        </p>
                      </div>
                    </div>
                    <span
                      className={`rounded-lg px-2 py-1 text-[11px] font-semibold ${
                        prefs.sound_enabled
                          ? 'bg-[#12BFA3] text-white'
                          : 'bg-[#DCECE6] text-[#4B6B68]'
                      }`}
                    >
                      {prefs.sound_enabled ? 'Ativo' : 'Mudo'}
                    </span>
                  </button>
                </div>
              </>
            )}
          </section>
        </div>

        {/* Coluna Lateral: Lembretes, Backup e Conta */}
        <div className="space-y-6 lg:col-span-5">
          {/* 3. Lembretes & Notificações */}
          <section className="space-y-4 rounded-3xl border border-[#E1EEE9] bg-white p-5 shadow-[0_10px_28px_-14px_rgba(15,42,42,0.08)] sm:p-6">
            <div className="flex items-center gap-2.5 border-b border-[#E5F1EC] pb-4">
              <Bell className="h-5 w-5 text-[#F59E2D]" />
              <div>
                <h3 className="font-display text-base font-semibold text-[#0F2A2A]">
                  Lembretes &amp; Notificações
                </h3>
                <p className="text-xs text-[#648482]">
                  Alertas programados para treinar, descansar e beber água.
                </p>
              </div>
            </div>

            {/* Lembrete periódico de hidratação */}
            <div className="space-y-3 rounded-2xl border border-sky-200 bg-sky-50/60 p-3.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-[#0F2A2A]">Lembrete de água</p>
                  <p className="text-[11px] text-[#648482]">Alerta entre 08:00 e 21:00</p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    updateSettings({ hydrationReminderEnabled: !settings.hydrationReminderEnabled })
                  }
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
                    settings.hydrationReminderEnabled
                      ? 'bg-sky-500 text-white'
                      : 'border border-sky-200 bg-white text-[#4B6B68]'
                  }`}
                >
                  {settings.hydrationReminderEnabled ? 'Ativado' : 'Desativado'}
                </button>
              </div>

              {settings.hydrationReminderEnabled && (
                <div className="flex items-center justify-between gap-2 border-t border-sky-200/70 pt-2.5">
                  <span className="text-[11px] text-[#2E4A48]">Intervalo</span>
                  <div className="flex items-center gap-1.5">
                    {([1, 2, 3] as HydrationReminderIntervalHours[]).map((hrs) => (
                      <button
                        key={hrs}
                        type="button"
                        onClick={() => updateSettings({ hydrationReminderIntervalHours: hrs })}
                        className={`rounded-lg px-2.5 py-1 font-mono text-[11px] font-semibold ${
                          settings.hydrationReminderIntervalHours === hrs
                            ? 'bg-sky-500 text-white'
                            : 'border border-sky-200 bg-white text-[#4B6B68]'
                        }`}
                      >
                        {hrs}h
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Lembrete de treino */}
            {prefs && (
              <div className="space-y-3 rounded-2xl border border-[#DCECE6] bg-[#F4FAF7] p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-[#0F2A2A]">Lembrete de treino</p>
                    <p className="text-[11px] text-[#648482]">Aviso diário no horário definido</p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      void handleUpdatePrefs({ reminder_enabled: !prefs.reminder_enabled }, 'reminder')
                    }
                    className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
                      prefs.reminder_enabled
                        ? 'bg-[#12BFA3] text-white'
                        : 'border border-[#D3E5DF] bg-white text-[#4B6B68]'
                    }`}
                  >
                    {prefs.reminder_enabled ? 'Ativado' : 'Desativado'}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="mb-1 block text-[11px] text-[#5C7B79]">Horário do treino</label>
                    <input
                      type="time"
                      value={prefs.reminder_time}
                      onChange={(e) => void handleUpdatePrefs({ reminder_time: e.target.value }, 'time')}
                      className="w-full rounded-xl border border-[#D3E5DF] bg-white px-3 py-2 font-mono text-xs text-[#0F2A2A]"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-[#5C7B79]">Horário de descanso</label>
                    <input
                      type="time"
                      value={prefs.rest_time_reminder}
                      onChange={(e) =>
                        void handleUpdatePrefs({ rest_time_reminder: e.target.value }, 'rest_time')
                      }
                      className="w-full rounded-xl border border-[#D3E5DF] bg-white px-3 py-2 font-mono text-xs text-[#0F2A2A]"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-[11px] text-[#5C7B79]">Frequência</label>
                  <select
                    value={prefs.reminder_frequency}
                    onChange={(e) =>
                      void handleUpdatePrefs(
                        {
                          reminder_frequency: e.target.value as WorkoutPreferences['reminder_frequency'],
                        },
                        'freq'
                      )
                    }
                    className="w-full rounded-xl border border-[#D3E5DF] bg-white px-2.5 py-2 text-xs text-[#0F2A2A]"
                  >
                    <option value="diario">Todos os dias</option>
                    <option value="dias_selecionados">Dias selecionados</option>
                    <option value="alternado">Dia sim, dia não</option>
                  </select>
                </div>

                {prefs.reminder_frequency === 'dias_selecionados' && (
                  <div className="grid grid-cols-7 gap-1">
                    {WEEKDAY_LABELS.map((d) => {
                      const active = prefs.reminder_days.includes(d.id);
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => {
                            const nextDays = active
                              ? prefs.reminder_days.filter((x) => x !== d.id)
                              : [...prefs.reminder_days, d.id].sort((a, b) => a - b);
                            void handleUpdatePrefs({ reminder_days: nextDays }, 'days');
                          }}
                          className={`rounded-lg border py-1.5 text-[11px] font-semibold ${
                            active
                              ? 'border-[#12BFA3] bg-[#12BFA3]/15 text-[#0C947E]'
                              : 'border-[#D3E5DF] bg-white text-[#648482]'
                          }`}
                        >
                          {d.short}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2 border-t border-[#E5F1EC] pt-3">
              <div className="flex items-center justify-between text-[11px] text-[#648482]">
                <span>Notificações do navegador</span>
                <span className="font-mono font-medium text-[#2E4A48]">
                  {notifPermission === 'granted'
                    ? 'Permitido'
                    : notifPermission === 'denied'
                    ? 'Bloqueado'
                    : notifPermission === 'unsupported'
                    ? 'Apenas no app'
                    : 'Não solicitado'}
                </span>
              </div>
              <button
                type="button"
                onClick={handleRequestNotifications}
                className="w-full rounded-xl border border-[#12BFA3]/45 bg-[#EBF9F6] px-3.5 py-2.5 text-xs font-semibold text-[#0C947E] hover:bg-[#DCF4EE]"
              >
                Ativar / testar notificações do sistema
              </button>
              {notifFeedback && <p className="text-xs font-medium text-[#0C947E]">{notifFeedback}</p>}
            </div>
          </section>

          {/* 4. Backup, Dados & Conta */}
          <section className="space-y-4 rounded-3xl border border-[#E1EEE9] bg-white p-5 shadow-[0_10px_28px_-14px_rgba(15,42,42,0.08)] sm:p-6">
            <div className="flex items-center gap-2.5 border-b border-[#E5F1EC] pb-4">
              <Database className="h-5 w-5 text-[#0C947E]" />
              <div>
                <h3 className="font-display text-base font-semibold text-[#0F2A2A]">
                  Backup, Segurança &amp; Conta
                </h3>
                <p className="text-xs text-[#648482]">
                  Exporte ou restaure seu histórico sem apagar registros existentes.
                </p>
              </div>
            </div>

            {backupError && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                {backupError}
              </div>
            )}
            {backupMessage && (
              <div className="rounded-xl border border-[#12BFA3]/35 bg-[#EBF9F6] p-3 text-xs font-medium text-[#0C947E]">
                {backupMessage}
              </div>
            )}

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <button
                type="button"
                disabled={downloadingBackup}
                onClick={handleExportBackup}
                className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl border border-[#12BFA3]/45 bg-[#EBF9F6] px-3.5 py-2 text-xs font-semibold text-[#0C947E] hover:bg-[#DCF4EE] disabled:opacity-60"
              >
                <Download className="h-4 w-4" />
                {downloadingBackup ? 'Exportando...' : 'Exportar backup'}
              </button>

              <button
                type="button"
                disabled={restoringBackup}
                onClick={() => restoreInputRef.current?.click()}
                className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-3.5 py-2 text-xs font-semibold text-[#0F2A2A] hover:bg-[#E7F4EF] disabled:opacity-60"
              >
                <Upload className="h-4 w-4" />
                {restoringBackup ? 'Restaurando...' : 'Restaurar backup'}
              </button>
              <input
                ref={restoreInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={handleRestoreFile}
              />
            </div>

            <dl className="space-y-2 border-t border-[#E5F1EC] pt-3 text-xs">
              <div className="flex justify-between gap-2">
                <dt className="text-[#648482]">Armazenamento</dt>
                <dd className="font-semibold text-[#0F2A2A]">
                  {configInfo?.supabaseConfigured ? 'Sincronizado na nuvem' : 'Salvo no dispositivo'}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[#648482]">Conta conectada</dt>
                <dd className="truncate font-mono text-[#2E4A48]">{profile.email}</dd>
              </div>
            </dl>

            {!isNativeApp && (
              <div className="border-t border-[#E5F1EC] pt-3">
                <PWAInstallButton />
              </div>
            )}

            <div className="grid grid-cols-1 gap-2 border-t border-[#E5F1EC] pt-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={handleResetAppDefaults}
                className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border border-[#DCECE6] bg-[#F4FAF7] px-3 py-2 text-xs font-medium text-[#4B6B68] hover:text-[#0F2A2A]"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Padrões do app
              </button>
              <button
                type="button"
                onClick={logout}
                className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border border-[#DCECE6] bg-white px-3 py-2 text-xs font-medium text-[#2E4A48] hover:bg-[#F2F9F6] hover:text-[#0F2A2A]"
              >
                <LogOut className="h-3.5 w-3.5" />
                Trocar conta
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
