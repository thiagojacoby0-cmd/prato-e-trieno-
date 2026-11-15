import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Award,
  Bell,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Dumbbell,
  Film,
  Flame,
  Layers,
  Mic,
  Play,
  Plus,
  Sliders,
  Sparkles,
  Star,
  Trash2,
} from 'lucide-react';
import { apiRequest } from '../services/apiClient';
import type {
  TrainingPlan,
  WeightLog,
  WorkoutCategoryName,
  WorkoutExercise,
  WorkoutLevel,
  WorkoutLog,
  WorkoutPreferences,
  WorkoutProgram,
} from '../types';
import { formatDateBR, WORKOUT_LEVEL_LABELS } from '../utils/nutrition';
import { WorkoutPlayerModal } from '../components/WorkoutPlayerModal';
import { WorkoutTutorialModal } from '../components/WorkoutTutorialModal';
import { MonthlyWorkoutChart, WeeklyWorkoutBarChart, WeightEvolutionChart } from '../components/InteractiveCharts';
import { EXERCISE_LIBRARY, WORKOUT_CATEGORIES } from '../database/exerciseLibrary';
import { useAuth } from '../hooks/useAuth';

interface WorkoutStatsPayload {
  total_workouts: number;
  total_minutes: number;
  total_calories: number;
  total_exercises: number;
  weekly_frequency: number;
  streak_days: number;
  active_dates: string[];
  weekly_series: Array<{ date: string; label: string; minutes: number; calories: number; sessions: number }>;
  monthly_series: Array<{ label: string; minutes: number; calories: number; sessions: number }>;
}

interface TrainingHubResponse {
  workouts: WorkoutProgram[];
  logs: WorkoutLog[];
  preferences: WorkoutPreferences;
  trainingPlan: TrainingPlan;
  stats: WorkoutStatsPayload;
  trainingMigrationPending?: boolean;
}

type WorkoutsSubTab = 'home' | 'plans' | 'custom' | 'evolution';

const WEEKDAY_LABELS = [
  { id: 0, short: 'Dom' },
  { id: 1, short: 'Seg' },
  { id: 2, short: 'Ter' },
  { id: 3, short: 'Qua' },
  { id: 4, short: 'Qui' },
  { id: 5, short: 'Sex' },
  { id: 6, short: 'Sáb' },
];

const MIGRATION_002_SNIPPET = `-- Cole no SQL Editor do Supabase para salvar Planos, Preferências e Lembretes na nuvem:
ALTER TABLE public.workouts
  ADD COLUMN IF NOT EXISTS warmup JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS cooldown JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS muscle_focus JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS is_custom BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.workout_logs
  ADD COLUMN IF NOT EXISTS plan_id UUID,
  ADD COLUMN IF NOT EXISTS plan_day_number INTEGER,
  ADD COLUMN IF NOT EXISTS skipped_exercises INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS perceived_difficulty TEXT CHECK (perceived_difficulty IN ('facil', 'ideal', 'intenso')),
  ADD COLUMN IF NOT EXISTS warmup_done BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS cooldown_done BOOLEAN NOT NULL DEFAULT TRUE;
CREATE TABLE IF NOT EXISTS public.training_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  duration_days INTEGER NOT NULL CHECK (duration_days IN (7, 14, 30, 60)),
  level TEXT NOT NULL CHECK (level IN ('iniciante', 'intermediario', 'avancado')),
  goal TEXT NOT NULL DEFAULT 'emagrecimento',
  current_day INTEGER NOT NULL DEFAULT 1,
  completed_days JSONB NOT NULL DEFAULT '[]'::jsonb,
  schedule JSONB NOT NULL DEFAULT '[]'::jsonb,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.training_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own training plans" ON public.training_plans;
CREATE POLICY "Users manage own training plans" ON public.training_plans FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TABLE IF NOT EXISTS public.workout_preferences (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  favorite_exercise_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  substituted_exercises JSONB NOT NULL DEFAULT '{}'::jsonb,
  preferred_level TEXT NOT NULL DEFAULT 'intermediario',
  preferred_duration_min INTEGER NOT NULL DEFAULT 25,
  focus_muscles JSONB NOT NULL DEFAULT '["Corpo inteiro"]'::jsonb,
  voice_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sound_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  countdown_seconds INTEGER NOT NULL DEFAULT 5,
  rest_seconds INTEGER NOT NULL DEFAULT 20,
  adaptive_multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.00,
  reminder_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  reminder_time TEXT NOT NULL DEFAULT '07:30',
  reminder_days JSONB NOT NULL DEFAULT '[1,2,3,4,5]'::jsonb,
  reminder_frequency TEXT NOT NULL DEFAULT 'dias_selecionados',
  rest_time_reminder TEXT NOT NULL DEFAULT '22:00',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.workout_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own workout preferences" ON public.workout_preferences;
CREATE POLICY "Users manage own workout preferences" ON public.workout_preferences FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);`;

