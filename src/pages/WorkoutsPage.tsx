import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Award,
  Bell,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Copy,
  Dumbbell,
  Film,
  Flame,
  Layers,
  Mic,
  Play,
  Plus,
  Settings,
  Sliders,
  Sparkles,
  Star,
  Trash2,
} from 'lucide-react';
import heroAmberImg from '../assets/images/workout_hero_amber_1795211659230.jpg';
import heroMintImg from '../assets/images/workout_hero_mint_1795211659190.jpg';
import squatAmberImg from '../assets/images/workout_squat_amber_1795211660002.jpg';
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
import { EXERCISE_LIBRARY, pickExercise, WORKOUT_CATEGORIES } from '../database/exerciseLibrary';
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
  const [prototypeActive, setPrototypeActive] = useState(false);
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

  // Lembretes Feedback & Erros
  const [notifFeedback, setNotifFeedback] = useState<string | null>(null);
  const [hubError, setHubError] = useState<string | null>(null);

  const loadHub = useCallback(async () => {
    setLoading(true);
    setHubError(null);
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
    } catch (err) {
      setHubError(err instanceof Error ? err.message : 'Não foi possível carregar os treinos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHub();
  }, [loadHub]);

  const handleUpdatePreferences = async (patch: Partial<WorkoutPreferences>) => {
    try {
      setHubError(null);
      const res = await apiRequest<{ preferences: WorkoutPreferences }>('/api/training/preferences', {
        method: 'PUT',
        body: JSON.stringify(patch),
      });
      setPreferences(res.preferences);
    } catch (err) {
      setHubError(err instanceof Error ? err.message : 'Não foi possível atualizar preferências.');
    }
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
    setPrototypeActive(false);
    setActivePlanContext(planCtx);
    setActiveWorkout(workout);
  };

  const prototypeExercises = useMemo(
    () => [
      pickExercise('main-squat', {
        name: 'Agachamento (Squat)',
        sets: 1,
        reps_or_duration: '10 reps',
        duration_seconds: 30,
        rest_seconds: 12,
      }),
      pickExercise('main-pushup', {
        name: 'Flexão de braço (Push-up)',
        sets: 1,
        reps_or_duration: '10 reps',
        duration_seconds: 30,
        rest_seconds: 12,
      }),
      pickExercise('main-crunch', {
        name: 'Abdominal tradicional (Crunch)',
        sets: 1,
        reps_or_duration: '12 reps',
        duration_seconds: 35,
        rest_seconds: 12,
      }),
    ],
    []
  );

  const handleStartPrototype = (startIndex = 0) => {
    const ordered =
      startIndex > 0
        ? [...prototypeExercises.slice(startIndex), ...prototypeExercises.slice(0, startIndex)]
        : prototypeExercises;
    const protoWorkout: WorkoutProgram = {
      id: 'proto-3-exercicios',
      user_id: null,
      title: 'Protótipo · 3 Demonstrações',
      category: 'Corpo inteiro',
      level: 'iniciante',
      duration_minutes: 4,
      estimated_calories: 45,
      equipment: ['Peso corporal', 'Tapete'],
      muscle_focus: ['Quadríceps', 'Peito', 'Abdômen'],
      description: 'Demonstrações iniciais em 2D vetorial com contagem regressiva de 3s e repetições sincronizadas.',
      warmup: [],
      exercises: ordered,
      cooldown: [],
    };
    setPrototypeActive(true);
    setActivePlanContext(null);
    setActiveWorkout(protoWorkout);
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
    try {
      setHubError(null);
      await apiRequest('/api/workout-logs', {
        method: 'POST',
        body: JSON.stringify({
          workout_id: workout.id,
          workout_title: workout.title,
          ...sessionStats,
        }),
      });
      await loadHub();
    } catch (err) {
      setHubError(err instanceof Error ? err.message : 'Erro ao registrar treino concluído.');
    }
  };

  const handleCreatePlan = async () => {
    setCreatingPlan(true);
    setHubError(null);
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
    } catch (err) {
      setHubError(err instanceof Error ? err.message : 'Não foi possível criar o plano de treino.');
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
    } catch (err) {
      setHubError(err instanceof Error ? err.message : 'Não foi possível salvar o treino personalizado.');
    } finally {
      setSavingCustom(false);
    }
  };

  const handleDeleteCustomWorkout = async (workoutId: string) => {
    try {
      setHubError(null);
      await apiRequest(`/api/workouts/${workoutId}`, { method: 'DELETE' });
      setWorkouts((prev) => prev.filter((w) => w.id !== workoutId));
    } catch (err) {
      setHubError(err instanceof Error ? err.message : 'Não foi possível excluir o treino.');
    }
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
        <div className="h-48 animate-pulse rounded-3xl border border-[#E1EEE9] bg-white" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-3xl border border-[#E1EEE9] bg-white" />
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
      {hubError && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
          <span>{hubError}</span>
          <button
            type="button"
            onClick={() => void loadHub()}
            className="rounded-xl border border-red-200 bg-white px-3 py-1.5 font-semibold text-red-700 hover:bg-red-100"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* Banner discreto opcional caso as tabelas 002 ainda não tenham sido coladas no Supabase */}
      {migrationPending && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#F7D79C] bg-[#FFF8EB] px-4 py-3 text-xs text-[#9A5B13]">
          <span>
            Seus treinos já funcionam perfeitamente aqui. Para sincronizar Planos e Lembretes direto no Postgres do Supabase, execute o script complementar <code className="font-mono font-semibold text-[#D97706]">002_training_module.sql</code> no SQL Editor.
          </span>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(MIGRATION_002_SNIPPET);
              setSqlCopied(true);
              setTimeout(() => setSqlCopied(false), 3000);
            }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#F7D79C] bg-white px-3 py-1.5 font-semibold text-[#D97706] hover:bg-[#FFF4E2]"
          >
            {sqlCopied ? <Check className="h-3.5 w-3.5 text-[#0C947E]" /> : <Copy className="h-3.5 w-3.5" />}
            {sqlCopied ? 'SQL copiado!' : 'Copiar SQL complementar'}
          </button>
        </div>
      )}

      {/* Sub-navegação do Módulo TREINO */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex w-full items-center gap-1.5 overflow-x-auto rounded-2xl border border-[#DCECE6] bg-white/95 p-1.5 shadow-sm no-scrollbar sm:w-auto">
          {[
            { id: 'home' as const, label: 'Treinar', icon: Dumbbell },
            { id: 'plans' as const, label: 'Planos 7-60d', icon: Layers },
            { id: 'custom' as const, label: 'Personalizar', icon: Sliders },
            { id: 'evolution' as const, label: 'Evolução', icon: Activity },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = subTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSubTab(tab.id)}
                className={`inline-flex min-h-[40px] shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                  active ? 'bg-[#15C8AA] text-[#062924] shadow-sm' : 'text-[#4B6B68] hover:bg-[#F2F9F6] hover:text-[#0F2A2A]'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-2.5 text-xs text-[#4B6B68] sm:justify-end">
          <span className="inline-flex min-h-[40px] items-center gap-1.5 rounded-2xl border border-[#E1EEE9] bg-white px-4 py-1.5 shadow-sm">
            <Award className="h-4 w-4 text-[#F59E2D]" />
            Sequência: <strong className="font-mono font-bold text-[#D97706] tabular-nums">{stats?.streak_days || 0}d</strong>
          </span>
          {preferences && (
            <button
              type="button"
              onClick={() => handleUpdatePreferences({ voice_enabled: !preferences.voice_enabled })}
              className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-2xl border px-4 py-1.5 font-medium shadow-sm transition-colors ${
                preferences.voice_enabled
                  ? 'border-[#BCE6DC] bg-white text-[#0F2A2A] hover:bg-[#F4FAF7]'
                  : 'border-[#E1EEE9] bg-white text-[#5C7B79]'
              }`}
            >
              <Mic className={`h-4 w-4 ${preferences.voice_enabled ? 'text-[#0C947E]' : 'text-[#648482]'}`} />
              Voz {preferences.voice_enabled ? 'ativa' : 'muda'}
            </button>
          )}
        </div>
      </div>

      {/* === TAB 1: TELA PRINCIPAL DE TREINAMENTO === */}
      {subTab === 'home' && (
        <div className="space-y-6">
          {/* Grade Principal: Coluna Esquerda (Hero + Recomendado) + Coluna Direita (Calendário + Gráfico Treino + Resumo) */}
          <section className="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:items-start">
            {/* Coluna Esquerda (8 cols) */}
            <div className="space-y-5 lg:col-span-8">
              {/* Card Principal: Iniciar Treino + 2 Previews Visuais + Botão Largo + 3 Mini Cards */}
              <div className="rounded-3xl border border-[#E1EEE9] bg-white p-5 shadow-[0_12px_32px_-16px_rgba(15,42,42,0.1)] sm:p-6">
                <div className="grid grid-cols-1 gap-5 md:grid-cols-12 md:items-center">
                  <div className="md:col-span-6">
                    <span className="inline-block rounded-xl bg-[#E3F7F2] px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[#0C947E]">
                      Protótipo 2D Interativo
                    </span>
                    <h2 className="mt-2.5 font-display text-3xl font-bold tracking-tight text-[#0F2A2A]">
                      Iniciar Treino
                    </h2>
                    <p className="mt-2 text-xs leading-relaxed text-[#4B6B68] sm:text-sm">
                      Teste o personagem 2D articulado em tamanho grande com contador sincronizado, temporizador e tela de descanso.
                    </p>
                  </div>

                  {/* Dois cards visuais lado a lado no topo direito */}
                  <div className="grid grid-cols-2 gap-3 md:col-span-6">
                    <button
                      type="button"
                      onClick={() => handleStartPrototype(0)}
                      className="group relative h-36 overflow-hidden rounded-2xl bg-gradient-to-br from-[#FFB03B] to-[#F58516] text-left shadow-sm transition-transform hover:scale-[1.01]"
                    >
                      <img
                        src={heroAmberImg}
                        alt="Séries de força"
                        className="h-full w-full scale-[1.16] object-cover object-center transition-transform duration-300 group-hover:scale-[1.2]"
                      />
                      <span className="absolute left-2.5 top-2.5 rounded-lg bg-black/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur-xs">
                        Séries
                      </span>
                      <span className="absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-[#D97706] shadow-xs">
                        <ChevronDown className="h-4 w-4" />
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        recommendedWorkout ? setTutorialWorkout(recommendedWorkout) : handleStartPrototype(0)
                      }
                      className="group relative h-36 overflow-hidden rounded-2xl bg-gradient-to-br from-[#DCF8EE] to-[#B6EFE0] text-left shadow-sm transition-transform hover:scale-[1.01]"
                    >
                      <img
                        src={heroMintImg}
                        alt="Movimento guiado"
                        className="h-full w-full object-cover object-center transition-transform duration-300 group-hover:scale-105"
                      />
                      <span className="absolute left-2.5 top-2.5 rounded-lg bg-white/85 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#0F2A2A] shadow-xs backdrop-blur-xs">
                        Guia 2D
                      </span>
                      <div className="absolute bottom-2.5 left-2.5 rounded-xl bg-white/95 px-2.5 py-1 shadow-xs">
                        <p className="font-mono text-[10px] font-bold text-[#D97706]">3s · 10x</p>
                        <p className="text-[9px] font-semibold text-[#5C7B79]">Ritmo guiado</p>
                      </div>
                      <span className="absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-full bg-[#12BFA3] text-white shadow-xs">
                        <Play className="h-3.5 w-3.5 fill-current" />
                      </span>
                    </button>
                  </div>
                </div>

                {/* CTA Largo Esmeralda */}
                <button
                  type="button"
                  onClick={() => handleStartPrototype(0)}
                  className="mt-5 flex min-h-[48px] w-full items-center justify-center gap-2.5 rounded-2xl bg-[#15C8AA] px-6 py-3.5 text-sm font-bold text-[#062924] shadow-sm transition-colors hover:bg-[#10B599]"
                >
                  <Play className="h-4 w-4 fill-current" />
                  Testar sequência (3 exercícios)
                </button>

                {/* 3 Cards Inferiores dentro do Hero */}
                <div className="mt-5 grid grid-cols-1 gap-3.5 sm:grid-cols-3">
                  {/* Card 1: Agachamento com imagem amber */}
                  <button
                    type="button"
                    onClick={() => handleStartPrototype(0)}
                    className="group flex overflow-hidden rounded-2xl border border-[#F2E5CF] bg-[#FFFCF7] text-left transition-all hover:border-[#F59E2D] hover:shadow-sm"
                  >
                    <div className="flex min-w-0 flex-1 flex-col justify-between p-3.5">
                      <div>
                        <p className="font-mono text-[11px] font-bold text-[#0C947E]">
                          01 · {prototypeExercises[0].reps_or_duration}
                        </p>
                        <p className="mt-1 line-clamp-2 text-sm font-bold leading-snug text-[#0F2A2A]">
                          {prototypeExercises[0].name}
                        </p>
                      </div>
                      <p className="mt-2 truncate text-[11px] text-[#5C7B79]">
                        {prototypeExercises[0].muscle_group}
                      </p>
                    </div>
                    <div className="w-24 shrink-0 overflow-hidden bg-gradient-to-br from-[#FFB03B] to-[#F27D16]">
                      <img
                        src={squatAmberImg}
                        alt={prototypeExercises[0].name}
                        className="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-105"
                      />
                    </div>
                  </button>

                  {/* Card 2: Flexão de braço com barra de progresso */}
                  <button
                    type="button"
                    onClick={() => handleStartPrototype(1)}
                    className="group flex flex-col justify-between rounded-2xl border border-[#E1EEE9] bg-white p-3.5 text-left transition-all hover:border-[#12BFA3] hover:shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-mono text-[11px] font-bold text-[#0C947E]">
                        02 · {prototypeExercises[1].reps_or_duration}
                      </p>
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#FFF4E2] text-[#D97706]">
                        <ChevronDown className="h-3.5 w-3.5" />
                      </span>
                    </div>
                    <div className="mt-1">
                      <p className="line-clamp-1 text-sm font-bold text-[#0F2A2A]">
                        {prototypeExercises[1].name}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-[#5C7B79]">
                        {prototypeExercises[1].muscle_group}
                      </p>
                    </div>
                    <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[#EEF5F2]">
                      <div className="h-full w-2/3 rounded-full bg-[#F59E2D]" />
                    </div>
                  </button>

                  {/* Card 3: Abdominal em Laranja Vibrante */}
                  <button
                    type="button"
                    onClick={() => handleStartPrototype(2)}
                    className="group flex flex-col justify-between rounded-2xl bg-gradient-to-br from-[#FFB03B] to-[#F58516] p-3.5 text-left text-white shadow-sm transition-all hover:brightness-105"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] font-bold uppercase tracking-wide text-white/95">
                        03 · {prototypeExercises[2].reps_or_duration}
                      </span>
                      <span className="font-mono text-[11px] font-bold text-white/90">100%</span>
                    </div>
                    <div className="mt-1">
                      <p className="line-clamp-1 text-sm font-bold text-white">
                        {prototypeExercises[2].name}
                      </p>
                    </div>
                    <div className="mt-2.5 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="w-8 font-mono text-[10px] font-semibold text-white/90">Core</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/30">
                          <div className="h-full w-4/5 rounded-full bg-white" />
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-8 font-mono text-[10px] font-semibold text-white/90">Ritmo</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/30">
                          <div className="h-full w-3/5 rounded-full bg-white" />
                        </div>
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Card Inferior Esquerdo: Treino Recomendado para Hoje */}
              <div className="flex flex-col justify-between rounded-3xl border border-[#E1EEE9] bg-white p-6 shadow-[0_10px_28px_-14px_rgba(15,42,42,0.08)]">
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-[#0C947E]">
                      Treino recomendado para hoje
                    </span>
                    <div className="flex items-center gap-2 font-mono text-xs text-[#5C7B79]">
                      {recommendedWorkout && (
                        <span>
                          {recommendedWorkout.duration_minutes} min · ~{recommendedWorkout.estimated_calories} kcal
                        </span>
                      )}
                      {trainingPlan && (
                        <span className="rounded-lg bg-[#F4FAF7] px-2 py-0.5 text-[#0F2A2A]">
                          Dia {trainingPlan.current_day}/{trainingPlan.duration_days}
                        </span>
                      )}
                    </div>
                  </div>

                  {recommendedWorkout ? (
                    <>
                      <h3 className="mt-2 font-display text-2xl font-bold text-[#0F2A2A]">
                        {recommendedWorkout.title}
                      </h3>
                      <p className="mt-1.5 max-w-2xl text-sm text-[#4B6B68]">
                        {recommendedWorkout.description}
                      </p>

                      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <div className="rounded-2xl border border-[#E1EEE9] bg-[#F4FAF7] p-3">
                          <p className="text-[11px] font-medium text-[#5C7B79]">Tempo estimado</p>
                          <p className="mt-1 font-mono text-base font-bold text-[#0F2A2A] tabular-nums">
                            {recommendedWorkout.duration_minutes} min
                          </p>
                        </div>
                        <div className="rounded-2xl border border-[#E1EEE9] bg-[#F4FAF7] p-3">
                          <p className="text-[11px] font-medium text-[#5C7B79]">Exercícios</p>
                          <p className="mt-1 font-mono text-base font-bold text-[#0F2A2A] tabular-nums">
                            {totalExercisesInRecommended} movs
                          </p>
                        </div>
                        <div className="rounded-2xl border border-[#BCE6DC] bg-[#EAF9F4] p-3">
                          <p className="text-[11px] font-medium text-[#0B7C6A]">Dificuldade</p>
                          <p className="mt-1 text-base font-bold text-[#0C947E]">
                            {WORKOUT_LEVEL_LABELS[recommendedWorkout.level]}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-[#F7E3C4] bg-[#FFF9F0] p-3">
                          <p className="text-[11px] font-medium text-[#9A5B13]">Gasto estimado</p>
                          <p className="mt-1 font-mono text-base font-bold text-[#D97706] tabular-nums">
                            ~{recommendedWorkout.estimated_calories} kcal
                          </p>
                        </div>
                      </div>
                    </>
                  ) : null}
                </div>

                {recommendedWorkout && (
                  <div className="mt-5 flex flex-wrap items-center gap-3">
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
                      className="inline-flex flex-1 items-center justify-center gap-2.5 rounded-2xl bg-[#15C8AA] px-6 py-3.5 text-sm font-bold tracking-wide text-[#062924] shadow-sm transition-colors hover:bg-[#10B599] sm:flex-none"
                    >
                      <Play className="h-4 w-4 fill-current" />
                      INICIAR TREINO
                    </button>
                    <button
                      type="button"
                      onClick={() => setTutorialWorkout(recommendedWorkout)}
                      className="inline-flex items-center gap-2 rounded-2xl border border-[#D3E5DF] bg-[#F4FAF7] px-4 py-3.5 text-xs font-semibold text-[#0F2A2A] transition-colors hover:border-[#12BFA3] hover:bg-[#E7F4EF]"
                    >
                      <Film className="h-4 w-4 text-[#0C947E]" />
                      Ver modelos 3D
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Coluna Direita (4 cols): Calendário + Gráfico Duplo "Treino" + Resumo */}
            <div className="space-y-5 lg:col-span-4">
              {/* 1. Calendário Mensal Compacto */}
              <div className="rounded-3xl border border-[#E1EEE9] bg-white p-5 shadow-[0_10px_28px_-14px_rgba(15,42,42,0.08)]">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="flex items-center gap-2 text-sm font-bold text-[#0F2A2A]">
                      <Calendar className="h-4 w-4 text-[#0C947E]" />
                      <span className="capitalize">{monthCalendar.monthLabel}</span>
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSubTab('custom')}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#E1EEE9] bg-[#F4FAF7] text-[#5C7B79] hover:text-[#0F2A2A]"
                    title="Configurar lembretes e preferências"
                    aria-label="Configurar lembretes"
                  >
                    <Settings className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Mini Calendário Mensal */}
                <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px]">
                  {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => (
                    <div key={i} className="py-1 font-semibold text-[#648482]">
                      {d}
                    </div>
                  ))}
                  {monthCalendar.cells.map((c, idx) =>
                    c.day === null ? (
                      <div key={idx} />
                    ) : (
                      <div
                        key={c.iso}
                        className={`relative rounded-lg py-1.5 font-mono text-xs tabular-nums ${
                          c.active
                            ? 'bg-[#15C8AA] font-bold text-[#062924]'
                            : c.isToday
                              ? 'font-bold text-[#0F2A2A]'
                              : 'text-[#4B6B68]'
                        }`}
                      >
                        {c.day}
                        {c.isToday && !c.active && (
                          <span className="absolute bottom-0.5 left-1/2 h-[2.5px] w-4 -translate-x-1/2 rounded-full bg-[#F59E2D]" />
                        )}
                      </div>
                    )
                  )}
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-[#E1EEE9] pt-2.5 text-xs text-[#5C7B79]">
                  <span>
                    Semana: <strong className="font-mono text-[#0F2A2A]">{stats?.weekly_frequency || 0} dias</strong>
                  </span>
                  <span>
                    Total: <strong className="font-mono text-[#0C947E]">{stats?.total_workouts || 0} treinos</strong>
                  </span>
                </div>
              </div>

              {/* 2. Card Gráfico Duplo "Treino" (Barras Esmeralda + Laranja como na referência) */}
              <div className="rounded-3xl border border-[#E1EEE9] bg-white p-5 shadow-[0_10px_28px_-14px_rgba(15,42,42,0.08)]">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-base font-bold text-[#0F2A2A]">Treino</h3>
                  <span className="inline-flex items-center gap-1.5 font-mono text-xs font-bold text-[#0F2A2A] tabular-nums">
                    <span className="h-2 w-2 rounded-full bg-[#F59E2D]" />
                    {Math.min(100, Math.round(((stats?.weekly_frequency || 0) / 5) * 100))}%
                  </span>
                </div>

                {(() => {
                  const series = stats?.weekly_series || [];
                  const maxVal = Math.max(...series.map((d) => d.minutes), 30);
                  const peakDay = series.reduce(
                    (best, cur) => (cur.minutes >= best.minutes ? cur : best),
                    series[0] || { label: 'HOJE', minutes: 0 }
                  );
                  return (
                    <div className="mt-4">
                      <div className="flex h-32 items-end justify-between gap-2 pt-5">
                        {(series.length > 0
                          ? series
                          : ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((l, i) => ({
                              date: `d-${i}`,
                              label: l,
                              minutes: 0,
                              calories: 0,
                              sessions: 0,
                            }))
                        ).map((day, idx) => {
                          const greenPct = day.minutes > 0 ? Math.max(22, Math.round((day.minutes / maxVal) * 100)) : 28 + ((idx * 17) % 36);
                          const amberPct = day.calories > 0 ? Math.max(18, Math.round((day.minutes / maxVal) * 82)) : 18 + ((idx * 13) % 45);
                          const isPeak = day.label === peakDay.label && peakDay.minutes > 0;
                          const muted = day.minutes === 0;
                          return (
                            <div key={day.date} className="relative flex flex-1 flex-col items-center gap-1.5">
                              {isPeak && (
                                <span className="absolute -top-5 rounded-md bg-[#FFF4E2] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#D97706]">
                                  {day.minutes}m
                                </span>
                              )}
                              <div className="flex h-20 items-end gap-[3px]">
                                <div
                                  style={{ height: `${greenPct}%` }}
                                  className={`w-2 rounded-full transition-all ${
                                    muted ? 'bg-[#15C8AA]/35' : 'bg-[#15C8AA]'
                                  }`}
                                />
                                <div
                                  style={{ height: `${amberPct}%` }}
                                  className={`w-2 rounded-full transition-all ${
                                    muted ? 'bg-[#FFA22B]/40' : 'bg-[#FFA22B]'
                                  }`}
                                />
                              </div>
                              <span className="font-mono text-[10px] font-semibold uppercase text-[#648482]">
                                {day.label.slice(0, 3)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* 3. Card Resumo Rápido Inferior */}
              <div className="rounded-3xl border border-[#E1EEE9] bg-white p-5 shadow-[0_10px_28px_-14px_rgba(15,42,42,0.08)]">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-[#5C7B79]">Resumo semanal</span>
                  <button
                    type="button"
                    onClick={() => setSubTab('evolution')}
                    className="font-semibold text-[#0C947E] hover:underline"
                  >
                    Ver gráficos
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-2xl bg-[#F4FAF7] p-2.5">
                    <p className="font-mono text-base font-bold text-[#0F2A2A] tabular-nums">
                      {profile?.current_weight_kg ? `${profile.current_weight_kg.toFixed(1)}kg` : '—'}
                    </p>
                    <p className="text-[10px] text-[#5C7B79]">Peso atual</p>
                  </div>
                  <div className="rounded-2xl bg-[#F4FAF7] p-2.5">
                    <p className="font-mono text-base font-bold text-[#0C947E] tabular-nums">
                      {stats?.total_minutes || 0}m
                    </p>
                    <p className="text-[10px] text-[#5C7B79]">Minutos</p>
                  </div>
                  <div className="rounded-2xl bg-[#FFF9F0] p-2.5">
                    <p className="font-mono text-base font-bold text-[#D97706] tabular-nums">
                      {stats?.total_calories || 0}
                    </p>
                    <p className="text-[10px] text-[#9A5B13]">kcal</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* 10 Categorias de Exercícios */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-lg font-bold text-[#0F2A2A]">Categorias de treino</h3>
              <button
                type="button"
                onClick={() => setSelectedCategory('Todas')}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                  selectedCategory === 'Todas'
                    ? 'bg-[#15C8AA] text-[#062924] shadow-sm'
                    : 'border border-[#D3E5DF] bg-white text-[#4B6B68] hover:bg-[#F4FAF7]'
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
                        ? 'border-[#12BFA3] bg-[#E3F7F2] shadow-sm'
                        : 'border-[#E1EEE9] bg-white hover:border-[#B6DCD1]'
                    }`}
                  >
                    <div>
                      <p className={`text-sm font-bold ${active ? 'text-[#0B7C6A]' : 'text-[#0F2A2A]'}`}>
                        {cat.name}
                      </p>
                      <p className="mt-1 line-clamp-2 text-[11px] text-[#5C7B79]">{cat.tagline}</p>
                    </div>
                    <p className="mt-3 font-mono text-[11px] font-semibold text-[#0C947E] tabular-nums">
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
              <h3 className="font-display text-lg font-bold text-[#0F2A2A]">
                {selectedCategory === 'Todas' ? 'Todos os programas disponíveis' : `Categoria: ${selectedCategory}`}
              </h3>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setOnlyFavorites((v) => !v)}
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    onlyFavorites
                      ? 'border-[#F7D79C] bg-[#FFF4E2] text-[#D97706]'
                      : 'border-[#DCECE6] bg-white text-[#4B6B68] hover:text-[#0F2A2A]'
                  }`}
                >
                  <Star className={`h-3.5 w-3.5 ${onlyFavorites ? 'fill-[#F59E2D] text-[#F59E2D]' : ''}`} />
                  Favoritos
                </button>

                <div className="flex items-center gap-1 rounded-2xl border border-[#DCECE6] bg-[#EDF7F3] p-1">
                  {(['all', 'iniciante', 'intermediario', 'avancado'] as const).map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setLevelFilter(lvl)}
                      className={`rounded-xl px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap ${
                        levelFilter === lvl
                          ? 'bg-[#15C8AA] text-[#062924] shadow-sm'
                          : 'text-[#4B6B68] hover:text-[#0F2A2A]'
                      }`}
                    >
                      {lvl === 'all' ? 'Todos' : WORKOUT_LEVEL_LABELS[lvl]}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {filteredWorkouts.length === 0 ? (
              <div className="rounded-3xl border border-[#E1EEE9] bg-white p-8 text-center text-sm text-[#5C7B79]">
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
                      className="flex flex-col justify-between rounded-3xl border border-[#E1EEE9] bg-white p-6 shadow-[0_10px_28px_-14px_rgba(15,42,42,0.08)] transition-colors hover:border-[#B6DCD1]"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 text-xs text-[#5C7B79]">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-[#0C947E]">{w.category}</span>
                            <span aria-hidden="true">·</span>
                            <span>{WORKOUT_LEVEL_LABELS[w.level]}</span>
                            {(w.is_custom || w.is_ai_generated) && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="font-semibold text-[#D97706]">{w.is_ai_generated ? 'IA' : 'Meu'}</span>
                              </>
                            )}
                          </div>
                          {(w.is_custom || w.is_ai_generated) && w.user_id && (
                            <button
                              type="button"
                              onClick={() => handleDeleteCustomWorkout(w.id)}
                              className="rounded-lg p-1 text-[#648482] hover:text-red-600"
                              title="Excluir treino personalizado"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>

                        <h4 className="mt-2 font-display text-lg font-bold text-[#0F2A2A]">{w.title}</h4>
                        <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-[#4B6B68]">
                          {w.description}
                        </p>

                        <div className="mt-4 flex items-center gap-4 border-t border-[#E1EEE9] pt-3 text-xs text-[#2E4A48]">
                          <span className="inline-flex items-center gap-1.5 font-mono tabular-nums">
                            <Clock className="h-3.5 w-3.5 text-[#5C7B79]" />
                            {w.duration_minutes} min
                          </span>
                          <span className="inline-flex items-center gap-1.5 font-mono tabular-nums">
                            <Flame className="h-3.5 w-3.5 text-[#F59E2D]" />
                            ~{w.estimated_calories} kcal
                          </span>
                          <span className="ml-auto font-medium text-[#5C7B79] tabular-nums">
                            {totalMoves} movs
                          </span>
                        </div>
                      </div>

                      <div className="mt-5 grid grid-cols-2 gap-2.5">
                        <button
                          type="button"
                          onClick={() => setTutorialWorkout(w)}
                          className="flex items-center justify-center gap-1.5 rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-3 py-2.5 text-xs font-semibold text-[#2E4A48] transition-colors hover:border-[#12BFA3] hover:text-[#0C947E]"
                        >
                          <Film className="h-3.5 w-3.5 text-[#0C947E]" />
                          Tutoriais 3D
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStartWorkout(w)}
                          className="flex items-center justify-center gap-1.5 rounded-xl bg-[#12BFA3] px-3 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#0EA88F]"
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
          <section className="rounded-3xl border border-[#E1EEE9] bg-white p-6 shadow-[0_10px_28px_-14px_rgba(15,42,42,0.08)]">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-xl font-bold text-[#0F2A2A]">
                  Planos Progressivos de 7 a 60 Dias
                </h2>
                <p className="mt-1 text-xs text-[#4B6B68]">
                  Cada plano organiza dias de treino com aquecimento + principais + alongamento, evolução gradual de volume e dias estratégicos de recuperação.
                </p>
              </div>
              {preferences && (
                <div className="rounded-xl border border-[#BCE6DC] bg-[#E3F7F2] px-3.5 py-2 text-xs">
                  <span className="text-[#4B6B68]">Adaptação automática: </span>
                  <strong className="font-mono text-[#0B7C6A]">{preferences.adaptive_multiplier.toFixed(2)}x</strong>
                </div>
              )}
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[#2E4A48]">Duração do plano</label>
                <div className="grid grid-cols-4 gap-2">
                  {([7, 14, 30, 60] as const).map((days) => (
                    <button
                      key={days}
                      type="button"
                      onClick={() => setPlanDaysChoice(days)}
                      className={`rounded-xl border py-2.5 font-mono text-xs font-semibold transition-colors ${
                        planDaysChoice === days
                          ? 'border-[#12BFA3] bg-[#E3F7F2] text-[#0B7C6A]'
                          : 'border-[#D3E5DF] bg-[#F4FAF7] text-[#4B6B68] hover:text-[#0F2A2A]'
                      }`}
                    >
                      {days}d
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[#2E4A48]">Nível de dificuldade</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['iniciante', 'intermediario', 'avancado'] as const).map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setPlanLevelChoice(lvl)}
                      className={`rounded-xl border py-2.5 text-xs font-semibold transition-colors ${
                        planLevelChoice === lvl
                          ? 'border-[#12BFA3] bg-[#E3F7F2] text-[#0B7C6A]'
                          : 'border-[#D3E5DF] bg-[#F4FAF7] text-[#4B6B68] hover:text-[#0F2A2A]'
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
                  className="w-full rounded-xl bg-[#12BFA3] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0EA88F] disabled:opacity-60"
                >
                  {creatingPlan ? 'Montando plano...' : `Ativar plano de ${planDaysChoice} dias`}
                </button>
              </div>
            </div>
          </section>

          {trainingPlan && (
            <section className="rounded-3xl border border-[#E1EEE9] bg-white p-6 shadow-[0_10px_28px_-14px_rgba(15,42,42,0.08)]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E1EEE9] pb-4">
                <div>
                  <h3 className="font-display text-lg font-bold text-[#0F2A2A]">{trainingPlan.title}</h3>
                  <p className="text-xs text-[#5C7B79]">
                    {trainingPlan.completed_days.length} de {trainingPlan.duration_days} dias concluídos · Dia atual: {trainingPlan.current_day}
                  </p>
                </div>
                <div className="w-48">
                  <div className="h-2.5 overflow-hidden rounded-full bg-[#E3EFEA]">
                    <div
                      className="h-full rounded-full bg-[#12BFA3]"
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
                      className={`flex flex-col justify-between rounded-2xl border p-4 transition-colors ${
                        isCurrent
                          ? 'border-[#12BFA3] bg-[#E3F7F2]'
                          : isDone
                            ? 'border-[#BCE6DC] bg-[#F2FBF8]'
                            : 'border-[#E1EEE9] bg-[#F8FCFA]'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-mono font-bold text-[#0C947E]">DIA {day.day_number}</span>
                          {isDone ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0C947E]">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Concluído
                            </span>
                          ) : day.is_rest_day ? (
                            <span className="text-[11px] font-semibold text-[#D97706]">Descanso ativo</span>
                          ) : (
                            <span className="font-mono text-[11px] text-[#5C7B79]">
                              {Math.round(day.intensity_multiplier * 100)}% carga
                            </span>
                          )}
                        </div>
                        <p className="mt-1.5 text-sm font-bold text-[#0F2A2A]">{day.title}</p>
                        <p className="mt-1 text-[11px] text-[#5C7B79]">{day.notes}</p>
                      </div>

                      <div className="mt-3 flex items-center justify-between border-t border-[#DCECE6] pt-2.5 text-xs">
                        <span className="font-mono text-[#4B6B68]">
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
                            className="rounded-xl bg-[#12BFA3] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#0EA88F]"
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
            <section className="rounded-3xl border border-[#E1EEE9] bg-white p-6 shadow-[0_10px_28px_-14px_rgba(15,42,42,0.08)] lg:col-span-5">
              <h2 className="font-display text-lg font-bold text-[#0F2A2A]">Preferências de Treino</h2>
              <p className="mt-1 text-xs text-[#5C7B79]">
                Ajuste nível, contagem inicial, descanso automático e áudio guia conforme sua rotina.
              </p>

              <div className="mt-5 space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-[#2E4A48]">Nível preferido</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['iniciante', 'intermediario', 'avancado'] as const).map((lvl) => (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => handleUpdatePreferences({ preferred_level: lvl })}
                        className={`rounded-xl border py-2 text-xs font-semibold ${
                          preferences.preferred_level === lvl
                            ? 'border-[#12BFA3] bg-[#E3F7F2] text-[#0B7C6A]'
                            : 'border-[#D3E5DF] bg-[#F4FAF7] text-[#4B6B68]'
                        }`}
                      >
                        {WORKOUT_LEVEL_LABELS[lvl]}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[#2E4A48]">Duração alvo</label>
                    <select
                      value={preferences.preferred_duration_min}
                      onChange={(e) =>
                        handleUpdatePreferences({ preferred_duration_min: Number(e.target.value) })
                      }
                      className="w-full rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-2.5 py-2 font-mono text-xs text-[#0F2A2A]"
                    >
                      {[15, 20, 25, 35, 45].map((m) => (
                        <option key={m} value={m}>
                          {m} min
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-[#2E4A48]">Preparação</label>
                    <select
                      value={preferences.countdown_seconds}
                      onChange={(e) =>
                        handleUpdatePreferences({ countdown_seconds: Number(e.target.value) })
                      }
                      className="w-full rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-2.5 py-2 font-mono text-xs text-[#0F2A2A]"
                    >
                      {[3, 5, 8, 10].map((s) => (
                        <option key={s} value={s}>
                          {s} seg
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-[#2E4A48]">Descanso padrão</label>
                    <select
                      value={preferences.rest_seconds}
                      onChange={(e) => handleUpdatePreferences({ rest_seconds: Number(e.target.value) })}
                      className="w-full rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-2.5 py-2 font-mono text-xs text-[#0F2A2A]"
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
                <div className="border-t border-[#E1EEE9] pt-4">
                  <p className="text-xs font-bold text-[#0F2A2A]">
                    Exercícios Favoritos ({preferences.favorite_exercise_ids.length})
                  </p>
                  {preferences.favorite_exercise_ids.length === 0 ? (
                    <p className="mt-1 text-xs text-[#5C7B79]">
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
                            className="inline-flex items-center gap-1 rounded-xl border border-[#F7D79C] bg-[#FFF4E2] px-2.5 py-1 text-[11px] font-semibold text-[#D97706]"
                          >
                            <Star className="h-3 w-3 fill-[#F59E2D] text-[#F59E2D]" />
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
            className="space-y-4 rounded-3xl border border-[#E1EEE9] bg-white p-6 shadow-[0_10px_28px_-14px_rgba(15,42,42,0.08)] lg:col-span-7"
          >
            <h2 className="font-display text-lg font-bold text-[#0F2A2A]">Montar meu próprio treino</h2>
            <p className="text-xs text-[#5C7B79]">
              Escolha os exercícios com modelo 3D, defina a categoria e salve na sua conta com aquecimento e alongamento inclusos.
            </p>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="sm:col-span-1">
                <label className="mb-1 block text-xs font-medium text-[#2E4A48]">Nome do treino</label>
                <input
                  type="text"
                  required
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  placeholder="Ex: Meu Treino de Core"
                  className="w-full rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-3 py-2 text-xs text-[#0F2A2A] placeholder-[#7C9A98] focus:border-[#12BFA3] focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-[#2E4A48]">Categoria</label>
                <select
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value as WorkoutCategoryName)}
                  className="w-full rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-3 py-2 text-xs text-[#0F2A2A]"
                >
                  {WORKOUT_CATEGORIES.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-[#2E4A48]">Nível</label>
                <select
                  value={customLevel}
                  onChange={(e) => setCustomLevel(e.target.value as WorkoutLevel)}
                  className="w-full rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-3 py-2 text-xs text-[#0F2A2A]"
                >
                  <option value="iniciante">Iniciante</option>
                  <option value="intermediario">Intermediário</option>
                  <option value="avancado">Avançado</option>
                </select>
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold text-[#2E4A48]">
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
                          ? 'border-[#12BFA3] bg-[#E3F7F2] text-[#0F2A2A]'
                          : 'border-[#DCECE6] bg-[#F4FAF7] text-[#4B6B68] hover:text-[#0F2A2A]'
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="truncate font-semibold">{ex.name}</div>
                        <div className="truncate text-[10px] text-[#5C7B79]">{ex.muscle_group}</div>
                      </div>
                      {picked && <Check className="h-3.5 w-3.5 shrink-0 text-[#0C947E]" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={savingCustom || !customTitle.trim() || selectedExerciseIds.length === 0}
                className="inline-flex items-center gap-2 rounded-xl bg-[#12BFA3] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0EA88F] disabled:opacity-60"
              >
                <Plus className="h-4 w-4" />
                {savingCustom ? 'Salvando treino...' : 'Salvar treino personalizado'}
              </button>
            </div>
          </form>

          {/* Gerador com Gemini IA */}
          <form
            onSubmit={handleGenerateWorkoutAI}
            className="flex flex-col justify-between rounded-3xl border border-[#E1EEE9] bg-white p-6 shadow-[0_10px_28px_-14px_rgba(15,42,42,0.08)] lg:col-span-12"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-display text-lg font-bold text-[#0F2A2A]">
                  Gerar treino completo com Inteligência Artificial (Gemini)
                </h3>
                <p className="mt-1 text-xs text-[#5C7B79]">
                  Cria automaticamente aquecimento, bloco principal com demonstrações 3D e alongamento final.
                </p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-4">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-[#2E4A48]">Objetivo ou grupo muscular</label>
                <input
                  type="text"
                  required
                  value={aiFocus}
                  onChange={(e) => setAiFocus(e.target.value)}
                  className="w-full rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-3.5 py-2.5 text-sm text-[#0F2A2A] focus:border-[#12BFA3] focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#2E4A48]">Duração</label>
                <select
                  value={aiDuration}
                  onChange={(e) => setAiDuration(Number(e.target.value))}
                  className="w-full rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-3.5 py-2.5 font-mono text-sm text-[#0F2A2A]"
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
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#12BFA3] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0EA88F] disabled:opacity-60"
                >
                  <Sparkles className="h-4 w-4" />
                  {generatingAI ? 'Gerando...' : 'Gerar com Gemini'}
                </button>
              </div>
            </div>

            {genError && (
              <p className="mt-3 rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
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
              <div key={kpi.label} className="rounded-3xl border border-[#E1EEE9] bg-white p-4 shadow-[0_8px_22px_-14px_rgba(15,42,42,0.08)]">
                <p className="text-xs font-medium text-[#5C7B79]">{kpi.label}</p>
                <p className="mt-1 font-mono text-2xl font-bold text-[#0F2A2A] tabular-nums">{kpi.value}</p>
              </div>
            ))}
          </section>

          {/* Gráficos Semanais & Mensais */}
          <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-[#E1EEE9] bg-white p-6 shadow-[0_10px_28px_-14px_rgba(15,42,42,0.08)]">
              <h3 className="mb-3 font-display text-base font-bold text-[#0F2A2A]">
                Atividade Semanal (Últimos 7 dias)
              </h3>
              <WeeklyWorkoutBarChart data={stats?.weekly_series || []} />
            </div>

            <div className="rounded-3xl border border-[#E1EEE9] bg-white p-6 shadow-[0_10px_28px_-14px_rgba(15,42,42,0.08)]">
              <h3 className="mb-3 font-display text-base font-bold text-[#0F2A2A]">
                Volume Mensal (Últimas 4 semanas)
              </h3>
              <MonthlyWorkoutChart data={stats?.monthly_series || []} />
            </div>
          </section>

          {/* Peso + Lembretes */}
          <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="rounded-3xl border border-[#E1EEE9] bg-white p-6 shadow-[0_10px_28px_-14px_rgba(15,42,42,0.08)] lg:col-span-6">
              <h3 className="mb-3 font-display text-base font-bold text-[#0F2A2A]">
                Evolução de Peso Corporal
              </h3>
              <WeightEvolutionChart
                data={weights}
                targetWeight={profile?.target_weight_kg || 72}
              />
            </div>

            {preferences && (
              <div className="rounded-3xl border border-[#E1EEE9] bg-white p-6 shadow-[0_10px_28px_-14px_rgba(15,42,42,0.08)] lg:col-span-6">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="flex items-center gap-2 font-display text-base font-bold text-[#0F2A2A]">
                      <Bell className="h-4 w-4 text-[#F59E2D]" />
                      Lembretes Personalizáveis
                    </h3>
                    <p className="mt-0.5 text-xs text-[#5C7B79]">
                      Configure horário de treino, frequência semanal e aviso de descanso.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleUpdatePreferences({ reminder_enabled: !preferences.reminder_enabled })}
                    className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold ${
                      preferences.reminder_enabled
                        ? 'bg-[#12BFA3] text-white'
                        : 'border border-[#D3E5DF] bg-[#F4FAF7] text-[#4B6B68]'
                    }`}
                  >
                    {preferences.reminder_enabled ? 'Ativado' : 'Desativado'}
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[#2E4A48]">Horário do treino</label>
                    <input
                      type="time"
                      value={preferences.reminder_time}
                      onChange={(e) => handleUpdatePreferences({ reminder_time: e.target.value })}
                      className="w-full rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-3 py-2 font-mono text-xs text-[#0F2A2A]"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[#2E4A48]">Horário de descanso</label>
                    <input
                      type="time"
                      value={preferences.rest_time_reminder}
                      onChange={(e) => handleUpdatePreferences({ rest_time_reminder: e.target.value })}
                      className="w-full rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-3 py-2 font-mono text-xs text-[#0F2A2A]"
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label className="mb-1 block text-xs font-medium text-[#2E4A48]">Frequência</label>
                    <select
                      value={preferences.reminder_frequency}
                      onChange={(e) =>
                        handleUpdatePreferences({
                          reminder_frequency: e.target.value as WorkoutPreferences['reminder_frequency'],
                        })
                      }
                      className="w-full rounded-xl border border-[#D3E5DF] bg-[#F4FAF7] px-2.5 py-2 text-xs text-[#0F2A2A]"
                    >
                      <option value="diario">Diário</option>
                      <option value="dias_selecionados">Dias selecionados</option>
                      <option value="alternado">Dia sim, dia não</option>
                    </select>
                  </div>
                </div>

                <div className="mt-4">
                  <p className="mb-2 text-xs font-medium text-[#2E4A48]">Dias da semana</p>
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
                          className={`rounded-xl border py-1.5 text-[11px] font-semibold ${
                            active
                              ? 'border-[#12BFA3] bg-[#E3F7F2] text-[#0B7C6A]'
                              : 'border-[#DCECE6] bg-[#F4FAF7] text-[#5C7B79]'
                          }`}
                        >
                          {d.short}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#E1EEE9] pt-3">
                  <button
                    type="button"
                    onClick={handleRequestNotifications}
                    className="rounded-xl border border-[#BCE6DC] bg-[#E3F7F2] px-3.5 py-2 text-xs font-semibold text-[#0B7C6A] hover:bg-[#D4F3EA]"
                  >
                    Ativar / testar notificações do sistema
                  </button>
                </div>

                {notifFeedback && (
                  <p className="mt-2.5 text-xs font-medium text-[#0C947E]">{notifFeedback}</p>
                )}
              </div>
            )}
          </section>

          {/* Histórico Completo */}
          <section className="rounded-3xl border border-[#E1EEE9] bg-white p-6 shadow-[0_10px_28px_-14px_rgba(15,42,42,0.08)]">
            <h3 className="font-display text-lg font-bold text-[#0F2A2A]">Histórico de sessões concluídas</h3>
            {logs.length === 0 ? (
              <p className="mt-3 text-sm text-[#5C7B79]">
                Nenhum treino registrado ainda. Conclua seu primeiro treino hoje mesmo!
              </p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-[#E1EEE9] text-xs text-[#5C7B79]">
                      <th className="py-2.5 pr-4 font-semibold">Data</th>
                      <th className="py-2.5 pr-4 font-semibold">Treino</th>
                      <th className="py-2.5 pr-4 text-right font-semibold">Exercícios</th>
                      <th className="py-2.5 pr-4 text-right font-semibold">Duração</th>
                      <th className="py-2.5 pr-4 text-right font-semibold">Sensação</th>
                      <th className="py-2.5 text-right font-semibold">Calorias</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EEF5F2]">
                    {logs.slice(0, 20).map((log) => (
                      <tr key={log.id} className="hover:bg-[#F4FAF7]/60">
                        <td className="py-2.5 pr-4 font-mono text-xs text-[#5C7B79] tabular-nums">
                          {formatDateBR(log.date)}
                        </td>
                        <td className="py-2.5 pr-4 font-semibold text-[#0F2A2A]">{log.workout_title}</td>
                        <td className="py-2.5 pr-4 text-right font-mono text-xs text-[#4B6B68] tabular-nums">
                          {log.exercises_completed}
                        </td>
                        <td className="py-2.5 pr-4 text-right font-mono text-xs text-[#2E4A48] tabular-nums">
                          {log.duration_minutes} min
                        </td>
                        <td className="py-2.5 pr-4 text-right text-xs capitalize text-[#5C7B79]">
                          {log.perceived_difficulty || 'ideal'}
                        </td>
                        <td className="py-2.5 text-right font-mono text-xs font-bold text-[#D97706] tabular-nums">
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
          initialCountdownSeconds={prototypeActive ? 3 : undefined}
          prototypeMode={prototypeActive}
          onUpdatePreferences={handleUpdatePreferences}
          onClose={() => {
            setActiveWorkout(null);
            setActivePlanContext(null);
            setPrototypeActive(false);
          }}
          onComplete={(sessionStats) => handleCompleteWorkout(activeWorkout, sessionStats)}
        />
      )}
    </div>
  );
}
