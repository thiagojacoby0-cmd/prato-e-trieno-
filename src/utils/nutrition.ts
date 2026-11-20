import type { ActivityLevel, BiologicalSex, GoalType, MealCategory, WorkoutLevel } from '../types/index.ts';

export interface NutritionTargets {
  bmr: number;
  tdee: number;
  daily_calorie_target: number;
  protein_target_g: number;
  carbs_target_g: number;
  fat_target_g: number;
  water_target_ml: number;
  bmi: number;
}

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentario: 1.2,
  leve: 1.375,
  moderado: 1.55,
  intenso: 1.725,
  atleta: 1.9,
};

export function calculateNutritionTargets(params: {
  age: number;
  sex: BiologicalSex;
  height_cm: number;
  current_weight_kg: number;
  activity_level: ActivityLevel;
  goal: GoalType;
}): NutritionTargets {
  const { age, sex, height_cm, current_weight_kg, activity_level, goal } = params;

  // Equação Mifflin-St Jeor
  const baseBmr = 10 * current_weight_kg + 6.25 * height_cm - 5 * age;
  const bmr = Math.round(sex === 'masculino' ? baseBmr + 5 : baseBmr - 161);
  const tdee = Math.round(bmr * (ACTIVITY_MULTIPLIERS[activity_level] ?? 1.45));

  let daily_calorie_target = tdee;
  let proteinPerKg = 1.8;
  let fatRatio = 0.25;

  if (goal === 'emagrecimento') {
    daily_calorie_target = Math.max(1250, Math.round(tdee - 450));
    proteinPerKg = 2.0;
    fatRatio = 0.25;
  } else if (goal === 'definicao') {
    daily_calorie_target = Math.max(1350, Math.round(tdee - 250));
    proteinPerKg = 2.1;
    fatRatio = 0.24;
  } else if (goal === 'hipertrofia') {
    daily_calorie_target = Math.round(tdee + 300);
    proteinPerKg = 2.0;
    fatRatio = 0.23;
  } else {
    daily_calorie_target = tdee;
    proteinPerKg = 1.6;
    fatRatio = 0.27;
  }

  const protein_target_g = Math.round(current_weight_kg * proteinPerKg);
  const proteinCalories = protein_target_g * 4;
  const fatCalories = Math.round(daily_calorie_target * fatRatio);
  const fat_target_g = Math.round(fatCalories / 9);
  const remainingCalories = Math.max(200, daily_calorie_target - proteinCalories - fatCalories);
  const carbs_target_g = Math.round(remainingCalories / 4);

  const water_target_ml = 2000;
  const heightMeters = height_cm / 100;
  const bmi = heightMeters > 0 ? Number((current_weight_kg / (heightMeters * heightMeters)).toFixed(1)) : 0;

  return {
    bmr,
    tdee,
    daily_calorie_target,
    protein_target_g,
    carbs_target_g,
    fat_target_g,
    water_target_ml,
    bmi,
  };
}

export function formatWaterLiters(ml: number): string {
  const liters = Math.max(0, Number(ml) || 0) / 1000;
  return `${liters.toLocaleString('pt-BR', {
    minimumFractionDigits: liters % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 2,
  })} L`;
}

export function getTodayISO(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60 * 1000);
  return local.toISOString().split('T')[0];
}

export function getLastNDaysISO(days: number): string[] {
  const list: string[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const offset = d.getTimezoneOffset();
    const local = new Date(d.getTime() - offset * 60 * 1000);
    list.push(local.toISOString().split('T')[0]);
  }
  return list;
}

export function formatShortWeekday(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
}

export function formatDateBR(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  if (!y || !m || !d) return dateStr;
  return `${d}/${m}/${y}`;
}

export const GOAL_LABELS: Record<GoalType, string> = {
  emagrecimento: 'Emagrecimento',
  definicao: 'Definição Muscular',
  hipertrofia: 'Ganho de Massa',
  saude: 'Saúde e Energia',
};

export const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentario: 'Sedentário (pouco movimento)',
  leve: 'Leve (1–2 treinos/semana)',
  moderado: 'Moderado (3–4 treinos/semana)',
  intenso: 'Intenso (5–6 treinos/semana)',
  atleta: 'Atleta (treino diário intenso)',
};

export const MEAL_CATEGORY_LABELS: Record<MealCategory, string> = {
  cafe: 'Café da Manhã',
  almoco: 'Almoço',
  lanche: 'Lanche',
  jantar: 'Jantar',
  ceia: 'Ceia',
};

export const WORKOUT_LEVEL_LABELS: Record<WorkoutLevel, string> = {
  iniciante: 'Iniciante',
  intermediario: 'Intermediário',
  avancado: 'Avançado',
};
