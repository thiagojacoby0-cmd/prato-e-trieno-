import type { GoalType, TrainingPlan, TrainingPlanDay, WorkoutCategoryName, WorkoutLevel } from '../types';
import { DEFAULT_WORKOUT_CATALOG } from '../database/seedWorkouts';

const GOAL_SPLIT_CYCLES: Record<string, WorkoutCategoryName[]> = {
  emagrecimento: ['Emagrecimento', 'Corpo inteiro', 'Cardio', 'Pernas', 'Abdômen', 'Glúteos'],
  ganho_massa: ['Peito', 'Costas', 'Pernas', 'Braços', 'Glúteos', 'Abdômen'],
  condicionamento: ['Cardio', 'Corpo inteiro', 'Abdômen', 'Emagrecimento', 'Pernas', 'Costas'],
  manutencao: ['Corpo inteiro', 'Alongamento', 'Abdômen', 'Pernas', 'Peito', 'Cardio'],
};

const LEVEL_REST_INTERVAL: Record<WorkoutLevel, number> = {
  iniciante: 4, // descanso no dia 4, 8, 12...
  intermediario: 5, // descanso no dia 5, 10...
  avancado: 6, // descanso no dia 6, 12...
};

export function generateTrainingSchedule(params: {
  durationDays: 7 | 14 | 30 | 60;
  level: WorkoutLevel;
  goal: GoalType | string;
}): TrainingPlanDay[] {
  const { durationDays, level, goal } = params;
  const cycle = GOAL_SPLIT_CYCLES[goal] || GOAL_SPLIT_CYCLES.emagrecimento;
  const restEvery = LEVEL_REST_INTERVAL[level] || 5;
  const schedule: TrainingPlanDay[] = [];

  let activeTrainingCounter = 0;

  for (let day = 1; day <= durationDays; day++) {
    const isRestDay = day % restEvery === 0 && day !== durationDays;
    const weekNumber = Math.ceil(day / 7);
    const progression = Number(Math.min(1.35, 1 + (weekNumber - 1) * 0.06).toFixed(2));

    if (isRestDay) {
      const recoveryWorkout = DEFAULT_WORKOUT_CATALOG.find((w) => w.id === 'wkt-alongamento-pos-treino')!;
      schedule.push({
        day_number: day,
        is_rest_day: true,
        title: `Dia ${day} · Descanso & Recuperação`,
        focus_category: 'Alongamento',
        workout_id: recoveryWorkout.id,
        duration_minutes: 12,
        estimated_calories: 70,
        intensity_multiplier: 1,
        notes: 'Dia estratégico para recuperação muscular. Faça o alongamento leve opcional de 12 minutos.',
      });
      continue;
    }

    const focusCategory = cycle[activeTrainingCounter % cycle.length];
    activeTrainingCounter++;

    const candidates = DEFAULT_WORKOUT_CATALOG.filter((w) => w.category === focusCategory);
    const matched =
      candidates.find((w) => w.level === level) ||
      candidates[activeTrainingCounter % Math.max(1, candidates.length)] ||
      DEFAULT_WORKOUT_CATALOG[0];

    const adjustedDuration = Math.round(matched.duration_minutes * progression);
    const adjustedCalories = Math.round(matched.estimated_calories * progression);

    schedule.push({
      day_number: day,
      is_rest_day: false,
      title: `Dia ${day} · ${matched.title}`,
      focus_category: focusCategory,
      workout_id: matched.id,
      duration_minutes: adjustedDuration,
      estimated_calories: adjustedCalories,
      intensity_multiplier: progression,
      notes: `Semana ${weekNumber} · Progressão ${Math.round((progression - 1) * 100)}% (Aquecimento + Principal + Alongamento)`,
    });
  }

  return schedule;
}

export function buildDefaultTrainingPlan(params: {
  userId: string;
  durationDays: 7 | 14 | 30 | 60;
  level: WorkoutLevel;
  goal: GoalType | string;
}): Omit<TrainingPlan, 'id'> {
  const levelLabel =
    params.level === 'iniciante' ? 'Iniciante' : params.level === 'intermediario' ? 'Intermediário' : 'Avançado';
  return {
    user_id: params.userId,
    title: `Desafio ${params.durationDays} Dias · ${levelLabel}`,
    duration_days: params.durationDays,
    level: params.level,
    goal: params.goal,
    current_day: 1,
    completed_days: [],
    schedule: generateTrainingSchedule({
      durationDays: params.durationDays,
      level: params.level,
      goal: params.goal,
    }),
    active: true,
    started_at: new Date().toISOString(),
  };
}