export function WorkoutsPage() {
  const { profile } = useAuth();
  const [subTab, setSubTab] = useState<WorkoutsSubTab>('home');
  const [loading, setLoading] = useState(true);

  const [workouts, setWorkouts] = useState<WorkoutProgram[]>([]);
  const [logs, setLogs] = useState<WorkoutLog[]>([]);
  const [preferences, setPreferences] = useState<WorkoutPreferences | null>(null);
  const [trainingPlan, setTrainingPlan] = useState<TrainingPlan | null>(null);
  const [stats, setStats] = useState<WorkoutStatsPayload | null>(null);
  const [weights, setWeights] = useState<WeightLog[]>([]);
  const [migrationPending, setMigrationPending] = useState(false);
  const [sqlCopied, setSqlCopied] = useState(false);

  // Filtros da Tela Principal
  const [selectedCategory, setSelectedCategory] = useState<'Todas' | WorkoutCategoryName>('Todas');
  const [levelFilter, setLevelFilter] = useState<'all' | WorkoutLevel>('all');
  const [onlyFavorites, setOnlyFavorites] = useState(false);

  // Modais Ativos
  const [activeWorkout, setActiveWorkout] = useState<WorkoutProgram | null>(null);
  const [activePlanContext, setActivePlanContext] = useState<{ planId: string; dayNumber: number } | null>(null);
  const [tutorialWorkout, setTutorialWorkout] = useState<WorkoutProgram | null>(null);

  // Planos Form State
  const [planDaysChoice, setPlanDaysChoice] = useState<7 | 14 | 30 | 60>(30);
  const [planLevelChoice, setPlanLevelChoice] = useState<WorkoutLevel>(profile?.workout_level || 'intermediario');
  const [creatingPlan, setCreatingPlan] = useState(false);

  // Personalização & Criador Manual
  const [customTitle, setCustomTitle] = useState('');
  const [customCategory, setCustomCategory] = useState<WorkoutCategoryName>('Corpo inteiro');
  const [customLevel, setCustomLevel] = useState<WorkoutLevel>('intermediario');
  const [selectedExerciseIds, setSelectedExerciseIds] = useState<string[]>([
    'main-squat',
    'main-pushup',
    'main-plank',
    'main-glute-bridge',
  ]);
  const [savingCustom, setSavingCustom] = useState(false);

  // Gerador IA
  const [aiFocus, setAiFocus] = useState('Corpo inteiro & Definição');
  const [aiDuration, setAiDuration] = useState(25);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  // Lembretes Feedback
  const [notifFeedback, setNotifFeedback] = useState<string | null>(null);

  const loadHub = useCallback(async () => {
    setLoading(true);
    try {
      const [hub, weightRes] = await Promise.all([
        apiRequest<TrainingHubResponse>('/api/training/hub'),
        apiRequest<{ logs: WeightLog[] }>('/api/weight').catch(() => ({ logs: [] as WeightLog[] })),
      ]);
      setWorkouts(hub.workouts);
      setLogs(hub.logs);
      setPreferences(hub.preferences);
      setTrainingPlan(hub.trainingPlan);
      setStats(hub.stats);
      setMigrationPending(Boolean(hub.trainingMigrationPending));
      setWeights(weightRes.logs || []);
      if (hub.trainingPlan) {
        setPlanDaysChoice(hub.trainingPlan.duration_days);
        setPlanLevelChoice(hub.trainingPlan.level);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHub();
  }, [loadHub]);

  const handleUpdatePreferences = async (patch: Partial<WorkoutPreferences>) => {
    const res = await apiRequest<{ preferences: WorkoutPreferences }>('/api/training/preferences', {
      method: 'PUT',
      body: JSON.stringify(patch),
    });
    setPreferences(res.preferences);
  };

  const handleToggleFavorite = async (exerciseId: string) => {
    if (!preferences) return;
    const exists = preferences.favorite_exercise_ids.includes(exerciseId);
    const next = exists
      ? preferences.favorite_exercise_ids.filter((id) => id !== exerciseId)
      : [...preferences.favorite_exercise_ids, exerciseId];
    await handleUpdatePreferences({ favorite_exercise_ids: next });
  };

  const handleStartWorkout = (workout: WorkoutProgram, planCtx: { planId: string; dayNumber: number } | null = null) => {
    setActivePlanContext(planCtx);
    setActiveWorkout(workout);
  };

  const handleCompleteWorkout = async (
    workout: WorkoutProgram,
    sessionStats: {
      duration_minutes: number;
      calories_burned: number;
      exercises_completed: number;
      skipped_exercises: number;
      perceived_difficulty: 'facil' | 'ideal' | 'intenso';
      warmup_done: boolean;
      cooldown_done: boolean;
      plan_id?: string | null;
      plan_day_number?: number | null;
    }
  ) => {
    await apiRequest('/api/workout-logs', {
      method: 'POST',
      body: JSON.stringify({
        workout_id: workout.id,
        workout_title: workout.title,
        ...sessionStats,
      }),
    });
    await loadHub();
  };

  const handleCreatePlan = async () => {
    setCreatingPlan(true);
    try {
      const res = await apiRequest<{ trainingPlan: TrainingPlan }>('/api/training/plans', {
        method: 'POST',
        body: JSON.stringify({
          duration_days: planDaysChoice,
          level: planLevelChoice,
          goal: profile?.goal || 'emagrecimento',
        }),
      });
      setTrainingPlan(res.trainingPlan);
    } finally {
      setCreatingPlan(false);
    }
  };

  const handleGenerateWorkoutAI = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneratingAI(true);
    setGenError(null);
    try {
      const res = await apiRequest<{ workout: WorkoutProgram }>('/api/ai/workout', {
        method: 'POST',
        body: JSON.stringify({
          focus: aiFocus,
          duration_minutes: aiDuration,
          equipment: profile?.home_equipment || ['Peso corporal'],
        }),
      });
      setWorkouts((prev) => [res.workout, ...prev]);
      setSubTab('home');
      setSelectedCategory('Todas');
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Erro ao gerar treino personalizado.');
    } finally {
      setGeneratingAI(false);
    }
  };

  const handleCreateCustomWorkout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customTitle.trim() || selectedExerciseIds.length === 0) return;
    setSavingCustom(true);
    try {
      const mainExercises: WorkoutExercise[] = selectedExerciseIds
        .map((id) => EXERCISE_LIBRARY[id])
        .filter(Boolean)
        .map((ex) => ({ ...ex, stage: 'main' as const }));
      const estDuration = Math.max(12, Math.round(mainExercises.length * 4 + 4));
      const estCalories = Math.round(estDuration * 9.5);
      const res = await apiRequest<{ workout: WorkoutProgram }>('/api/workouts/custom', {
        method: 'POST',
        body: JSON.stringify({
          title: customTitle.trim(),
          category: customCategory,
          level: customLevel,
          duration_minutes: estDuration,
          estimated_calories: estCalories,
          exercises: mainExercises,
          muscle_focus: [customCategory],
        }),
      });
      setWorkouts((prev) => [res.workout, ...prev]);
      setCustomTitle('');
      setSubTab('home');
      setSelectedCategory('Todas');
    } finally {
      setSavingCustom(false);
    }
  };

  const handleDeleteCustomWorkout = async (workoutId: string) => {
    await apiRequest(`/api/workouts/${workoutId}`, { method: 'DELETE' });
    setWorkouts((prev) => prev.filter((w) => w.id !== workoutId));
  };

  const handleRequestNotifications = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setNotifFeedback('Notificações do sistema não são suportadas neste navegador; avisos aparecerão dentro do app.');
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      setNotifFeedback('Notificações ativadas com sucesso! Teste enviando um lembrete agora.');
      new Notification('PRATO & TREINO', {
        body: 'Lembretes de treino ativados neste dispositivo.',
      });
    } else {
      setNotifFeedback('Permissão recusada no navegador. Você continuará recebendo lembretes visuais ao abrir o app.');
    }
  };

  // Treino recomendado para hoje com base no plano ativo
  const todayPlanEntry = useMemo(() => {
    if (!trainingPlan) return null;
    return (
      trainingPlan.schedule.find((d) => d.day_number === trainingPlan.current_day) ||
      trainingPlan.schedule.find((d) => !d.is_rest_day) ||
      null
    );
  }, [trainingPlan]);

  const recommendedWorkout = useMemo(() => {
    if (todayPlanEntry && !todayPlanEntry.is_rest_day) {
      const match = workouts.find((w) => w.id === todayPlanEntry.workout_id);
      if (match) return match;
    }
    const prefLevel = preferences?.preferred_level || profile?.workout_level || 'intermediario';
    return (
      workouts.find((w) => w.level === prefLevel && w.category === 'Corpo inteiro') ||
      workouts.find((w) => w.level === prefLevel) ||
      workouts[0] ||
      null
    );
  }, [todayPlanEntry, workouts, preferences, profile]);

  // Filtragem de treinos
  const filteredWorkouts = useMemo(() => {
    const favSet = new Set(preferences?.favorite_exercise_ids || []);
    return workouts.filter((w) => {
      if (selectedCategory !== 'Todas' && w.category !== selectedCategory) return false;
      if (levelFilter !== 'all' && w.level !== levelFilter) return false;
      if (onlyFavorites) {
        const hasFav = [...(w.warmup || []), ...w.exercises, ...(w.cooldown || [])].some((ex) =>
          favSet.has(ex.id)
        );
        if (!hasFav) return false;
      }
      return true;
    });
  }, [workouts, selectedCategory, levelFilter, onlyFavorites, preferences]);

  // Calendário mensal de atividades do mês atual
  const monthCalendar = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstWeekday = new Date(year, month, 1).getDay();
    const activeSet = new Set(stats?.active_dates || []);
    const cells: Array<{ day: number | null; iso?: string; active: boolean; isToday: boolean }> = [];
    for (let i = 0; i < firstWeekday; i++) {
      cells.push({ day: null, active: false, isToday: false });
    }
    const todayDay = now.getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ day: d, iso, active: activeSet.has(iso), isToday: d === todayDay });
    }
    return {
      monthLabel: now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
      cells,
    };
  }, [stats]);

  const mainLibraryExercises = useMemo(
    () => Object.values(EXERCISE_LIBRARY).filter((ex) => ex.stage === 'main'),
    []
  );

  if (loading && workouts.length === 0) {
    return (
      <div className="space-y-4">
        <div className="h-48 animate-pulse rounded-2xl border border-white/8 bg-[#111613]" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl border border-white/8 bg-[#111613]" />
          ))}
        </div>
      </div>
    );
  }

  const totalExercisesInRecommended = recommendedWorkout
    ? (recommendedWorkout.warmup?.length || 0) +
      recommendedWorkout.exercises.length +
      (recommendedWorkout.cooldown?.length || 0)
    : 0;

  return (
    <div className="space-y-6">
      {/* Banner discreto opcional caso as tabelas 002 ainda não tenham sido coladas no Supabase */}
      {migrationPending && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-xs text-amber-100">
          <span>
            Seus treinos já funcionam perfeitamente aqui. Para sincronizar Planos e Lembretes direto no Postgres do Supabase, execute o script complementar <code className="font-mono text-amber-300">002_training_module.sql</code> no SQL Editor.
          </span>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(MIGRATION_002_SNIPPET);
              setSqlCopied(true);
              setTimeout(() => setSqlCopied(false), 3000);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300/40 bg-[#0A0D0B] px-3 py-1.5 font-medium text-amber-200 hover:bg-white/5"
          >
            {sqlCopied ? <Check className="h-3.5 w-3.5 text-[#22C55E]" /> : <Copy className="h-3.5 w-3.5" />}
            {sqlCopied ? 'SQL copiado!' : 'Copiar SQL complementar'}
          </button>
        </div>
      )}

      {/* Sub-navegação do Módulo TREINO */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-white/8 bg-[#111613] p-1">
          {[
            { id: 'home' as const, label: 'Treinar', icon: Dumbbell },
            { id: 'plans' as const, label: 'Planos 7-60d', icon: Layers },
            { id: 'custom' as const, label: 'Personalizar', icon: Sliders },
            { id: 'evolution' as const, label: 'Evolução & Lembretes', icon: Activity },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = subTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSubTab(tab.id)}
                className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                  active ? 'bg-[#22C55E] text-[#06120A]' : 'text-[#9AA8A0] hover:text-white'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3 text-xs text-[#9AA8A0]">
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/8 bg-[#111613] px-3 py-1.5">
            <Award className="h-3.5 w-3.5 text-[#22C55E]" />
            Sequência: <strong className="font-mono text-[#F4F7F5] tabular-nums">{stats?.streak_days || 0}d</strong>
          </span>
          {preferences && (
            <button
              type="button"
              onClick={() => handleUpdatePreferences({ voice_enabled: !preferences.voice_enabled })}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 transition-colors ${
                preferences.voice_enabled
                  ? 'border-[#22C55E]/40 bg-[#22C55E]/12 text-[#22C55E]'
                  : 'border-white/8 bg-[#111613] text-[#8F9E95]'
              }`}
            >
              <Mic className="h-3.5 w-3.5" />
              Voz {preferences.voice_enabled ? 'ativa' : 'muda'}
            </button>
          )}
        </div>
      </div>

      {/* === TAB 1: TELA PRINCIPAL DE TREINAMENTO === */}
      {subTab === 'home' && (
        <div className="space-y-6">
          {/* Hero: Treino Recomendado para Hoje + Progresso Semanal + Calendário */}
          <section className="grid grid-cols-1 gap-5 lg:grid-cols-12">
            {/* Treino Recomendado */}
            <div className="relative flex flex-col justify-between overflow-hidden rounded-2xl border border-[#22C55E]/25 bg-[#111613] p-6 lg:col-span-7">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[#22C55E]">
                    Treino recomendado para hoje
                  </span>
                  {trainingPlan && (
                    <span className="font-mono text-xs text-[#9AA8A0]">
                      Dia {trainingPlan.current_day}/{trainingPlan.duration_days} · {trainingPlan.title}
                    </span>
                  )}
                </div>

                {recommendedWorkout ? (
                  <>
                    <h2 className="mt-2 font-display text-2xl font-bold text-[#F4F7F5] sm:text-3xl">
                      {recommendedWorkout.title}
                    </h2>
                    <p className="mt-2 max-w-xl text-sm text-[#C2CCC6]">
                      {recommendedWorkout.description}
                    </p>

                    <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div className="rounded-xl border border-white/8 bg-[#0B0F0D] p-3">
                        <p className="text-[11px] text-[#8F9E95]">Tempo estimado</p>
                        <p className="mt-1 font-mono text-base font-semibold text-[#F4F7F5] tabular-nums">
                          {recommendedWorkout.duration_minutes} min
                        </p>
                      </div>
                      <div className="rounded-xl border border-white/8 bg-[#0B0F0D] p-3">
                        <p className="text-[11px] text-[#8F9E95]">Exercícios</p>
                        <p className="mt-1 font-mono text-base font-semibold text-[#F4F7F5] tabular-nums">
                          {totalExercisesInRecommended} movs
                        </p>
                      </div>
                      <div className="rounded-xl border border-white/8 bg-[#0B0F0D] p-3">
                        <p className="text-[11px] text-[#8F9E95]">Dificuldade</p>
                        <p className="mt-1 text-base font-semibold text-[#22C55E]">
                          {WORKOUT_LEVEL_LABELS[recommendedWorkout.level]}
                        </p>
                      </div>
                      <div className="rounded-xl border border-white/8 bg-[#0B0F0D] p-3">
                        <p className="text-[11px] text-[#8F9E95]">Gasto estimado</p>
                        <p className="mt-1 font-mono text-base font-semibold text-amber-300 tabular-nums">
                          ~{recommendedWorkout.estimated_calories} kcal
                        </p>
                      </div>
                    </div>
                  </>
                ) : null}
              </div>

              {recommendedWorkout && (
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      handleStartWorkout(
                        recommendedWorkout,
                        trainingPlan
                          ? { planId: trainingPlan.id, dayNumber: trainingPlan.current_day }
                          : null
                      )
                    }
                    className="inline-flex flex-1 items-center justify-center gap-2.5 rounded-xl bg-[#22C55E] px-6 py-3.5 text-sm font-bold tracking-wide text-[#06120A] transition-colors hover:bg-[#16A34A] sm:flex-none"
                  >
                    <Play className="h-4 w-4 fill-current" />
                    INICIAR TREINO
                  </button>
                  <button
                    type="button"
                    onClick={() => setTutorialWorkout(recommendedWorkout)}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/12 bg-[#0B0F0D] px-4 py-3.5 text-xs font-semibold text-[#F4F7F5] transition-colors hover:border-[#22C55E]/50"
                  >
                    <Film className="h-4 w-4 text-[#22C55E]" />
                    Ver modelos 3D
                  </button>
                </div>
              )}
            </div>

            {/* Progresso Semanal & Calendário de Atividades */}
            <div className="flex flex-col justify-between rounded-2xl border border-white/8 bg-[#111613] p-5 lg:col-span-5">
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-[#F4F7F5]">
                    <Calendar className="h-4 w-4 text-[#22C55E]" />
                    Calendário &amp; Frequência Semanal
                  </h3>
                  <span className="font-mono text-xs capitalize text-[#9AA8A0]">
                    {monthCalendar.monthLabel}
                  </span>
                </div>

                {/* Dias da semana e progresso dos últimos 7 dias */}
                <div className="mt-4 grid grid-cols-7 gap-1.5">
                  {(stats?.weekly_series || []).map((day) => {
                    const done = day.sessions > 0;
                    return (
                      <div
                        key={day.date}
                        className={`flex flex-col items-center rounded-xl border py-2 text-center ${
                          done
                            ? 'border-[#22C55E]/40 bg-[#22C55E]/15 text-[#F4F7F5]'
                            : 'border-white/6 bg-[#0B0F0D] text-[#7D8C84]'
                        }`}
                      >
                        <span className="text-[10px] font-medium uppercase">{day.label}</span>
                        <span className="mt-1 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-mono">
                          {done ? <Check className="h-3.5 w-3.5 text-[#22C55E]" /> : '·'}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Mini Calendário Mensal */}
                <div className="mt-4 grid grid-cols-7 gap-1 text-center text-[10px]">
                  {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => (
                    <div key={i} className="py-1 font-medium text-[#7D8C84]">
                      {d}
                    </div>
                  ))}
                  {monthCalendar.cells.map((c, idx) =>
                    c.day === null ? (
                      <div key={idx} />
                    ) : (
                      <div
                        key={c.iso}
                        className={`rounded-md py-1 font-mono tabular-nums ${
                          c.active
                            ? 'bg-[#22C55E] font-bold text-[#06120A]'
                            : c.isToday
                              ? 'border border-[#22C55E]/60 text-[#F4F7F5]'
                              : 'text-[#8F9E95]'
                        }`}
                      >
                        {c.day}
                      </div>
                    )
                  )}
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-white/8 pt-3 text-xs text-[#9AA8A0]">
                <span>
                  Semana: <strong className="font-mono text-[#F4F7F5]">{stats?.weekly_frequency || 0} dias ativos</strong>
                </span>
                <span>
                  Total: <strong className="font-mono text-[#22C55E]">{stats?.total_workouts || 0} treinos</strong>
                </span>
              </div>
            </div>
          </section>

          {/* 10 Categorias de Exercícios */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-lg font-semibold text-[#F4F7F5]">Categorias de treino</h3>
              <button
                type="button"
                onClick={() => setSelectedCategory('Todas')}
                className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                  selectedCategory === 'Todas'
                    ? 'bg-[#22C55E] text-[#06120A]'
                    : 'border border-white/10 text-[#C2CCC6] hover:bg-white/5'
                }`}
              >
                Ver todas ({workouts.length})
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
              {WORKOUT_CATEGORIES.map((cat) => {
                const count = workouts.filter((w) => w.category === cat.name).length;
                const active = selectedCategory === cat.name;
                return (
                  <button
                    key={cat.name}
                    type="button"
                    onClick={() => setSelectedCategory(active ? 'Todas' : cat.name)}
                    className={`flex flex-col justify-between rounded-2xl border p-4 text-left transition-colors ${
                      active
                        ? 'border-[#22C55E] bg-[#22C55E]/15'
                        : 'border-white/8 bg-[#111613] hover:border-white/20'
                    }`}
                  >
                    <div>
                      <p className={`text-sm font-semibold ${active ? 'text-[#22C55E]' : 'text-[#F4F7F5]'}`}>
                        {cat.name}
                      </p>
                      <p className="mt-1 line-clamp-2 text-[11px] text-[#8F9E95]">{cat.tagline}</p>
                    </div>
                    <p className="mt-3 font-mono text-[11px] text-[#22C55E] tabular-nums">
                      {count} {count === 1 ? 'treino' : 'treinos'}
                    </p>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Filtros + Lista de Treinos */}
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-display text-lg font-semibold text-[#F4F7F5]">
                {selectedCategory === 'Todas' ? 'Todos os programas disponíveis' : `Categoria: ${selectedCategory}`}
              </h3>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setOnlyFavorites((v) => !v)}
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors ${
                    onlyFavorites
                      ? 'border-amber-400/50 bg-amber-400/15 text-amber-300'
                      : 'border-white/10 bg-[#111613] text-[#9AA8A0] hover:text-white'
                  }`}
                >
                  <Star className={`h-3.5 w-3.5 ${onlyFavorites ? 'fill-amber-300' : ''}`} />
                  Favoritos
                </button>

                <div className="flex items-center gap-1 rounded-xl border border-white/8 bg-[#111613] p-1">
                  {(['all', 'iniciante', 'intermediario', 'avancado'] as const).map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setLevelFilter(lvl)}
                      className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                        levelFilter === lvl
                          ? 'bg-[#22C55E] text-[#06120A]'
                          : 'text-[#9AA8A0] hover:text-white'
                      }`}
                    >
                      {lvl === 'all' ? 'Todos' : WORKOUT_LEVEL_LABELS[lvl]}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {filteredWorkouts.length === 0 ? (
              <div className="rounded-2xl border border-white/8 bg-[#111613] p-8 text-center text-sm text-[#8F9E95]">
                Nenhum programa encontrado para este filtro. Limpe o filtro para ver todos os treinos.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
                {filteredWorkouts.map((w) => {
                  const totalMoves =
                    (w.warmup?.length || 0) + w.exercises.length + (w.cooldown?.length || 0);
                  return (
                    <article
                      key={w.id}
                      className="flex flex-col justify-between rounded-2xl border border-white/8 bg-[#111613] p-6 transition-colors hover:border-white/20"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 text-xs text-[#8F9E95]">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-[#22C55E]">{w.category}</span>
                            <span aria-hidden="true">·</span>
                            <span>{WORKOUT_LEVEL_LABELS[w.level]}</span>
                            {(w.is_custom || w.is_ai_generated) && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="text-amber-300">{w.is_ai_generated ? 'IA' : 'Meu'}</span>
                              </>
                            )}
                          </div>
                          {(w.is_custom || w.is_ai_generated) && w.user_id && (
                            <button
                              type="button"
                              onClick={() => handleDeleteCustomWorkout(w.id)}
                              className="rounded p-1 text-[#7D8C84] hover:text-red-400"
                              title="Excluir treino personalizado"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>

                        <h4 className="mt-2 font-display text-lg font-semibold text-[#F4F7F5]">{w.title}</h4>
                        <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-[#9AA8A0]">
                          {w.description}
                        </p>

                        <div className="mt-4 flex items-center gap-4 border-t border-white/8 pt-3 text-xs text-[#C2CCC6]">
                          <span className="inline-flex items-center gap-1.5 font-mono tabular-nums">
                            <Clock className="h-3.5 w-3.5 text-[#8F9E95]" />
                            {w.duration_minutes} min
                          </span>
                          <span className="inline-flex items-center gap-1.5 font-mono tabular-nums">
                            <Flame className="h-3.5 w-3.5 text-amber-400" />
                            ~{w.estimated_calories} kcal
                          </span>
                          <span className="ml-auto text-[#8F9E95] tabular-nums">
                            {totalMoves} movs
                          </span>
                        </div>
                      </div>

                      <div className="mt-5 grid grid-cols-2 gap-2.5">
                        <button
                          type="button"
                          onClick={() => setTutorialWorkout(w)}
                          className="flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-[#0C100E] px-3 py-2.5 text-xs font-medium text-[#C2CCC6] transition-colors hover:border-[#22C55E]/40 hover:text-[#22C55E]"
                        >
                          <Film className="h-3.5 w-3.5 text-[#22C55E]" />
                          Tutoriais 3D
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStartWorkout(w)}
                          className="flex items-center justify-center gap-1.5 rounded-xl bg-white/8 px-3 py-2.5 text-xs font-semibold text-[#F4F7F5] transition-colors hover:bg-[#22C55E] hover:text-[#06120A]"
                        >
                          <Play className="h-3.5 w-3.5 fill-current" />
                          Iniciar
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {/* === TAB 2: PLANOS DE TREINAMENTO (7, 14, 30, 60 DIAS) === */}
      {subTab === 'plans' && (
        <div className="space-y-6">
          <section className="rounded-2xl border border-white/8 bg-[#111613] p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-xl font-semibold text-[#F4F7F5]">
                  Planos Progressivos de 7 a 60 Dias
                </h2>
                <p className="mt-1 text-xs text-[#9AA8A0]">
                  Cada plano organiza dias de treino com aquecimento + principais + alongamento, evolução gradual de volume e dias estratégicos de recuperação.
                </p>
              </div>
              {preferences && (
                <div className="rounded-xl border border-[#22C55E]/30 bg-[#22C55E]/10 px-3.5 py-2 text-xs">
                  <span className="text-[#9AA8A0]">Adaptação automática: </span>
                  <strong className="font-mono text-[#22C55E]">{preferences.adaptive_multiplier.toFixed(2)}x</strong>
                </div>
              )}
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#C2CCC6]">Duração do plano</label>
                <div className="grid grid-cols-4 gap-2">
                  {([7, 14, 30, 60] as const).map((days) => (
                    <button
                      key={days}
                      type="button"
                      onClick={() => setPlanDaysChoice(days)}
                      className={`rounded-xl border py-2.5 font-mono text-xs font-semibold transition-colors ${
                        planDaysChoice === days
                          ? 'border-[#22C55E] bg-[#22C55E]/15 text-[#22C55E]'
                          : 'border-white/10 bg-[#0A0D0B] text-[#9AA8A0] hover:text-white'
                      }`}
                    >
                      {days}d
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#C2CCC6]">Nível de dificuldade</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['iniciante', 'intermediario', 'avancado'] as const).map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setPlanLevelChoice(lvl)}
                      className={`rounded-xl border py-2.5 text-xs font-semibold transition-colors ${
                        planLevelChoice === lvl
                          ? 'border-[#22C55E] bg-[#22C55E]/15 text-[#22C55E]'
                          : 'border-white/10 bg-[#0A0D0B] text-[#9AA8A0] hover:text-white'
                      }`}
                    >
                      {WORKOUT_LEVEL_LABELS[lvl]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-end">
                <button
                  type="button"
                  onClick={handleCreatePlan}
                  disabled={creatingPlan}
                  className="w-full rounded-xl bg-[#22C55E] px-5 py-2.5 text-sm font-semibold text-[#06120A] transition-colors hover:bg-[#16A34A] disabled:opacity-60"
                >
                  {creatingPlan ? 'Montando plano...' : `Ativar plano de ${planDaysChoice} dias`}
                </button>
              </div>
            </div>
          </section>

          {trainingPlan && (
            <section className="rounded-2xl border border-white/8 bg-[#111613] p-6">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 pb-4">
                <div>
                  <h3 className="font-display text-lg font-semibold text-[#F4F7F5]">{trainingPlan.title}</h3>
                  <p className="text-xs text-[#8F9E95]">
                    {trainingPlan.completed_days.length} de {trainingPlan.duration_days} dias concluídos · Dia atual: {trainingPlan.current_day}
                  </p>
                </div>
                <div className="w-48">
                  <div className="h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full bg-[#22C55E]"
                      style={{
                        width: `${Math.round((trainingPlan.completed_days.length / trainingPlan.duration_days) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {trainingPlan.schedule.map((day) => {
                  const isDone = trainingPlan.completed_days.includes(day.day_number);
                  const isCurrent = day.day_number === trainingPlan.current_day;
                  const targetWorkout = workouts.find((w) => w.id === day.workout_id);

                  return (
                    <div
                      key={day.day_number}
                      className={`flex flex-col justify-between rounded-xl border p-4 transition-colors ${
                        isCurrent
                          ? 'border-[#22C55E] bg-[#22C55E]/10'
                          : isDone
                            ? 'border-[#22C55E]/30 bg-[#0E1611]'
                            : 'border-white/8 bg-[#0B0F0D]'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-mono font-bold text-[#22C55E]">DIA {day.day_number}</span>
                          {isDone ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#22C55E]">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Concluído
                            </span>
                          ) : day.is_rest_day ? (
                            <span className="text-[11px] text-amber-300">Descanso ativo</span>
                          ) : (
                            <span className="font-mono text-[11px] text-[#8F9E95]">
                              {Math.round(day.intensity_multiplier * 100)}% carga
                            </span>
                          )}
                        </div>
                        <p className="mt-1.5 text-sm font-semibold text-[#F4F7F5]">{day.title}</p>
                        <p className="mt-1 text-[11px] text-[#8F9E95]">{day.notes}</p>
                      </div>

                      <div className="mt-3 flex items-center justify-between border-t border-white/6 pt-2.5 text-xs">
                        <span className="font-mono text-[#9AA8A0]">
                          {day.duration_minutes} min · ~{day.estimated_calories} kcal
                        </span>
                        {targetWorkout && (
                          <button
                            type="button"
                            onClick={() =>
                              handleStartWorkout(targetWorkout, {
                                planId: trainingPlan.id,
                                dayNumber: day.day_number,
                              })
                            }
                            className="rounded-lg bg-[#22C55E] px-2.5 py-1 text-[11px] font-semibold text-[#06120A] hover:bg-[#16A34A]"
                          >
                            Treinar
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}

      {/* === TAB 3: PERSONALIZAÇÃO & TREINOS CUSTOMIZADOS === */}
      {subTab === 'custom' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Preferências Rápidas de Treino */}
          {preferences && (
            <section className="rounded-2xl border border-white/8 bg-[#111613] p-6 lg:col-span-5">
              <h2 className="font-display text-lg font-semibold text-[#F4F7F5]">Preferências de Treino</h2>
              <p className="mt-1 text-xs text-[#8F9E95]">
                Ajuste nível, contagem inicial, descanso automático e áudio guia conforme sua rotina.
              </p>

              <div className="mt-5 space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-[#C2CCC6]">Nível preferido</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['iniciante', 'intermediario', 'avancado'] as const).map((lvl) => (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => handleUpdatePreferences({ preferred_level: lvl })}
                        className={`rounded-xl border py-2 text-xs font-semibold ${
                          preferences.preferred_level === lvl
                            ? 'border-[#22C55E] bg-[#22C55E]/15 text-[#22C55E]'
                            : 'border-white/10 bg-[#0A0D0B] text-[#9AA8A0]'
                        }`}
                      >
                        {WORKOUT_LEVEL_LABELS[lvl]}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="mb-1 block text-xs text-[#C2CCC6]">Duração alvo</label>
                    <select
                      value={preferences.preferred_duration_min}
                      onChange={(e) =>
                        handleUpdatePreferences({ preferred_duration_min: Number(e.target.value) })
                      }
                      className="w-full rounded-xl border border-white/10 bg-[#0A0D0B] px-2.5 py-2 font-mono text-xs text-[#F4F7F5]"
                    >
                      {[15, 20, 25, 35, 45].map((m) => (
                        <option key={m} value={m}>
                          {m} min
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-[#C2CCC6]">Preparação</label>
                    <select
                      value={preferences.countdown_seconds}
                      onChange={(e) =>
                        handleUpdatePreferences({ countdown_seconds: Number(e.target.value) })
                      }
                      className="w-full rounded-xl border border-white/10 bg-[#0A0D0B] px-2.5 py-2 font-mono text-xs text-[#F4F7F5]"
                    >
                      {[3, 5, 8, 10].map((s) => (
                        <option key={s} value={s}>
                          {s} seg
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-[#C2CCC6]">Descanso padrão</label>
                    <select
                      value={preferences.rest_seconds}
                      onChange={(e) => handleUpdatePreferences({ rest_seconds: Number(e.target.value) })}
                      className="w-full rounded-xl border border-white/10 bg-[#0A0D0B] px-2.5 py-2 font-mono text-xs text-[#F4F7F5]"
                    >
                      {[15, 20, 25, 30, 45].map((s) => (
                        <option key={s} value={s}>
                          {s} seg
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Favoritos */}
                <div className="border-t border-white/8 pt-4">
                  <p className="text-xs font-semibold text-[#F4F7F5]">
                    Exercícios Favoritos ({preferences.favorite_exercise_ids.length})
                  </p>
                  {preferences.favorite_exercise_ids.length === 0 ? (
                    <p className="mt-1 text-xs text-[#8F9E95]">
                      Toque na estrela de qualquer exercício nos tutoriais ou durante o treino para fixá-lo aqui.
                    </p>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {preferences.favorite_exercise_ids.map((id) => {
                        const ex = EXERCISE_LIBRARY[id];
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => handleToggleFavorite(id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-amber-400/35 bg-amber-400/10 px-2.5 py-1 text-[11px] text-amber-200"
                          >
                            <Star className="h-3 w-3 fill-amber-300" />
                            {ex ? ex.name : id}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* Construtor Manual de Treino */}
          <form
            onSubmit={handleCreateCustomWorkout}
            className="space-y-4 rounded-2xl border border-white/8 bg-[#111613] p-6 lg:col-span-7"
          >
            <h2 className="font-display text-lg font-semibold text-[#F4F7F5]">Montar meu próprio treino</h2>
            <p className="text-xs text-[#8F9E95]">
              Escolha os exercícios com modelo 3D, defina a categoria e salve na sua conta com aquecimento e alongamento inclusos.
            </p>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="sm:col-span-1">
                <label className="mb-1 block text-xs text-[#C2CCC6]">Nome do treino</label>
                <input
                  type="text"
                  required
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  placeholder="Ex: Meu Treino de Core"
                  className="w-full rounded-xl border border-white/10 bg-[#0A0D0B] px-3 py-2 text-xs text-[#F4F7F5] focus:border-[#22C55E] focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-[#C2CCC6]">Categoria</label>
                <select
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value as WorkoutCategoryName)}
                  className="w-full rounded-xl border border-white/10 bg-[#0A0D0B] px-3 py-2 text-xs text-[#F4F7F5]"
                >
                  {WORKOUT_CATEGORIES.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs text-[#C2CCC6]">Nível</label>
                <select
                  value={customLevel}
                  onChange={(e) => setCustomLevel(e.target.value as WorkoutLevel)}
                  className="w-full rounded-xl border border-white/10 bg-[#0A0D0B] px-3 py-2 text-xs text-[#F4F7F5]"
                >
                  <option value="iniciante">Iniciante</option>
                  <option value="intermediario">Intermediário</option>
                  <option value="avancado">Avançado</option>
                </select>
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium text-[#C2CCC6]">
                Selecione os exercícios principais ({selectedExerciseIds.length} selecionados):
              </p>
              <div className="grid max-h-64 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                {mainLibraryExercises.map((ex) => {
                  const picked = selectedExerciseIds.includes(ex.id);
                  return (
                    <button
                      key={ex.id}
                      type="button"
                      onClick={() =>
                        setSelectedExerciseIds((prev) =>
                          prev.includes(ex.id) ? prev.filter((id) => id !== ex.id) : [...prev, ex.id]
                        )
                      }
                      className={`flex items-center justify-between rounded-xl border px-3 py-2 text-left text-xs transition-colors ${
                        picked
                          ? 'border-[#22C55E] bg-[#22C55E]/15 text-[#F4F7F5]'
                          : 'border-white/8 bg-[#0A0D0B] text-[#9AA8A0] hover:text-white'
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="truncate font-medium">{ex.name}</div>
                        <div className="truncate text-[10px] text-[#7D8C84]">{ex.muscle_group}</div>
                      </div>
                      {picked && <Check className="h-3.5 w-3.5 shrink-0 text-[#22C55E]" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={savingCustom || !customTitle.trim() || selectedExerciseIds.length === 0}
                className="inline-flex items-center gap-2 rounded-xl bg-[#22C55E] px-5 py-2.5 text-sm font-semibold text-[#06120A] hover:bg-[#16A34A] disabled:opacity-60"
              >
                <Plus className="h-4 w-4" />
                {savingCustom ? 'Salvando treino...' : 'Salvar treino personalizado'}
              </button>
            </div>
          </form>

          {/* Gerador com Gemini IA */}
          <form
            onSubmit={handleGenerateWorkoutAI}
            className="flex flex-col justify-between rounded-2xl border border-white/8 bg-[#111613] p-6 lg:col-span-12"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-display text-lg font-semibold text-[#F4F7F5]">
                  Gerar treino completo com Inteligência Artificial (Gemini)
                </h3>
                <p className="mt-1 text-xs text-[#8F9E95]">
                  Cria automaticamente aquecimento, bloco principal com demonstrações 3D e alongamento final.
                </p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-4">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs text-[#C2CCC6]">Objetivo ou grupo muscular</label>
                <input
                  type="text"
                  required
                  value={aiFocus}
                  onChange={(e) => setAiFocus(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-[#0A0D0B] px-3.5 py-2.5 text-sm text-[#F4F7F5] focus:border-[#22C55E] focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-[#C2CCC6]">Duração</label>
                <select
                  value={aiDuration}
                  onChange={(e) => setAiDuration(Number(e.target.value))}
                  className="w-full rounded-xl border border-white/10 bg-[#0A0D0B] px-3.5 py-2.5 font-mono text-sm text-[#F4F7F5]"
                >
                  <option value={15}>15 min</option>
                  <option value={20}>20 min</option>
                  <option value={25}>25 min</option>
                  <option value={35}>35 min</option>
                  <option value={45}>45 min</option>
                </select>
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={generatingAI}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#22C55E] px-5 py-2.5 text-sm font-semibold text-[#06120A] hover:bg-[#16A34A] disabled:opacity-60"
                >
                  <Sparkles className="h-4 w-4" />
                  {generatingAI ? 'Gerando...' : 'Gerar com Gemini'}
                </button>
              </div>
            </div>

            {genError && (
              <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-200">
                {genError}
              </p>
            )}
          </form>
        </div>
      )}

      {/* === TAB 4: EVOLUÇÃO, GRÁFICOS & LEMBRETES === */}
      {subTab === 'evolution' && (
        <div className="space-y-6">
          {/* KPIs */}
          <section className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            {[
              { label: 'Treinos concluídos', value: `${stats?.total_workouts || 0}` },
              { label: 'Tempo ativo', value: `${stats?.total_minutes || 0} min` },
              { label: 'Exercícios feitos', value: `${stats?.total_exercises || 0}` },
              { label: 'Frequência semanal', value: `${stats?.weekly_frequency || 0} dias` },
              { label: 'Sequência ativa', value: `${stats?.streak_days || 0} dias` },
            ].map((kpi) => (
              <div key={kpi.label} className="rounded-2xl border border-white/8 bg-[#111613] p-4">
                <p className="text-xs text-[#8F9E95]">{kpi.label}</p>
                <p className="mt-1 font-mono text-2xl font-bold text-[#F4F7F5] tabular-nums">{kpi.value}</p>
              </div>
            ))}
          </section>

          {/* Gráficos Semanais & Mensais */}
          <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/8 bg-[#111613] p-6">
              <h3 className="mb-3 font-display text-base font-semibold text-[#F4F7F5]">
                Atividade Semanal (Últimos 7 dias)
              </h3>
              <WeeklyWorkoutBarChart data={stats?.weekly_series || []} />
            </div>

            <div className="rounded-2xl border border-white/8 bg-[#111613] p-6">
              <h3 className="mb-3 font-display text-base font-semibold text-[#F4F7F5]">
                Volume Mensal (Últimas 4 semanas)
              </h3>
              <MonthlyWorkoutChart data={stats?.monthly_series || []} />
            </div>
          </section>

          {/* Peso + Lembretes */}
          <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="rounded-2xl border border-white/8 bg-[#111613] p-6 lg:col-span-6">
              <h3 className="mb-3 font-display text-base font-semibold text-[#F4F7F5]">
                Evolução de Peso Corporal
              </h3>
              <WeightEvolutionChart
                data={weights}
                targetWeight={profile?.target_weight_kg || 72}
              />
            </div>

            {preferences && (
              <div className="rounded-2xl border border-white/8 bg-[#111613] p-6 lg:col-span-6">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="flex items-center gap-2 font-display text-base font-semibold text-[#F4F7F5]">
                      <Bell className="h-4 w-4 text-[#22C55E]" />
                      Lembretes Personalizáveis
                    </h3>
                    <p className="mt-0.5 text-xs text-[#8F9E95]">
                      Configure horário de treino, frequência semanal e aviso de descanso.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleUpdatePreferences({ reminder_enabled: !preferences.reminder_enabled })}
                    className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold ${
                      preferences.reminder_enabled
                        ? 'bg-[#22C55E] text-[#06120A]'
                        : 'border border-white/10 text-[#9AA8A0]'
                    }`}
                  >
                    {preferences.reminder_enabled ? 'Ativado' : 'Desativado'}
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs text-[#C2CCC6]">Horário do treino</label>
                    <input
                      type="time"
                      value={preferences.reminder_time}
                      onChange={(e) => handleUpdatePreferences({ reminder_time: e.target.value })}
                      className="w-full rounded-xl border border-white/10 bg-[#0A0D0B] px-3 py-2 font-mono text-xs text-[#F4F7F5]"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-[#C2CCC6]">Horário de descanso</label>
                    <input
                      type="time"
                      value={preferences.rest_time_reminder}
                      onChange={(e) => handleUpdatePreferences({ rest_time_reminder: e.target.value })}
                      className="w-full rounded-xl border border-white/10 bg-[#0A0D0B] px-3 py-2 font-mono text-xs text-[#F4F7F5]"
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label className="mb-1 block text-xs text-[#C2CCC6]">Frequência</label>
                    <select
                      value={preferences.reminder_frequency}
                      onChange={(e) =>
                        handleUpdatePreferences({
                          reminder_frequency: e.target.value as WorkoutPreferences['reminder_frequency'],
                        })
                      }
                      className="w-full rounded-xl border border-white/10 bg-[#0A0D0B] px-2.5 py-2 text-xs text-[#F4F7F5]"
                    >
                      <option value="diario">Diário</option>
                      <option value="dias_selecionados">Dias selecionados</option>
                      <option value="alternado">Dia sim, dia não</option>
                    </select>
                  </div>
                </div>

                <div className="mt-4">
                  <p className="mb-2 text-xs text-[#C2CCC6]">Dias da semana</p>
                  <div className="grid grid-cols-7 gap-1.5">
                    {WEEKDAY_LABELS.map((d) => {
                      const active = preferences.reminder_days.includes(d.id);
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => {
                            const nextDays = active
                              ? preferences.reminder_days.filter((x) => x !== d.id)
                              : [...preferences.reminder_days, d.id].sort((a, b) => a - b);
                            handleUpdatePreferences({ reminder_days: nextDays });
                          }}
                          className={`rounded-lg border py-1.5 text-[11px] font-medium ${
                            active
                              ? 'border-[#22C55E] bg-[#22C55E]/15 text-[#22C55E]'
                              : 'border-white/10 bg-[#0A0D0B] text-[#8F9E95]'
                          }`}
                        >
                          {d.short}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/8 pt-3">
                  <button
                    type="button"
                    onClick={handleRequestNotifications}
                    className="rounded-xl border border-[#22C55E]/40 px-3.5 py-2 text-xs font-medium text-[#22C55E] hover:bg-[#22C55E]/10"
                  >
                    Ativar / testar notificações do sistema
                  </button>
                </div>

                {notifFeedback && (
                  <p className="mt-2.5 text-xs text-[#22C55E]">{notifFeedback}</p>
                )}
              </div>
            )}
          </section>

          {/* Histórico Completo */}
          <section className="rounded-2xl border border-white/8 bg-[#111613] p-6">
            <h3 className="font-display text-lg font-semibold text-[#F4F7F5]">Histórico de sessões concluídas</h3>
            {logs.length === 0 ? (
              <p className="mt-3 text-sm text-[#8F9E95]">
                Nenhum treino registrado ainda. Conclua seu primeiro treino hoje mesmo!
              </p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/8 text-xs text-[#8F9E95]">
                      <th className="py-2.5 pr-4 font-medium">Data</th>
                      <th className="py-2.5 pr-4 font-medium">Treino</th>
                      <th className="py-2.5 pr-4 text-right font-medium">Exercícios</th>
                      <th className="py-2.5 pr-4 text-right font-medium">Duração</th>
                      <th className="py-2.5 pr-4 text-right font-medium">Sensação</th>
                      <th className="py-2.5 text-right font-medium">Calorias</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/6">
                    {logs.slice(0, 20).map((log) => (
                      <tr key={log.id} className="hover:bg-white/[0.02]">
                        <td className="py-2.5 pr-4 font-mono text-xs text-[#9AA8A0] tabular-nums">
                          {formatDateBR(log.date)}
                        </td>
                        <td className="py-2.5 pr-4 font-medium text-[#F4F7F5]">{log.workout_title}</td>
                        <td className="py-2.5 pr-4 text-right font-mono text-xs text-[#9AA8A0] tabular-nums">
                          {log.exercises_completed}
                        </td>
                        <td className="py-2.5 pr-4 text-right font-mono text-xs text-[#C2CCC6] tabular-nums">
                          {log.duration_minutes} min
                        </td>
                        <td className="py-2.5 pr-4 text-right text-xs capitalize text-[#9AA8A0]">
                          {log.perceived_difficulty || 'ideal'}
                        </td>
                        <td className="py-2.5 text-right font-mono text-xs font-medium text-[#22C55E] tabular-nums">
                          {log.calories_burned} kcal
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {/* Modais */}
      {tutorialWorkout && (
        <WorkoutTutorialModal
          workout={tutorialWorkout}
          favoriteIds={preferences?.favorite_exercise_ids || []}
          onToggleFavorite={handleToggleFavorite}
          onClose={() => setTutorialWorkout(null)}
          onStartWorkout={() => handleStartWorkout(tutorialWorkout)}
        />
      )}

      {activeWorkout && preferences && (
        <WorkoutPlayerModal
          workout={activeWorkout}
          preferences={preferences}
          planContext={activePlanContext}
          onUpdatePreferences={handleUpdatePreferences}
          onClose={() => {
            setActiveWorkout(null);
            setActivePlanContext(null);
          }}
          onComplete={(sessionStats) => handleCompleteWorkout(activeWorkout, sessionStats)}
        />
      )}
    </div>
  );
}
